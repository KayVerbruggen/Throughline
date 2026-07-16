mod storage;

use storage::WatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            storage::ensure_project,
            storage::scaffold_docs,
            storage::read_project,
            storage::write_artifact,
            storage::delete_artifact,
            storage::watch_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
