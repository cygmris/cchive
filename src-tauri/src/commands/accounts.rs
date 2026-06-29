//! Account commands: list, active identity, add-from-active, switch, remove.
//!
//! Every return carries labels + non-secret metadata only (`Result<_, CoreError>`);
//! access/refresh tokens stay in the Rust core (the OS keyring + the on-disk
//! credential files) and never cross this IPC boundary.

use tauri::{AppHandle, Runtime};

use super::{read_index, write_index};
use crate::core::switch;
use crate::model::{AccountMeta, ActiveIdentity, CoreError, SwitchResult};

/// Store file + key holding the non-secret account index (no tokens).
const ACCOUNTS_FILE: &str = "cchive-accounts.json";
const ACCOUNTS_KEY: &str = "accounts";

/// List saved accounts as non-secret metadata.
/// On-disk effect: reads the account index from the cchive store; no credential I/O.
#[tauri::command]
pub fn list_accounts<R: Runtime>(app: AppHandle<R>) -> Result<Vec<AccountMeta>, CoreError> {
    read_index(&app, ACCOUNTS_FILE, ACCOUNTS_KEY)
}

/// Report who the active session currently is (label/email/tier/model/expiry).
/// On-disk effect: reads the live credential + `~/.claude.json` + `settings.json`;
/// writes nothing.
#[tauri::command]
pub fn get_active_identity() -> Result<ActiveIdentity, CoreError> {
    switch::read_active_identity()
}

/// Capture the currently-logged-in account into the vault and the account index.
/// On-disk effect: writes the secret blob to the OS keyring (`app.cchive.accounts`)
/// and upserts the non-secret `AccountMeta` into the cchive store.
#[tauri::command]
pub fn add_account_from_active<R: Runtime>(app: AppHandle<R>) -> Result<AccountMeta, CoreError> {
    let meta = switch::add_account_from_active()?;
    let mut accounts: Vec<AccountMeta> = read_index(&app, ACCOUNTS_FILE, ACCOUNTS_KEY)?;
    accounts.retain(|a| a.id != meta.id);
    accounts.push(meta.clone());
    write_index(&app, ACCOUNTS_FILE, ACCOUNTS_KEY, &accounts)?;
    Ok(meta)
}

/// Switch the active subscription account to `id`.
/// On-disk effect: backs up then atomically rewrites `~/.claude/.credentials.json`
/// (or the macOS Keychain) and `~/.claude.json`; rolls both back on any failure.
#[tauri::command]
pub fn switch_account(id: String) -> Result<SwitchResult, CoreError> {
    switch::switch_account(&id)
}

/// Remove a saved account from the vault and the account index.
/// On-disk effect: deletes the secret blob from the OS keyring and drops the
/// matching `AccountMeta` from the cchive store; the live Claude files are untouched.
#[tauri::command]
pub fn remove_account<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), CoreError> {
    switch::remove_account(&id)?;
    let mut accounts: Vec<AccountMeta> = read_index(&app, ACCOUNTS_FILE, ACCOUNTS_KEY)?;
    accounts.retain(|a| a.id != id);
    write_index(&app, ACCOUNTS_FILE, ACCOUNTS_KEY, &accounts)
}
