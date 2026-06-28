//! The narrow, typed Tauri command surface. Each command returns labels and
//! non-secret metadata only (`Result<_, CoreError>`); tokens never cross IPC.
//!
//! The non-secret account/provider *index* (labels, ordering, `lastUsed`) lives
//! in `tauri-plugin-store` JSON files — never the OS keyring (which holds only the
//! secret blobs). These helpers read/write that index from Rust so the typed IPC
//! surface is self-contained; secrets never pass through here.

pub mod accounts;
pub mod activity;
pub mod mcp;
pub mod memory;
pub mod projects;
pub mod providers;
pub mod resources;
pub mod settings;
pub mod usage;

use serde::{de::DeserializeOwned, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use crate::model::CoreError;

/// Read a `Vec<T>` from `key` in the store file `file` (empty when absent/unset).
/// Pure read of the non-secret index; performs no credential I/O.
fn read_index<R: Runtime, T: DeserializeOwned>(
    app: &AppHandle<R>,
    file: &str,
    key: &str,
) -> Result<Vec<T>, CoreError> {
    let store = app.store(file).map_err(|e| CoreError::Io(e.to_string()))?;
    let list = store
        .get(key)
        .map(serde_json::from_value)
        .transpose()?
        .unwrap_or_default();
    Ok(list)
}

/// Overwrite `key` in the store file `file` with `list` and flush to disk.
fn write_index<R: Runtime, T: Serialize>(
    app: &AppHandle<R>,
    file: &str,
    key: &str,
    list: &[T],
) -> Result<(), CoreError> {
    let store = app.store(file).map_err(|e| CoreError::Io(e.to_string()))?;
    store.set(key, serde_json::to_value(list)?);
    store.save().map_err(|e| CoreError::Io(e.to_string()))
}
