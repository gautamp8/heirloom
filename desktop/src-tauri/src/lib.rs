use std::net::TcpListener;
use std::os::unix::process::CommandExt;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent, State};

/// Detach a sidecar from the GUI app's session so macOS doesn't show
/// a "generic exec" Dock tile for it.
fn detach_from_app_session(cmd: &mut Command) {
    cmd.process_group(0);
    cmd.stdin(Stdio::null());
}

/// Ask the OS for a free port. The listener is dropped immediately so
/// the spawned server can claim it.
fn pick_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
        .unwrap_or(3000)
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

#[tauri::command]
fn shutdown_children(state: State<'_, AppChildren>) {
    state.shutdown();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppChildren::default())
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
            let port = pick_free_port();
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

            // Poll until the bundled server answers, then pivot the
            // WebView from the static splash to the live Next.js app.
            let main_window = app.get_webview_window("main");
            let health_url = format!("{}/api/health", server_url);
            let nav_url = server_url.clone();
            std::thread::spawn(move || {
                for _ in 0..240 {
                    if ureq::get(&health_url)
                        .timeout(Duration::from_millis(500))
                        .call()
                        .is_ok()
                    {
                        if let (Some(w), Ok(u)) =
                            (&main_window, url::Url::parse(&nav_url))
                        {
                            if w.navigate(u).is_err() {
                                let _ = w.eval(&format!(
                                    "location.replace('{}')",
                                    nav_url
                                ));
                            }
                        }
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(500));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![shutdown_children])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                app.state::<AppChildren>().shutdown();
            }
        });
}
