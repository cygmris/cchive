//! Shared DTOs and the error type that cross the Tauri IPC boundary.
//!
//! SAFETY CONTRACT: nothing in this module carries a token. The webview only
//! ever sees labels + non-secret metadata (email, plan tier, expiry, model id).
//! Access/refresh tokens stay in Rust (the OS keyring + the on-disk credential
//! files) and are never serialized into any of these structs.
#![allow(dead_code)] // scaffolding: commands wire these up in a later task

use serde::ser::SerializeStruct;
use serde::{Deserialize, Serialize};

/// Non-secret metadata for one saved account (the secret blob lives in the vault).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountMeta {
    pub id: String,
    pub label: String,
    pub email: Option<String>,
    /// Plan/rate-limit label, e.g. "Max 20x" derived from `rateLimitTier`.
    pub tier: Option<String>,
    /// Epoch milliseconds of the last switch-in, if ever used.
    pub last_used: Option<i64>,
}

/// Non-secret metadata for one API-provider preset (env-block switch mode).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderMeta {
    pub id: String,
    pub label: String,
    /// `ANTHROPIC_BASE_URL` target (non-secret).
    pub base_url: Option<String>,
    /// `ANTHROPIC_MODEL` override, if any.
    pub model: Option<String>,
}

/// Who the active session currently is, for the HUD. Never includes a token.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveIdentity {
    /// "account" | "provider" | "none".
    pub kind: String,
    pub label: String,
    pub email: Option<String>,
    pub tier: Option<String>,
    pub model: Option<String>,
    /// Epoch milliseconds the credential expires at (drives the countdown badge).
    pub expires_at: Option<i64>,
}

/// Result of a successful switch: the new identity + a per-OS note about when
/// Claude Code will pick up the change (file re-read vs keychain cache).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchResult {
    pub identity: ActiveIdentity,
    pub apply_note: String,
}

/// Auth-relevant environment variables that can override what Clavis writes.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvOverrides {
    /// `CLAUDE_CODE_OAUTH_TOKEN` is set — it bypasses the credential file/keychain.
    pub oauth_token_set: bool,
    /// Sorted names of any `ANTHROPIC_*` vars present (values never captured).
    pub anthropic_vars: Vec<String>,
    /// `CLAUDE_CONFIG_DIR` value, if it relocates the config directory.
    pub config_dir_override: Option<String>,
}

/// Non-secret summary of `settings.json` for the settings screen.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSummary {
    pub model: Option<String>,
    /// Whether an `env` provider-override block is present.
    pub has_env: bool,
    /// Top-level key names only (so the UI can show what's configured).
    pub top_level_keys: Vec<String>,
}

/// The single error type returned to the frontend. Serializes to a stable
/// `{ code, message }` shape so the UI can branch on `code` without parsing
/// human text.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("account not found: {0}")]
    AccountNotFound(String),

    #[error("switch failed and both files were rolled back: {0}")]
    SwitchFailedRolledBack(String),

    #[error("a credential env override is active: {0}")]
    EnvOverride(String),

    #[error("corrupt or unparseable file: {0}")]
    CorruptFile(String),

    #[error("keyring error: {0}")]
    Keyring(String),

    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("io error: {0}")]
    Io(String),
}

impl CoreError {
    /// Stable machine-readable code (never changes across message wording).
    pub fn code(&self) -> &'static str {
        match self {
            CoreError::AccountNotFound(_) => "ACCOUNT_NOT_FOUND",
            CoreError::SwitchFailedRolledBack(_) => "SWITCH_FAILED_ROLLED_BACK",
            CoreError::EnvOverride(_) => "ENV_OVERRIDE",
            CoreError::CorruptFile(_) => "CORRUPT_FILE",
            CoreError::Keyring(_) => "KEYRING",
            CoreError::InvalidInput(_) => "INVALID_INPUT",
            CoreError::NotFound(_) => "NOT_FOUND",
            CoreError::Io(_) => "IO",
        }
    }
}

impl Serialize for CoreError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut s = serializer.serialize_struct("CoreError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

impl From<std::io::Error> for CoreError {
    fn from(e: std::io::Error) -> Self {
        CoreError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for CoreError {
    fn from(e: serde_json::Error) -> Self {
        CoreError::CorruptFile(e.to_string())
    }
}
