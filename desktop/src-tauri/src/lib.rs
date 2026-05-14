use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent, State};

/// Long-lived child processes spawned at app startup (Ollama + the
/// embedded Next.js server). Kept here so we can SIGTERM them on app
/// exit; otherwise they'd outlive the window.
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

            // SQLite + blob storage under app-data so uninstall = delete
            let db_path = app_data.join("heirloom.sqlite");
            let blob_dir = app_data.join("blobs");
            std::fs::create_dir_all(&blob_dir).ok();

            // Reuse the user's existing ~/.ollama/models cache so a fresh
            // install of Heirloom doesn't have to re-pull gemma4:e4b
            // (~10 GB). The first user without Ollama gets a clean dir
            // populated under their home as Ollama's default.
            let ollama_home = app
                .path()
                .home_dir()
                .map(|h| h.join(".ollama").join("models"))
                .unwrap_or_else(|_| app_data.join("ollama").join("models"));
            std::fs::create_dir_all(&ollama_home).ok();

            // Spawn the bundled Ollama sidecar listening only on
            // localhost. Models cache under app_data/ollama so the
            // first-run pull persists across launches.
            let bin_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_default();
            let ollama_bin = bin_dir.join("ollama");
            log::info!("[heirloom] bin_dir={:?} ollama_bin exists={}", bin_dir, ollama_bin.exists());
            if ollama_bin.exists() {
                match Command::new(&ollama_bin)
                    .arg("serve")
                    .env("OLLAMA_HOST", "127.0.0.1:11434")
                    .env("OLLAMA_MODELS", ollama_home.to_string_lossy().to_string())
                    .env("OLLAMA_KEEP_ALIVE", "30m")
                    .env("OLLAMA_NUM_PARALLEL", "2")
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                {
                    Ok(child) => app.state::<AppChildren>().push(child),
                    Err(e) => log::error!("[heirloom] ollama spawn failed: {}", e),
                }
            }

            // Spawn the embedded Next.js standalone server. The bundle
            // pipeline copies `.next/standalone/` into Resources/server
            // and ships node as a sidecar alongside ollama.
            let node_app = bin_dir
                .parent()
                .map(|p| p.join("Resources/server"))
                .unwrap_or_default();
            let node_bin = bin_dir.join("node");
            log::info!(
                "[heirloom] node_bin exists={} node_app exists={}",
                node_bin.exists(),
                node_app.exists()
            );
            if node_app.exists() && node_bin.exists() {
                match Command::new(&node_bin)
                    .arg(node_app.join("server.js"))
                    .current_dir(&node_app)
                    .env("NODE_ENV", "production")
                    .env("HOSTNAME", "127.0.0.1")
                    .env("PORT", "3000")
                    .env("HEIRLOOM_BACKEND", "sqlite")
                    .env("HEIRLOOM_SQLITE_PATH", db_path.to_string_lossy().to_string())
                    .env("HEIRLOOM_BLOB_DIR", blob_dir.to_string_lossy().to_string())
                    .env("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
                    .env(
                        "JWT_SECRET",
                        std::env::var("JWT_SECRET")
                            .unwrap_or_else(|_| "desktop-local-secret".into()),
                    )
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                {
                    Ok(child) => app.state::<AppChildren>().push(child),
                    Err(e) => log::error!("[heirloom] node spawn failed: {}", e),
                }
            }

            // Poll the bundled server until it answers, then point the
            // window at it. Runs in a background thread so the setup
            // callback returns immediately.
            let main_window = app.get_webview_window("main");
            std::thread::spawn(move || {
                for _ in 0..240 {
                    if ureq::get("http://127.0.0.1:3000/api/health")
                        .timeout(Duration::from_millis(500))
                        .call()
                        .is_ok()
                    {
                        if let Some(w) = &main_window {
                            if let Ok(url) = "http://127.0.0.1:3000/".parse() {
                                let _ = w.navigate(url);
                            }
                        }
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(500));
                }
                log::warn!("[heirloom] embedded server never came up");
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
