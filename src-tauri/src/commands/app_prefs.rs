//! App-level preference commands backed by the OS, not by Claude's files.
//!
//! Currently just the launch-at-login toggle over `tauri-plugin-autostart`
//! (`enable`/`disable`/`is_enabled`). Autostart state lives in the OS (a
//! LaunchAgent / registry entry / `.desktop` file), so these touch no
//! credentials and no `~/.claude` files. Desktop-only: the plugin (and its
//! `ManagerExt`) does not exist on mobile.

use tauri::{AppHandle, Runtime};
use tauri_plugin_autostart::ManagerExt;

use crate::model::CoreError;

/// Whether Clavis is registered to launch at login. Reads the OS autostart
/// entry; an unsupported environment reports `false` rather than erroring.
#[tauri::command]
pub fn get_autostart<R: Runtime>(app: AppHandle<R>) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

/// Register (`on`) or remove (`!on`) Clavis's own launch-at-login entry.
/// On-disk effect: only the OS autostart entry for this app; nothing else.
#[tauri::command]
pub fn set_autostart<R: Runtime>(app: AppHandle<R>, on: bool) -> Result<(), CoreError> {
    let manager = app.autolaunch();
    let result = if on {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|e| CoreError::Io(e.to_string()))
}
