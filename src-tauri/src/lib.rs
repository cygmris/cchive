//! Clavis backend entry point.
//!
//! S1 keeps the Rust side intentionally minimal: open the window, register the
//! single-instance guard (first) and the store plugin (for non-secret prefs).
//! Privileged services (atomic FS, OS keyring, Claude config editing, tray)
//! arrive in later specs.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single-instance must be the FIRST plugin registered; on a second launch
    // it focuses the existing window instead of spawning a duplicate.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        // Non-secret key/value store (UI prefs, account metadata, ordering).
        .plugin(tauri_plugin_store::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running the Clavis application");
}
