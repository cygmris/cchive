//! Provider commands: list, get, save (upsert), delete, apply, clear.
//!
//! The non-secret provider index lives in a Clavis-managed `providers.json` under
//! the app config dir (written via `core::providers` / `atomic_fs`); the auth token
//! lives in the OS keyring vault (`app.clavis.providers/<id>`). Every return here is
//! non-secret metadata or a token-free view — the token never crosses this IPC
//! boundary (it is composed in only when `apply` writes `settings.json`).

use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};

use crate::core::{paths, providers, switch};
use crate::model::{CoreError, ProviderConfigInput, ProviderConfigView, ProviderMeta};

/// The Clavis-managed provider index, next to the other Clavis store files.
const PROVIDERS_INDEX: &str = "providers.json";

/// Resolve the provider index path under the app config dir.
fn index_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, CoreError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| CoreError::Io(e.to_string()))?;
    Ok(dir.join(PROVIDERS_INDEX))
}

/// List configured API-provider presets as non-secret metadata.
/// On-disk effect: reads the provider index; no credential I/O.
#[tauri::command]
pub fn list_providers<R: Runtime>(app: AppHandle<R>) -> Result<Vec<ProviderMeta>, CoreError> {
    providers::list(&index_path(&app)?)
}

/// Read one provider as a token-free view (full payload + `hasToken`).
/// On-disk effect: reads the provider index + probes the vault for a token.
#[tauri::command]
pub fn get_provider<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<ProviderConfigView, CoreError> {
    providers::get(&index_path(&app)?, &id)
}

/// Create or replace a provider (upsert). `token` is `Some` only when the user
/// (re)types it; `None` leaves any existing vaulted token untouched. The token is
/// written to the vault — never to the index — and never echoed back.
/// On-disk effect: writes the provider index; (re)writes the keyring token if given.
#[tauri::command]
pub fn save_provider<R: Runtime>(
    app: AppHandle<R>,
    input: ProviderConfigInput,
    token: Option<String>,
) -> Result<ProviderConfigView, CoreError> {
    providers::upsert(&index_path(&app)?, input, token)
}

/// Delete a provider from the index and its vaulted token (idempotent).
/// On-disk effect: rewrites the provider index; deletes the keyring token.
#[tauri::command]
pub fn delete_provider<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), CoreError> {
    providers::delete(&index_path(&app)?, &id)
}

/// Activate a provider by id: compose its env (incl. the vaulted token) + config
/// keys and merge them into `~/.claude/settings.json`, preserving every other key.
/// On-disk effect: backs up then merges into `settings.json`; credentials untouched.
#[tauri::command]
pub fn apply_provider<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), CoreError> {
    providers::apply(&index_path(&app)?, &paths::settings_path(), &id)
}

/// Reset to the subscription by clearing ONLY the `env` block.
/// On-disk effect: backs up then removes the `env` block from `~/.claude/settings.json`,
/// preserving every other key.
#[tauri::command]
pub fn clear_provider() -> Result<(), CoreError> {
    switch::clear_provider()
}
