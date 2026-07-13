//! Settings commands: read summary, detect env overrides.
//!
//! Both return non-secret views: the settings summary is model id + whether an
//! `env` block exists + top-level key names; the env-override probe lists only
//! variable names/flags, never their values.

use crate::core::{paths, settings};
use crate::model::{CoreError, EnvOverrides, SettingsSummary};

/// Non-secret summary of `~/.claude/settings.json` (model, has-env, top-level keys).
/// On-disk effect: reads `settings.json`; writes nothing.
#[tauri::command]
pub fn read_settings_summary() -> Result<SettingsSummary, CoreError> {
    settings::read_summary()
}

/// Detect auth-relevant env vars that override or relocate what cchive writes
/// (`CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CONFIG_DIR`, any `ANTHROPIC_*` names).
/// On-disk effect: reads process environment only; touches no files.
#[tauri::command]
pub fn detect_env_overrides() -> Result<EnvOverrides, CoreError> {
    Ok(paths::detect_env_overrides())
}

/// Dev/testing only: the screen to open on launch, from `CCHIVE_INITIAL_SCREEN`.
/// Lets a screenshot harness boot straight onto a screen (no synthetic navigation).
/// Returns `None` when unset; the frontend validates it against the real screen ids.
/// On-disk effect: reads one env var; touches nothing.
#[tauri::command]
pub fn get_initial_screen() -> Option<String> {
    std::env::var("CCHIVE_INITIAL_SCREEN")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}
