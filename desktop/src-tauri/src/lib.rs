use std::net::TcpListener;
use std::os::unix::process::CommandExt;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent, State};

/// Sidecars are pure CLIs (ollama, node, python). Without this, macOS
/// treats them as children of the GUI app's session and shows a generic
/// "exec" icon for each in the Dock. `process_group(0)` makes the child
/// a new process group leader, detaching it from the app's job-control
/// session so LaunchServices ignores it.
fn detach_from_app_session(cmd: &mut Command) {
    cmd.process_group(0);
    cmd.stdin(Stdio::null());
}

/// Bind 127.0.0.1:0 to let the OS hand us an unused ephemeral port,
/// then drop the listener so the bundled node server can grab it.
/// Tiny race window between drop and rebind, but in practice the OS
/// reserves the port long enough for the spawned process to claim it.
fn pick_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
        .unwrap_or(3000)
}

/// Sidecar processes (Ollama, Next.js server, optional TTS) supervised
/// for the lifetime of the app window.
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

            // Reuse the user's existing ~/.ollama/models cache so a fresh
            // install doesn't have to re-pull the ~10 GB gemma4:e4b.
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
            eprintln!("[heirloom] bin_dir={:?} ollama_bin exists={}", bin_dir, ollama_bin.exists());
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
                match cmd.spawn() {
                    Ok(child) => app.state::<AppChildren>().push(child),
                    Err(e) => eprintln!("[heirloom] ollama spawn failed: {}", e),
                }
            }

            // Optional voice-cloning sidecar. Present iff the user has
            // run Contents/Resources/tts/install-tts.sh.
            let tts_run = app_data.join("tts").join("run.sh");
            eprintln!("[heirloom] tts_run exists={}", tts_run.exists());
            if tts_run.exists() {
                let mut cmd = Command::new("/bin/bash");
                cmd.arg(&tts_run)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());
                detach_from_app_session(&mut cmd);
                match cmd.spawn() {
                    Ok(child) => app.state::<AppChildren>().push(child),
                    Err(e) => eprintln!("[heirloom] tts spawn failed: {}", e),
                }
            }

            let node_app = bin_dir
                .parent()
                .map(|p| p.join("Resources/server"))
                .unwrap_or_default();
            let node_bin = bin_dir.join("node");
            let port = pick_free_port();
            let server_url = format!("http://127.0.0.1:{}", port);
            eprintln!(
                "[heirloom] node_bin exists={} node_app exists={} port={}",
                node_bin.exists(),
                node_app.exists(),
                port
            );
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
                    .env(
                        "JWT_SECRET",
                        std::env::var("JWT_SECRET")
                            .unwrap_or_else(|_| "desktop-local-secret".into()),
                    )
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());
                detach_from_app_session(&mut cmd);
                match cmd.spawn() {
                    Ok(child) => app.state::<AppChildren>().push(child),
                    Err(e) => eprintln!("[heirloom] node spawn failed: {}", e),
                }
            }

            // Poll the bundled server. We grabbed an ephemeral port so
            // collisions with other dev servers don't apply. Once it
            // answers, navigate the WebView away from the static splash
            // (desktop/dist/index.html) to the live Next.js app.
            let main_window = app.get_webview_window("main");
            let health_url = format!("{}/api/health", server_url);
            let nav_url = server_url.clone();
            std::thread::spawn(move || {
                for i in 0..240 {
                    match ureq::get(&health_url)
                        .timeout(Duration::from_millis(500))
                        .call()
                    {
                        Ok(_) => {
                            eprintln!("[heirloom] server up after {} polls, navigating to {}", i, nav_url);
                            if let Some(w) = &main_window {
                                match url::Url::parse(&nav_url) {
                                    Ok(u) => match w.navigate(u) {
                                        Ok(_) => eprintln!("[heirloom] navigate ok"),
                                        Err(e) => {
                                            eprintln!("[heirloom] navigate failed: {} — falling back to eval", e);
                                            let _ = w.eval(&format!("location.replace('{}')", nav_url));
                                        }
                                    },
                                    Err(e) => eprintln!("[heirloom] url parse failed: {}", e),
                                }
                            } else {
                                eprintln!("[heirloom] no main window handle");
                            }
                            return;
                        }
                        Err(e) => {
                            if i % 20 == 0 {
                                eprintln!("[heirloom] health poll {}: {}", i, e);
                            }
                        }
                    }
                    std::thread::sleep(Duration::from_millis(500));
                }
                eprintln!("[heirloom] embedded server never came up");
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
