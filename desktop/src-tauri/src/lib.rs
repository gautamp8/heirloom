use std::net::TcpListener;
use std::os::unix::process::CommandExt;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, RunEvent, State};

/// Detach a sidecar from the GUI app's session so macOS doesn't show
/// a "generic exec" Dock tile for it.
fn detach_from_app_session(cmd: &mut Command) {
    cmd.process_group(0);
    cmd.stdin(Stdio::null());
}

/// Pick the highest-priority port from a small candidate list that
/// the splash also knows about. Using a known set lets the splash
/// discover the live server without an IPC round-trip, which is
/// fragile from plain HTML in Tauri 2 release builds.
fn pick_known_port() -> u16 {
    const CANDIDATES: &[u16] = &[47384, 47385, 47386, 47387];
    for p in CANDIDATES {
        if TcpListener::bind(("127.0.0.1", *p)).is_ok() {
            return *p;
        }
    }
    // Last-resort: ask the OS. Splash will probe and miss; user sees
    // the bundled-server error screen with a retry.
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
        .unwrap_or(47384)
}

#[derive(Default)]
struct AppChildren {
    children: Mutex<Vec<Child>>,
}

impl AppChildren {
    fn push(&self, c: Child) {
        if let Ok(mut v) = self.children.lock() {
            v.push(c);
        }
    }

    fn shutdown(&self) {
        if let Ok(mut v) = self.children.lock() {
            for mut c in v.drain(..) {
                let _ = c.kill();
                let _ = c.wait();
            }
        }
    }
}

#[derive(Default)]
struct ServerUrl(Mutex<String>);

#[tauri::command]
fn shutdown_children(state: State<'_, AppChildren>) {
    state.shutdown();
}

#[tauri::command]
fn get_server_url(state: State<'_, ServerUrl>) -> String {
    state.0.lock().map(|v| v.clone()).unwrap_or_default()
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    if let Some(children) = app.try_state::<AppChildren>() {
        children.shutdown();
    }
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppChildren::default())
        .manage(ServerUrl::default())
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .expect("could not resolve app data dir");
            std::fs::create_dir_all(&app_data).ok();

            let db_path = app_data.join("heirloom.sqlite");
            let blob_dir = app_data.join("blobs");
            std::fs::create_dir_all(&blob_dir).ok();

            // Reuse ~/.ollama/models so a fresh install doesn't re-pull
            // the gemma4 weights.
            let ollama_home = app
                .path()
                .home_dir()
                .map(|h| h.join(".ollama").join("models"))
                .unwrap_or_else(|_| app_data.join("ollama").join("models"));
            std::fs::create_dir_all(&ollama_home).ok();

            let bin_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_default();
            let ollama_bin = bin_dir.join("ollama");
            if ollama_bin.exists() {
                let mut cmd = Command::new(&ollama_bin);
                cmd.arg("serve")
                    .env("OLLAMA_HOST", "127.0.0.1:11434")
                    .env("OLLAMA_MODELS", ollama_home.to_string_lossy().to_string())
                    .env("OLLAMA_KEEP_ALIVE", "30m")
                    .env("OLLAMA_NUM_PARALLEL", "2")
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());
                detach_from_app_session(&mut cmd);
                if let Ok(child) = cmd.spawn() {
                    app.state::<AppChildren>().push(child);
                }
            }

            // Voice-cloning sidecar (optional). install-tts.sh writes
            // to ~/Library/Application Support/Heirloom/tts/.
            let tts_home = app
                .path()
                .home_dir()
                .ok()
                .map(|h| h.join("Library/Application Support/Heirloom/tts"))
                .unwrap_or_else(|| app_data.join("tts"));
            let tts_run = tts_home.join("run.sh");
            let bundled_server_py = bin_dir
                .parent()
                .map(|p| p.join("Resources/tts/server.py"))
                .unwrap_or_default();
            if tts_home.exists() && bundled_server_py.exists() {
                let target = tts_home.join("server.py");
                let should_copy = match (
                    std::fs::metadata(&bundled_server_py)
                        .and_then(|m| m.modified()),
                    std::fs::metadata(&target).and_then(|m| m.modified()),
                ) {
                    (Ok(src), Ok(dst)) => src > dst,
                    (Ok(_), Err(_)) => true,
                    _ => false,
                };
                if should_copy {
                    let _ = std::fs::copy(&bundled_server_py, &target);
                }
            }
            if tts_run.exists() {
                let mut cmd = Command::new("/bin/bash");
                cmd.arg(&tts_run)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());
                detach_from_app_session(&mut cmd);
                if let Ok(child) = cmd.spawn() {
                    app.state::<AppChildren>().push(child);
                }
            }

            let node_app = bin_dir
                .parent()
                .map(|p| p.join("Resources/server"))
                .unwrap_or_default();
            let node_bin = bin_dir.join("node");
            let port = pick_known_port();
            let server_url = format!("http://127.0.0.1:{}", port);
            let whisper_bin = bin_dir.join("whisper-cli");
            let whisper_model = bin_dir
                .parent()
                .map(|p| p.join("Resources/whisper-models/ggml-base.en.bin"))
                .unwrap_or_default();
            if node_app.exists() && node_bin.exists() {
                let mut cmd = Command::new(&node_bin);
                cmd.arg(node_app.join("server.js"))
                    .current_dir(&node_app)
                    .env("NODE_ENV", "production")
                    .env("HOSTNAME", "127.0.0.1")
                    .env("PORT", port.to_string())
                    .env("HEIRLOOM_BACKEND", "sqlite")
                    .env("HEIRLOOM_SQLITE_PATH", db_path.to_string_lossy().to_string())
                    .env("HEIRLOOM_BLOB_DIR", blob_dir.to_string_lossy().to_string())
                    .env("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
                    .env("HEIRLOOM_TTS_URL", "http://127.0.0.1:11435")
                    .env("HEIRLOOM_WHISPER_BIN", whisper_bin.to_string_lossy().to_string())
                    .env("HEIRLOOM_WHISPER_MODEL", whisper_model.to_string_lossy().to_string())
                    .env(
                        "JWT_SECRET",
                        std::env::var("JWT_SECRET")
                            .unwrap_or_else(|_| "desktop-local-secret".into()),
                    )
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());
                detach_from_app_session(&mut cmd);
                if let Ok(child) = cmd.spawn() {
                    app.state::<AppChildren>().push(child);
                }
            }

            // Publish the server URL so the splash SPA can read it
            // via the `get_server_url` command, run model setup, and
            // navigate to the live app when ready.
            if let Ok(mut url) = app.state::<ServerUrl>().0.lock() {
                *url = server_url;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            shutdown_children,
            get_server_url,
            quit_app,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                app.state::<AppChildren>().shutdown();
            }
        });
}
