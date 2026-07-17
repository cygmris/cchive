//! The narrow, typed Tauri command surface. Each command returns labels and
//! non-secret metadata only (`Result<_, CoreError>`); tokens never cross IPC.
//!
//! The non-secret account/provider *index* (labels, ordering, `lastUsed`) lives
//! in `tauri-plugin-store` JSON files — never the OS keyring (which holds only the
//! secret blobs). These helpers read/write that index from Rust so the typed IPC
//! surface is self-contained; secrets never pass through here.

pub mod accounts;
pub mod activity;
pub mod backups;
pub mod codex;
// Desktop-only: launch-at-login over tauri-plugin-autostart (no mobile backend).
#[cfg(desktop)]
pub mod app_prefs;
pub mod latency;
pub mod mcp;
pub mod memory;
pub mod notifications;
pub mod portable;
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

#[cfg(test)]
mod tests {
    /// The tray menu is a *snapshot*: it is built at startup and only rebuilt by
    /// the tray's own handlers. So any command that changes what the tray draws —
    /// the account/provider lists, or which row is live — must refresh it, or the
    /// tray keeps checking the row the user switched away from.
    ///
    /// `tray::menu_model` unit-tests the labelling/active matching; nothing but
    /// this can see whether the refresh is actually *wired* to each mutation.
    const TRAY_MUTATORS: &[(&str, &str)] = &[
        // Change the account list.
        ("accounts.rs", "add_account_from_active"),
        ("accounts.rs", "remove_account"),
        // Change which row is live.
        ("accounts.rs", "switch_account"),
        // Change the provider list.
        ("providers.rs", "save_provider"),
        ("providers.rs", "delete_provider"),
        // Flip the live kind (a live provider unchecks every account row).
        ("providers.rs", "apply_provider"),
        ("providers.rs", "clear_provider"),
    ];

    fn source(file: &str) -> &'static str {
        match file {
            "accounts.rs" => include_str!("accounts.rs"),
            "providers.rs" => include_str!("providers.rs"),
            other => panic!("no source registered for {other}"),
        }
    }

    /// The text of `pub fn <name>`, up to the next command (or end of file).
    fn command_body<'a>(src: &'a str, name: &str) -> &'a str {
        let start = src
            .find(&format!("pub fn {name}"))
            .unwrap_or_else(|| panic!("`pub fn {name}` not found — was it renamed?"));
        let rest = &src[start..];
        let end = rest.find("#[tauri::command]").unwrap_or(rest.len());
        &rest[..end]
    }

    #[test]
    fn commands_that_change_tray_state_refresh_the_tray() {
        for (file, name) in TRAY_MUTATORS {
            assert!(
                command_body(source(file), name).contains("refresh_tray"),
                "{file}::{name} changes what the tray shows but never calls refresh_tray \
                 — the tray menu will keep showing pre-mutation state"
            );
        }
    }
}
