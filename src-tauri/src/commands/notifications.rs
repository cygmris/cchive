//! Notification commands: read the installed state, toggle a kind's marked hook
//! in `~/.claude/settings.json`, and fire a live test toast.
//!
//! `read_notification_state` / `set_notification` only ever touch `settings.json`
//! `hooks` (surgical, preserving the user's hooks + every other key); they never
//! read or write credentials or `mcpOAuth`. `test_notification` fires a desktop
//! notification through the Tauri notification plugin and writes nothing.

use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::NotificationExt;

use crate::core::notify_hook;
use crate::model::{CoreError, NotificationKind, NotificationState};

/// Derive which notification hooks are installed from `~/.claude/settings.json`.
/// On-disk effect: reads `settings.json`; writes nothing.
#[tauri::command]
pub fn read_notification_state() -> Result<NotificationState, CoreError> {
    notify_hook::read_state()
}

/// Install (`on`) or remove (`!on`) the cchive-marked hook for `kind`.
/// On-disk effect: backs up then atomically rewrites only the mapped `hooks`
/// event in `settings.json`, preserving the user's hooks + every other key.
#[tauri::command]
pub fn set_notification(kind: NotificationKind, on: bool) -> Result<(), CoreError> {
    notify_hook::set_enabled(kind, on)
}

/// Fire a live desktop notification for `kind` via the notification plugin so the
/// user can preview it. On-disk effect: none.
#[tauri::command]
pub fn test_notification<R: Runtime>(
    app: AppHandle<R>,
    kind: NotificationKind,
) -> Result<(), CoreError> {
    app.notification()
        .builder()
        .title("cchive")
        .body(notify_hook::message(kind))
        .show()
        .map_err(|e| CoreError::Io(e.to_string()))
}
