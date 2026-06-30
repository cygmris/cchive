//! Codex account commands: list, active identity, add-from-active, switch, remove.
//!
//! Same SAFETY CONTRACT as the Claude account commands: every return carries
//! labels + non-secret metadata only; the `auth.json` payload (id_token / access /
//! refresh / API key) stays in the Rust core (the OS keyring + the on-disk file)
//! and never crosses this IPC boundary.

use tauri::{AppHandle, Runtime};

use super::{read_index, write_index};
use crate::core::codex;
use crate::model::{CodexAccountMeta, CodexIdentity, CoreError};

/// Store file + key holding the non-secret Codex account index (no tokens).
const CODEX_ACCOUNTS_FILE: &str = "cchive-codex-accounts.json";
const CODEX_ACCOUNTS_KEY: &str = "codexAccounts";

/// List saved Codex accounts as non-secret metadata.
/// On-disk effect: reads the Codex index from the cchive store; no auth I/O.
#[tauri::command]
pub fn list_codex_accounts<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<CodexAccountMeta>, CoreError> {
    read_index(&app, CODEX_ACCOUNTS_FILE, CODEX_ACCOUNTS_KEY)
}

/// Report the active Codex identity (label/email/plan/expiry).
/// On-disk effect: reads `~/.codex/auth.json`; writes nothing.
#[tauri::command]
pub fn get_active_codex_identity() -> Result<CodexIdentity, CoreError> {
    codex::read_active_codex_identity()
}

/// Capture the currently-signed-in Codex account into the vault and the index.
/// On-disk effect: writes the secret `auth.json` payload to the OS keyring
/// (`app.cchive.codex.accounts`) and upserts the non-secret meta into the store.
#[tauri::command]
pub fn add_codex_account_from_active<R: Runtime>(
    app: AppHandle<R>,
) -> Result<CodexAccountMeta, CoreError> {
    let meta = codex::add_codex_account_from_active()?;
    let mut accounts: Vec<CodexAccountMeta> =
        read_index(&app, CODEX_ACCOUNTS_FILE, CODEX_ACCOUNTS_KEY)?;
    accounts.retain(|a| a.id != meta.id);
    accounts.push(meta.clone());
    write_index(&app, CODEX_ACCOUNTS_FILE, CODEX_ACCOUNTS_KEY, &accounts)?;
    Ok(meta)
}

/// Switch the active Codex account to `id`.
/// On-disk effect: backs up then atomically rewrites `~/.codex/auth.json`;
/// rolls back on any failure. Touches no Claude file and no Codex config.
#[tauri::command]
pub fn switch_codex_account(id: String) -> Result<CodexIdentity, CoreError> {
    codex::switch_codex_account(&id)
}

/// Remove a saved Codex account from the vault and the index.
/// On-disk effect: deletes the secret from the OS keyring and drops the matching
/// meta from the store; the live `~/.codex/auth.json` is untouched.
#[tauri::command]
pub fn remove_codex_account<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), CoreError> {
    codex::remove_codex_account(&id)?;
    let mut accounts: Vec<CodexAccountMeta> =
        read_index(&app, CODEX_ACCOUNTS_FILE, CODEX_ACCOUNTS_KEY)?;
    accounts.retain(|a| a.id != id);
    write_index(&app, CODEX_ACCOUNTS_FILE, CODEX_ACCOUNTS_KEY, &accounts)
}
