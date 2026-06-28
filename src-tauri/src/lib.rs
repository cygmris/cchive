//! Clavis backend entry point.
//!
//! S1 keeps the Rust side intentionally minimal: open the window, register the
//! single-instance guard (first) and the store plugin (for non-secret prefs).
//! S14 adds the system-tray quick-switch (desktop only).

mod commands;
mod core;
mod model;
#[cfg(desktop)]
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single-instance must be the FIRST plugin registered; on a second launch
    // it focuses the existing window instead of spawning a duplicate.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
                tray::show_main_window(app);
            }))
            // Launch-at-login: a LaunchAgent on macOS (the default launcher);
            // `--autostart` lets the app tell a login-triggered start apart later.
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--autostart"]),
            ));
    }

    builder
        // Non-secret key/value store (UI prefs, account metadata, ordering).
        .plugin(tauri_plugin_store::Builder::new().build())
        // Desktop notifications for the Notifications screen's Test action.
        .plugin(tauri_plugin_notification::init())
        // Opens the "Report an issue" link (Settings) in the default browser.
        .plugin(tauri_plugin_opener::init())
        // Build the system tray (icon + dynamic quick-switch menu) once the app
        // is ready. Desktop only; tray actions reuse the safe core::switch path.
        .setup(|app| {
            #[cfg(desktop)]
            tray::build_tray(app.handle())?;
            Ok(())
        })
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
            commands::mcp::list_mcp_servers,
            commands::mcp::save_mcp_server,
            commands::mcp::delete_mcp_server,
            commands::mcp::set_mcp_enabled,
            commands::resources::list_resources,
            commands::resources::get_resource,
            commands::resources::save_resource,
            commands::resources::delete_resource,
            commands::resources::set_skill_enabled,
            commands::settings::read_settings_summary,
            commands::settings::detect_env_overrides,
            commands::usage::read_usage,
            commands::memory::read_memory,
            commands::memory::write_memory,
            commands::projects::list_projects,
            commands::projects::read_project_settings,
            commands::projects::write_project_settings,
            commands::activity::append_activity,
            commands::activity::read_activity,
            commands::notifications::read_notification_state,
            commands::notifications::set_notification,
            commands::notifications::test_notification,
            #[cfg(desktop)]
            commands::app_prefs::get_autostart,
            #[cfg(desktop)]
            commands::app_prefs::set_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Clavis application");
}
