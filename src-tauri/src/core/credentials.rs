//! Per-OS access to the live Claude Code subscription credential.
//!
//! Linux/Windows keep the credential in a `0600` JSON file
//! (`~/.claude/.credentials.json`); macOS keeps it in the login Keychain as a
//! generic password (service `"Claude Code-credentials"`, account `$USER`) — and
//! deletes the plaintext file, so on macOS the Keychain is the source of truth
//! (G3). Both stores hold two top-level objects: `claudeAiOauth` (the swappable
//! subscription secret) and `mcpOAuth` (per-MCP-server tokens). A write REPLACES
//! only `claudeAiOauth` and PRESERVES `mcpOAuth` + every other key (G4).
//!
//! Tokens never leave this layer: callers see the opaque blob (used internally by
//! the switch flow) plus a non-secret `CredentialDescriptor` (plan tier + expiry)
//! that the UI labels accounts by. The descriptor never contains a token string.
#![allow(dead_code)] // some entry points are wired up by commands in a later task

use std::path::PathBuf;

use serde_json::{Map, Value};

use super::{atomic_fs, paths};
use crate::model::CoreError;

/// Non-secret descriptor parsed from `claudeAiOauth`. Carries ONLY the fields the
/// UI labels an account by — never an access/refresh token.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CredentialDescriptor {
    /// Plan family, e.g. `"max"`.
    pub subscription_type: Option<String>,
    /// Rate-limit tier, e.g. `"default_claude_max_20x"` (5x vs 20x lives here).
    pub rate_limit_tier: Option<String>,
    /// Epoch milliseconds the credential expires at (drives the countdown badge).
    pub expires_at: Option<i64>,
}

/// The live credential as read from the active backend: the full store blob
/// (`claudeAiOauth` + `mcpOAuth` + any other keys) plus a non-secret descriptor.
///
/// SECRET: `blob` stays inside the Rust core (it holds tokens); only `descriptor`
/// is safe to surface to a caller/IPC.
pub struct ActiveCredential {
    pub blob: Value,
    pub descriptor: CredentialDescriptor,
}

impl ActiveCredential {
    /// The `claudeAiOauth` object from the blob, if present (the swappable secret).
    pub fn claude_ai_oauth(&self) -> Option<&Value> {
        self.blob.get("claudeAiOauth").filter(|v| !v.is_null())
    }
}

/// Parse the non-secret descriptor out of a `claudeAiOauth` object.
pub fn descriptor_of(claude_ai_oauth: &Value) -> CredentialDescriptor {
    let o = claude_ai_oauth.as_object();
    CredentialDescriptor {
        subscription_type: o
            .and_then(|m| m.get("subscriptionType"))
            .and_then(Value::as_str)
            .map(str::to_string),
        rate_limit_tier: o
            .and_then(|m| m.get("rateLimitTier"))
            .and_then(Value::as_str)
            .map(str::to_string),
        expires_at: o.and_then(|m| m.get("expiresAt")).and_then(Value::as_i64),
    }
}

/// Abstraction over the OS-specific credential store. `read_blob` returns the
/// whole store (or `None` when absent); `write_blob` REPLACES only `claudeAiOauth`
/// and PRESERVES `mcpOAuth` + every other key.
pub trait CredentialBackend {
    fn read_blob(&self) -> Result<Option<Value>, CoreError>;
    fn write_blob(&self, claude_ai_oauth: &Value) -> Result<(), CoreError>;
}

/// Linux/Windows: the credential is a `0600` JSON file.
pub struct FileBackend {
    path: PathBuf,
}

impl FileBackend {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }
}

impl CredentialBackend for FileBackend {
    fn read_blob(&self) -> Result<Option<Value>, CoreError> {
        if !self.path.exists() {
            return Ok(None);
        }
        Ok(Some(atomic_fs::read_json_value(&self.path)?))
    }

    fn write_blob(&self, claude_ai_oauth: &Value) -> Result<(), CoreError> {
        // Replace ONLY claudeAiOauth via write_json_preserving: mcpOAuth and every
        // other top-level key keep their value + position; atomic 0600 (G2, G4).
        let value = claude_ai_oauth.clone();
        atomic_fs::write_json_preserving(&self.path, Some(0o600), move |root| {
            if !root.is_object() {
                *root = Value::Object(Map::new());
            }
            if let Some(obj) = root.as_object_mut() {
                obj.insert("claudeAiOauth".to_string(), value);
            }
        })
    }
}

/// macOS: the credential is a Keychain generic password. CC reads the Keychain
/// first and deletes the plaintext file, so writing the file is futile (G3) —
/// write the Keychain item instead.
#[cfg(target_os = "macos")]
pub struct KeychainBackend {
    service: String,
    account: String,
}

#[cfg(target_os = "macos")]
impl KeychainBackend {
    fn entry(&self) -> Result<keyring::Entry, CoreError> {
        keyring::Entry::new(&self.service, &self.account)
            .map_err(|e| CoreError::Keyring(e.to_string()))
    }
}

#[cfg(target_os = "macos")]
impl CredentialBackend for KeychainBackend {
    fn read_blob(&self) -> Result<Option<Value>, CoreError> {
        match self.entry()?.get_password() {
            Ok(s) => {
                let v = serde_json::from_str(&s).map_err(|_| {
                    CoreError::CorruptFile("macOS Keychain credential".to_string())
                })?;
                Ok(Some(v))
            }
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(CoreError::Keyring(e.to_string())),
        }
    }

    fn write_blob(&self, claude_ai_oauth: &Value) -> Result<(), CoreError> {
        // Read-merge-write: replace only claudeAiOauth, keep mcpOAuth + others (G4).
        let mut root = self.read_blob()?.unwrap_or_else(|| Value::Object(Map::new()));
        if !root.is_object() {
            root = Value::Object(Map::new());
        }
        if let Some(obj) = root.as_object_mut() {
            obj.insert("claudeAiOauth".to_string(), claude_ai_oauth.clone());
        }
        let serialized = serde_json::to_string(&root).map_err(CoreError::from)?;
        self.entry()?
            .set_password(&serialized)
            .map_err(|e| CoreError::Keyring(e.to_string()))
    }
}

/// The credential backend for the current OS.
pub fn active_backend() -> Box<dyn CredentialBackend> {
    #[cfg(target_os = "macos")]
    {
        let svc = paths::macos_keychain_service();
        Box::new(KeychainBackend {
            service: svc.service,
            account: svc.account,
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Box::new(FileBackend::new(paths::credentials_path()))
    }
}

/// Read the live credential via the OS backend.
pub fn read_active() -> Result<ActiveCredential, CoreError> {
    read_active_from(active_backend().as_ref())
}

/// Read the live credential from a specific backend (injectable for the switch
/// flow + tests). Absent store -> empty blob + default (all-`None`) descriptor.
pub fn read_active_from(backend: &dyn CredentialBackend) -> Result<ActiveCredential, CoreError> {
    let blob = backend
        .read_blob()?
        .unwrap_or_else(|| Value::Object(Map::new()));
    let descriptor = blob
        .get("claudeAiOauth")
        .filter(|v| !v.is_null())
        .map(descriptor_of)
        .unwrap_or_default();
    Ok(ActiveCredential { blob, descriptor })
}

/// Replace the active `claudeAiOauth`, preserving `mcpOAuth` + other keys (G4).
pub fn write_active(claude_ai_oauth: &Value) -> Result<(), CoreError> {
    active_backend().write_blob(claude_ai_oauth)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn seed(path: &std::path::Path, value: &Value) {
        atomic_fs::atomic_write(path, value.to_string().as_bytes(), Some(0o600)).unwrap();
    }

    #[test]
    fn write_blob_replaces_oauth_and_keeps_mcp_and_other_keys() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".credentials.json");
        seed(
            &path,
            &json!({
                "claudeAiOauth": { "accessToken": "OLD-TOKEN", "rateLimitTier": "default_claude_max_5x" },
                "mcpOAuth": { "plugin:demo|h": { "accessToken": "MCP-TOKEN" } },
                "extra": { "keep": true }
            }),
        );

        let backend = FileBackend::new(&path);
        backend
            .write_blob(&json!({ "accessToken": "NEW-TOKEN", "rateLimitTier": "default_claude_max_20x" }))
            .unwrap();

        let after = atomic_fs::read_json_value(&path).unwrap();
        let obj = after.as_object().unwrap();
        // claudeAiOauth replaced wholesale.
        assert_eq!(obj["claudeAiOauth"]["accessToken"], json!("NEW-TOKEN"));
        assert_eq!(
            obj["claudeAiOauth"]["rateLimitTier"],
            json!("default_claude_max_20x")
        );
        // mcpOAuth and unrelated keys preserved (G4).
        assert_eq!(
            obj["mcpOAuth"],
            json!({ "plugin:demo|h": { "accessToken": "MCP-TOKEN" } })
        );
        assert_eq!(obj["extra"], json!({ "keep": true }));

        // Written at 0600.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600);
        }
    }

    #[test]
    fn read_active_descriptor_parses_tier_and_expiry_without_tokens() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".credentials.json");
        seed(
            &path,
            &json!({
                "claudeAiOauth": {
                    "accessToken": "SECRET-ACCESS",
                    "refreshToken": "SECRET-REFRESH",
                    "expiresAt": 1_750_000_000_000i64,
                    "subscriptionType": "max",
                    "rateLimitTier": "default_claude_max_20x"
                },
                "mcpOAuth": {}
            }),
        );

        let active = read_active_from(&FileBackend::new(&path)).unwrap();
        assert_eq!(active.descriptor.subscription_type.as_deref(), Some("max"));
        assert_eq!(
            active.descriptor.rate_limit_tier.as_deref(),
            Some("default_claude_max_20x")
        );
        assert_eq!(active.descriptor.expires_at, Some(1_750_000_000_000));

        // The descriptor must not carry any token material.
        let rendered = format!("{:?}", active.descriptor);
        assert!(!rendered.contains("SECRET-ACCESS"));
        assert!(!rendered.contains("SECRET-REFRESH"));
        assert!(!rendered.contains("accessToken"));
    }

    #[test]
    fn read_active_missing_store_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("absent.json");
        let active = read_active_from(&FileBackend::new(&path)).unwrap();
        assert!(active.claude_ai_oauth().is_none());
        assert_eq!(active.descriptor, CredentialDescriptor::default());
    }
}
