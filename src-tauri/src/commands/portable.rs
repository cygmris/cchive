//! Portable export/import commands: write / read a single secret-free JSON file.
//!
//! The frontend obtains `path` from the dialog plugin (save for export, open for
//! import). `export_config` builds an `ExportDoc` from the Clavis files under the
//! app config dir and atomically writes it to `path`; `import_config` reads the
//! file, validates the header, and merges it back KEYLESS, returning the counts.
//! No secret crosses this boundary — see `core::portable` for the safety contract.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use crate::core::{atomic_fs, portable};
use crate::model::{CoreError, ImportSummary};

/// Resolve the Clavis app config dir (where the provider/pref/account files live).
fn config_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, CoreError> {
    app.path()
        .app_config_dir()
        .map_err(|e| CoreError::Io(e.to_string()))
}

/// Build a secret-free export and atomically write it as JSON to `path`.
/// On-disk effect: writes only `path`; reads the non-secret index/pref files;
/// the keyring is never touched.
#[tauri::command]
pub fn export_config<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), CoreError> {
    let doc = portable::build_export(&config_dir(&app)?)?;
    let bytes = serde_json::to_vec_pretty(&doc).map_err(CoreError::from)?;
    atomic_fs::atomic_write(Path::new(&path), &bytes, None)
}

/// Read a portable export from `path`, validate its header, and merge it back.
/// On-disk effect: reads `path`; creates/updates providers KEYLESS and applies the
/// allow-listed prefs under the app config dir; never writes a secret.
#[tauri::command]
pub fn import_config<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<ImportSummary, CoreError> {
    let value = atomic_fs::read_json_value(Path::new(&path))?;
    let doc = serde_json::from_value(value).map_err(CoreError::from)?;
    portable::apply_import(&config_dir(&app)?, &doc)
}
