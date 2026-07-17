//! Backup commands: list the rotating Claude-file snapshots / restore one.
//!
//! The backups store lives under `<app config dir>/backups/` — the SAME directory
//! the secret-free `core::backups` snapshot hook writes to before each switch.
//! A backup holds only Claude file CONTENT; the OS keyring is never part of it, so
//! nothing secret crosses this IPC boundary.

use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};

use crate::core::backups;
use crate::model::{BackupEntry, CoreError};

/// Resolve the cchive app config dir (the parent of the `backups/` store).
fn cchive_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, CoreError> {
    app.path()
        .app_config_dir()
        .map_err(|e| CoreError::Io(e.to_string()))
}

/// List the rotating Claude-file backups newest-first (timestamp + size + name).
/// On-disk effect: reads the `backups/` store; no credential I/O.
#[tauri::command]
pub fn list_backups<R: Runtime>(app: AppHandle<R>) -> Result<Vec<BackupEntry>, CoreError> {
    Ok(backups::list(&cchive_dir(&app)?))
}

/// Restore the backup `id` back to its original Claude file, snapshotting the
/// current state first so the pre-restore state stays recoverable.
/// On-disk effect: snapshots then atomically overwrites the original; no keyring I/O.
#[tauri::command]
pub fn restore_backup<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), CoreError> {
    backups::restore(&cchive_dir(&app)?, &id)?;
    crate::refresh_tray(&app);
    Ok(())
}
