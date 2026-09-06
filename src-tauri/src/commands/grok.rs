//! Grok account commands: list, active identity, add-from-active, switch, remove.
//!
//! Same SAFETY CONTRACT as the Claude/Codex account commands: every return
//! carries labels + non-secret metadata only; the `auth.json` payload (`key` /
//! `refresh_token`) stays in the Rust core and never crosses this IPC boundary.

use tauri::{AppHandle, Runtime};

use super::{read_index, write_index};
use crate::core::grok;
use crate::model::{CoreError, GrokAccountMeta, GrokIdentity};

/// Store file + key holding the non-secret Grok account index (no tokens).
const GROK_ACCOUNTS_FILE: &str = "cchive-grok-accounts.json";
const GROK_ACCOUNTS_KEY: &str = "grokAccounts";

/// List saved Grok accounts as non-secret metadata.
/// On-disk effect: reads the Grok index from the cchive store; no auth I/O.
#[tauri::command]
pub fn list_grok_accounts<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<GrokAccountMeta>, CoreError> {
    read_index(&app, GROK_ACCOUNTS_FILE, GROK_ACCOUNTS_KEY)
}

/// Report the active Grok identity (label/email/plan/expiry).
/// On-disk effect: reads `~/.grok/auth.json` and the billing log tail; writes nothing.
#[tauri::command]
pub fn get_active_grok_identity() -> Result<GrokIdentity, CoreError> {
    grok::read_active_grok_identity()
}

/// Capture the currently-signed-in Grok account into the vault and the index.
/// On-disk effect: writes the secret `auth.json` payload to the OS keyring
/// (`app.cchive.grok.accounts`) and upserts the non-secret meta into the store.
#[tauri::command]
pub fn add_grok_account_from_active<R: Runtime>(
    app: AppHandle<R>,
) -> Result<GrokAccountMeta, CoreError> {
    let meta = grok::add_grok_account_from_active()?;
    let mut accounts: Vec<GrokAccountMeta> =
        read_index(&app, GROK_ACCOUNTS_FILE, GROK_ACCOUNTS_KEY)?;
    accounts.retain(|a| a.id != meta.id);
    accounts.push(meta.clone());
    write_index(&app, GROK_ACCOUNTS_FILE, GROK_ACCOUNTS_KEY, &accounts)?;
    Ok(meta)
}

/// Switch the active Grok account to `id`.
/// On-disk effect: backs up then atomically rewrites `~/.grok/auth.json`;
/// rolls back on any failure. Touches no Claude/Codex file and no Grok config.
#[tauri::command]
pub fn switch_grok_account(id: String) -> Result<GrokIdentity, CoreError> {
    grok::switch_grok_account(&id)
}

/// Remove a saved Grok account from the vault and the index.
/// On-disk effect: deletes the secret from the OS keyring and drops the matching
/// meta from the store; the live `~/.grok/auth.json` is untouched.
#[tauri::command]
pub fn remove_grok_account<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), CoreError> {
    grok::remove_grok_account(&id)?;
    let mut accounts: Vec<GrokAccountMeta> =
        read_index(&app, GROK_ACCOUNTS_FILE, GROK_ACCOUNTS_KEY)?;
    accounts.retain(|a| a.id != id);
    write_index(&app, GROK_ACCOUNTS_FILE, GROK_ACCOUNTS_KEY, &accounts)
}
