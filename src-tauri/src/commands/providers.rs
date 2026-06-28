//! Provider commands: list, apply (merge env), clear (remove env).
//!
//! Provider mode routes Claude Code at a third-party Anthropic-compatible endpoint
//! via the `settings.json` `env` block. `apply_provider` takes the env block as an
//! INPUT (it may include the provider key, e.g. `ANTHROPIC_AUTH_TOKEN`); that secret
//! is written to `settings.json` but is NEVER returned — every command return here
//! is non-secret metadata only.

use std::collections::BTreeMap;

use tauri::{AppHandle, Runtime};

use super::read_index;
use crate::core::switch;
use crate::model::{CoreError, ProviderMeta};

/// Store file + key holding the non-secret provider presets (no keys/tokens).
const PROVIDERS_FILE: &str = "clavis-providers.json";
const PROVIDERS_KEY: &str = "providers";

/// List configured API-provider presets as non-secret metadata.
/// On-disk effect: reads the provider index from the Clavis store; no credential I/O.
#[tauri::command]
pub fn list_providers<R: Runtime>(app: AppHandle<R>) -> Result<Vec<ProviderMeta>, CoreError> {
    read_index(&app, PROVIDERS_FILE, PROVIDERS_KEY)
}

/// Activate a provider preset by shallow-merging `env` into `settings.json`.
/// `env` is an input-only secret block (provider key + base URL + model); it is
/// written to disk but never echoed back.
/// On-disk effect: backs up then merges the `env` block into `~/.claude/settings.json`,
/// preserving every other key; credentials are untouched.
#[tauri::command]
pub fn apply_provider(
    meta: ProviderMeta,
    env: BTreeMap<String, String>,
) -> Result<(), CoreError> {
    switch::apply_provider(&meta, env)
}

/// Reset to the subscription by clearing ONLY the `env` block.
/// On-disk effect: backs up then removes the `env` block from `~/.claude/settings.json`,
/// preserving every other key.
#[tauri::command]
pub fn clear_provider() -> Result<(), CoreError> {
    switch::clear_provider()
}
