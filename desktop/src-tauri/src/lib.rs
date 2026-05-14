use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
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
            let ollama_home = app_data.join("ollama");
            std::fs::create_dir_all(&ollama_home).ok();

            // Spawn the bundled Ollama sidecar listening only on
            // localhost. Models cache under app_data/ollama so the
            // first-run pull persists across launches.
            let bin_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_default();
            let ollama_bin = bin_dir.join("ollama-aarch64-apple-darwin");
            if ollama_bin.exists() {
                if let Ok(child) = Command::new(&ollama_bin)
                    .arg("serve")
                    .env("OLLAMA_HOST", "127.0.0.1:11434")
                    .env("OLLAMA_MODELS", ollama_home.to_string_lossy().to_string())
                    .env("OLLAMA_KEEP_ALIVE", "30m")
                    .env("OLLAMA_NUM_PARALLEL", "2")
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                {
                    app.state::<AppChildren>().push(child);
                }
            }

            // Spawn the embedded Next.js server. It lives in the
            // bundle's Resources/server next to `.next` and `node_modules`.
            // Phase 4 wires the actual bundling; for the `tauri dev` path
            // the user runs `pnpm start` separately and we just point
            // the window at it via devUrl in tauri.conf.json.
            let node_app = bin_dir
                .parent()
                .and_then(|p| Some(p.join("Resources/server")))
                .unwrap_or_default();
            let node_bin = bin_dir.join("node");
            if node_app.exists() && node_bin.exists() {
                if let Ok(child) = Command::new(&node_bin)
                    .arg(node_app.join("node_modules/next/dist/bin/next"))
                    .arg("start")
                    .arg("-H")
                    .arg("127.0.0.1")
                    .arg("-p")
                    .arg("3000")
                    .current_dir(&node_app)
                    .env("NODE_ENV", "production")
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
                    app.state::<AppChildren>().push(child);
                }
            }

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
