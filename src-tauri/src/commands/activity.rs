//! Activity commands: append/read the capped recent-activity feed.
//!
//! The log carries labels ONLY — `append_activity` records a display message
//! (e.g. "Switched account to Work"); a token is never written here. Touches ONLY
//! `<app-config>/activity.json`; no credential or `~/.claude*` file is read or
//! written.

use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};

use crate::core::activity;
use crate::model::{ActivityEntry, CoreError};

/// Resolve the app config dir (where the activity log lives).
fn config_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, CoreError> {
    app.path()
        .app_config_dir()
        .map_err(|e| CoreError::Io(e.to_string()))
}

/// Append a label-only `{ kind, message }` entry to the capped activity log.
/// On-disk effect: atomically rewrites `<app-config>/activity.json` (newest 50).
#[tauri::command]
pub fn append_activity<R: Runtime>(
    app: AppHandle<R>,
    kind: String,
    message: String,
) -> Result<(), CoreError> {
    activity::append(&config_dir(&app)?, &kind, &message)
}

/// Read up to `limit` activity entries, newest-first (empty when absent/corrupt).
/// On-disk effect: reads `<app-config>/activity.json`; writes nothing.
#[tauri::command]
pub fn read_activity<R: Runtime>(
    app: AppHandle<R>,
    limit: usize,
) -> Result<Vec<ActivityEntry>, CoreError> {
    Ok(activity::read(&config_dir(&app)?, limit))
}
