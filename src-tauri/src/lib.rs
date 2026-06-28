//! Clavis backend entry point.
//!
//! S1 keeps the Rust side intentionally minimal: open the window, register the
//! single-instance guard (first) and the store plugin (for non-secret prefs).
//! Privileged services (atomic FS, OS keyring, Claude config editing, tray)
//! arrive in later specs.

mod commands;
mod core;
mod model;

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
        // The narrow, typed command surface. Every return carries labels +
        // non-secret metadata only; tokens never cross IPC to the webview.
        .invoke_handler(tauri::generate_handler![
            commands::accounts::list_accounts,
            commands::accounts::get_active_identity,
            commands::accounts::add_account_from_active,
            commands::accounts::switch_account,
            commands::accounts::remove_account,
            commands::providers::list_providers,
            commands::providers::get_provider,
            commands::providers::save_provider,
            commands::providers::delete_provider,
            commands::providers::apply_provider,
            commands::providers::clear_provider,
            commands::settings::read_settings_summary,
            commands::settings::detect_env_overrides,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Clavis application");
}
