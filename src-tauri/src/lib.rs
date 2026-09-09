mod library;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(library::LibraryImportState::default())
        .setup(|app| {
            if let Err(error) = library::recover_library(app.handle()) {
                eprintln!("media library startup recovery failed: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library::begin_library_import,
            library::append_library_import,
            library::commit_library_import,
            library::abort_library_import,
            library::list_library_tracks,
            library::inspect_library_integrity,
            library::resolve_library_track,
            library::remove_library_track,
        ])
        .run(tauri::generate_context!())
        .expect("error while running media-player");
}
