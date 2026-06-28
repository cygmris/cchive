//! The headline algorithms — safe, atomic, reversible.
//!
//! Subscription switch (`switch_account`): detect any env override, then CAPTURE
//! the live account into the vault and back up both files BEFORE any overwrite
//! (G1, G8), atomically write the target's `claudeAiOauth` (preserving `mcpOAuth`,
//! G4) and identity cache, and on ANY failure restore both backups —
//! `CoreError::SwitchFailedRolledBack`. A target missing from the vault is a
//! zero-change `CoreError::AccountNotFound` (the existence check precedes every
//! mutation). The returned `SwitchResult` carries non-secret identity + a per-OS
//! apply note (G9); never a token (G12).
//!
//! Provider switch (`apply_provider`/`clear_provider`): a different mode that only
//! shallow-merges / clears the `settings.json` `env` block — credentials untouched.
#![allow(dead_code)] // commands wire these entry points up in a later task

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::atomic_fs::{self, BackupHandle};
use super::credentials::{self, CredentialBackend};
use super::{claude_json, keyring_store, paths, settings};
use crate::model::{AccountMeta, ActiveIdentity, CoreError, EnvOverrides, ProviderMeta, SwitchResult};

/// The bundle persisted per saved account in the OS keyring vault: the secret
/// `claudeAiOauth` blob plus the non-secret profile needed to restore a clean HUD
/// on switch-in. Serialized as the vault entry's opaque string.
#[derive(Serialize, Deserialize)]
struct VaultBlob {
    #[serde(rename = "claudeAiOauth")]
    claude_ai_oauth: Value,
    #[serde(rename = "oauthAccount", default, skip_serializing_if = "Option::is_none")]
    oauth_account: Option<Value>,
    #[serde(rename = "userID", default, skip_serializing_if = "Option::is_none")]
    user_id: Option<String>,
}

/// On-disk locations a subscription switch touches.
struct SwitchPaths {
    credentials: PathBuf,
    dot_claude_json: PathBuf,
}

impl SwitchPaths {
    fn live() -> Self {
        Self {
            credentials: paths::credentials_path(),
            dot_claude_json: paths::dot_claude_json(),
        }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Capture the live credential + profile into the vault and return its metadata.
/// Writes the OS keyring; reads `~/.claude.json` and the active credential store.
pub fn add_account_from_active() -> Result<AccountMeta, CoreError> {
    let backend = credentials::active_backend();
    capture_current(backend.as_ref(), &paths::dot_claude_json())
}

/// Switch the active subscription account to `target_id`.
/// Writes `~/.claude/.credentials.json` (or the macOS Keychain) and
/// `~/.claude.json`; backs both up first and rolls back on any failure.
pub fn switch_account(target_id: &str) -> Result<SwitchResult, CoreError> {
    // Auto-snapshot the Claude files into the rotating backups store BEFORE any
    // mutation, so every switch is recoverable (best-effort; never blocks).
    // Skipped under unit tests, which drive the path-injectable `*_inner`.
    #[cfg(not(test))]
    super::backups::auto_snapshot();

    let backend = credentials::active_backend();
    switch_account_inner(target_id, &SwitchPaths::live(), backend.as_ref(), false)
}

/// Apply an API-provider preset by shallow-merging its env into `settings.json`
/// (backs up first). Credentials are untouched — this is the provider mode.
pub fn apply_provider(_meta: &ProviderMeta, env: BTreeMap<String, String>) -> Result<(), CoreError> {
    settings::merge_env(env)
}

/// Reset to the subscription by clearing ONLY the `settings.json` env block.
pub fn clear_provider() -> Result<(), CoreError> {
    settings::clear_env()
}

/// Read the current active subscription identity for the HUD (non-secret).
/// Reads the live credential descriptor + `~/.claude.json` `oauthAccount` and the
/// `settings.json` model; never returns a token (G12).
pub fn read_active_identity() -> Result<ActiveIdentity, CoreError> {
    let backend = credentials::active_backend();
    let mut identity = read_active_identity_inner(backend.as_ref(), &paths::dot_claude_json())?;
    // The configured model is a non-secret label; absence is fine.
    identity.model = settings::read_summary().ok().and_then(|s| s.model);
    Ok(identity)
}

/// Remove a saved account's secret blob from the OS keyring vault (idempotent).
/// Touches only the Clavis vault namespace; the live Claude files are untouched.
pub fn remove_account(id: &str) -> Result<(), CoreError> {
    keyring_store::vault_delete(id)
}

// ---------------------------------------------------------------------------
// Internals (path/backend-injectable so tests need no env mutation)
// ---------------------------------------------------------------------------

/// Read the live account (credential + profile) and persist it to the vault so it
/// can never be lost or stomped by a later refresh (G1, G8).
fn capture_current(backend: &dyn CredentialBackend, dot_path: &Path) -> Result<AccountMeta, CoreError> {
    let active = credentials::read_active_from(backend)?;
    let claude_ai_oauth = active
        .claude_ai_oauth()
        .cloned()
        .ok_or_else(|| CoreError::NotFound("no active claudeAiOauth to capture".to_string()))?;
    let profile = claude_json::read_oauth_account_at(dot_path)?;

    let id = account_id(profile.oauth_account.as_ref());
    let email = email_of(profile.oauth_account.as_ref());
    let tier = tier_label(active.descriptor.rate_limit_tier.as_deref());

    let blob = VaultBlob {
        claude_ai_oauth,
        oauth_account: profile.oauth_account.clone(),
        user_id: profile.user_id.clone(),
    };
    keyring_store::vault_put(&id, &serde_json::to_string(&blob)?)?;

    Ok(AccountMeta {
        id,
        label: email.clone().unwrap_or_else(|| "account".to_string()),
        email,
        tier,
        last_used: None,
    })
}

fn switch_account_inner(
    target_id: &str,
    p: &SwitchPaths,
    backend: &dyn CredentialBackend,
    fail_inject: bool,
) -> Result<SwitchResult, CoreError> {
    // Read-only env probe — does not block; surfaced in the apply note (G5).
    let env = paths::detect_env_overrides();

    // The target must exist BEFORE we mutate anything: a miss is zero-change.
    if !keyring_store::vault_has(target_id)? {
        return Err(CoreError::AccountNotFound(target_id.to_string()));
    }

    // 1. Capture the live account into the vault so we never lose it (G1, G8).
    capture_current(backend, &p.dot_claude_json)?;

    // 2. Back up both files so any failure past here is fully reversible (G1).
    let backup_cred = atomic_fs::backup(&p.credentials)?;
    let backup_dot = atomic_fs::backup(&p.dot_claude_json)?;

    // 3. Load the target bundle from the vault.
    let target = load_target(target_id)?;

    // 4. Write the target credential (replace claudeAiOauth, preserve mcpOAuth, G4).
    if let Err(e) = backend.write_blob(&target.claude_ai_oauth) {
        rollback(&backup_cred, &backup_dot);
        return Err(CoreError::SwitchFailedRolledBack(e.to_string()));
    }

    // 5. Write the identity cache for a clean HUD (G6). `fail_inject` simulates an
    //    IO fault AFTER the credential write to exercise the both-files rollback.
    let identity_write: Result<(), CoreError> = if fail_inject {
        Err(CoreError::Io("injected write failure (test)".to_string()))
    } else if let Some(account) = &target.oauth_account {
        let user_id = target.user_id.clone().unwrap_or_default();
        claude_json::write_identity_at(&p.dot_claude_json, account, &user_id)
    } else {
        Ok(())
    };
    if let Err(e) = identity_write {
        rollback(&backup_cred, &backup_dot);
        return Err(CoreError::SwitchFailedRolledBack(e.to_string()));
    }

    // 6. Build the non-secret result (no token crosses this boundary, G12).
    let descriptor = credentials::descriptor_of(&target.claude_ai_oauth);
    let identity = ActiveIdentity {
        kind: "account".to_string(),
        label: email_of(target.oauth_account.as_ref()).unwrap_or_else(|| "account".to_string()),
        email: email_of(target.oauth_account.as_ref()),
        org: org_of(target.oauth_account.as_ref()),
        tier: tier_label(descriptor.rate_limit_tier.as_deref()),
        model: None,
        expires_at: descriptor.expires_at,
    };
    Ok(SwitchResult {
        identity,
        apply_note: apply_note(&env),
    })
}

/// Build the non-secret active identity from a specific backend + identity file
/// (path/backend-injectable so tests need no env mutation). `model` is filled by
/// the public `read_active_identity`; here it is left `None`.
fn read_active_identity_inner(
    backend: &dyn CredentialBackend,
    dot_path: &Path,
) -> Result<ActiveIdentity, CoreError> {
    let active = credentials::read_active_from(backend)?;
    let profile = claude_json::read_oauth_account_at(dot_path)?;
    let has_cred = active.claude_ai_oauth().is_some();
    let email = email_of(profile.oauth_account.as_ref());
    Ok(ActiveIdentity {
        kind: if has_cred { "account".to_string() } else { "none".to_string() },
        label: email.clone().unwrap_or_else(|| "Not signed in".to_string()),
        email,
        org: org_of(profile.oauth_account.as_ref()),
        tier: tier_label(active.descriptor.rate_limit_tier.as_deref()),
        model: None,
        expires_at: active.descriptor.expires_at,
    })
}

fn load_target(target_id: &str) -> Result<VaultBlob, CoreError> {
    let raw = keyring_store::vault_get(target_id)?;
    serde_json::from_str(&raw).map_err(|_| CoreError::CorruptFile(format!("vault entry {target_id}")))
}

/// Best-effort restore of both files from their pre-switch backups.
fn rollback(backup_cred: &Option<BackupHandle>, backup_dot: &Option<BackupHandle>) {
    if let Some(handle) = backup_cred {
        let _ = atomic_fs::restore(handle);
    }
    if let Some(handle) = backup_dot {
        let _ = atomic_fs::restore(handle);
    }
}

// Provider helpers parameterized by path (so tests need no env mutation).
fn apply_provider_at(path: &Path, env: BTreeMap<String, String>) -> Result<(), CoreError> {
    settings::merge_env_at(path, env)
}

fn clear_provider_at(path: &Path) -> Result<(), CoreError> {
    settings::clear_env_at(path)
}

// ---------------------------------------------------------------------------
// Non-secret field helpers (read from blobs, return only labels/metadata)
// ---------------------------------------------------------------------------

/// Stable id for an account: `accountUuid`, else `emailAddress`, else `"default"`.
fn account_id(oauth_account: Option<&Value>) -> String {
    let o = oauth_account.and_then(Value::as_object);
    o.and_then(|m| m.get("accountUuid"))
        .and_then(Value::as_str)
        .or_else(|| o.and_then(|m| m.get("emailAddress")).and_then(Value::as_str))
        .map(str::to_string)
        .unwrap_or_else(|| "default".to_string())
}

fn email_of(oauth_account: Option<&Value>) -> Option<String> {
    oauth_account
        .and_then(Value::as_object)
        .and_then(|m| m.get("emailAddress"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// Organization name from `oauthAccount.organizationName` (non-secret label;
/// blank/absent ⇒ `None`, so the hero falls back to email only).
fn org_of(oauth_account: Option<&Value>) -> Option<String> {
    oauth_account
        .and_then(Value::as_object)
        .and_then(|m| m.get("organizationName"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// Map the raw `rateLimitTier` to a short UI label (non-secret).
fn tier_label(rate_limit_tier: Option<&str>) -> Option<String> {
    match rate_limit_tier {
        Some(t) if t.contains("20x") => Some("Max 20x".to_string()),
        Some(t) if t.contains("5x") => Some("Max 5x".to_string()),
        Some(t) if !t.is_empty() => Some(t.to_string()),
        _ => None,
    }
}

/// Per-OS note about when Claude Code picks up the switch (G9), plus an env-override
/// warning when `CLAUDE_CODE_OAUTH_TOKEN` would bypass what we wrote (G5).
fn apply_note(env: &EnvOverrides) -> String {
    let base = if cfg!(target_os = "macos") {
        "macOS caches the credential for ~30s — restart the Claude Code session for instant effect."
    } else {
        "Claude Code re-reads the credential on the next message — no restart needed."
    };
    if env.oauth_token_set {
        format!(
            "{base} Warning: CLAUDE_CODE_OAUTH_TOKEN is set and overrides the credential store; \
             unset it for the switch to take effect."
        )
    } else {
        base.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn write_file(path: &Path, value: &Value) {
        atomic_fs::atomic_write(path, value.to_string().as_bytes(), Some(0o600)).unwrap();
    }

    fn cred_blob(token: &str, tier: &str) -> Value {
        json!({
            "claudeAiOauth": {
                "accessToken": token,
                "refreshToken": format!("ref-{token}"),
                "expiresAt": 1_750_000_000_000i64,
                "subscriptionType": "max",
                "rateLimitTier": tier
            },
            "mcpOAuth": { "plugin:demo|h": { "accessToken": "MCP-SECRET" } }
        })
    }

    fn profile(uuid: &str, email: &str) -> Value {
        json!({
            "oauthAccount": {
                "accountUuid": uuid,
                "emailAddress": email,
                "organizationName": "Acme Inc"
            },
            "userID": format!("uid-{uuid}"),
            "projects": { "/x": { "history": [] } }
        })
    }

    #[test]
    fn switch_happy_path_swaps_active_and_captures_previous() {
        let dir = tempfile::tempdir().unwrap();
        let cred = dir.path().join(".credentials.json");
        let dot = dir.path().join(".claude.json");
        let backend = credentials::FileBackend::new(&cred);

        // Stage target B into the vault by capturing it while it is "active".
        write_file(&cred, &cred_blob("tok-B", "default_claude_max_5x"));
        write_file(&dot, &profile("uuid-b", "b@example.test"));
        let meta_b = capture_current(&backend, &dot).unwrap();
        assert_eq!(meta_b.id, "uuid-b");

        // Now the live account is A; B exists only in the vault.
        write_file(&cred, &cred_blob("tok-A", "default_claude_max_20x"));
        write_file(&dot, &profile("uuid-a", "a@example.test"));

        let p = SwitchPaths {
            credentials: cred.clone(),
            dot_claude_json: dot.clone(),
        };
        let result = switch_account_inner("uuid-b", &p, &backend, false).unwrap();

        // Active credential is now B; mcpOAuth preserved (G4).
        let cred_after = atomic_fs::read_json_value(&cred).unwrap();
        assert_eq!(cred_after["claudeAiOauth"]["accessToken"], json!("tok-B"));
        assert_eq!(
            cred_after["mcpOAuth"]["plugin:demo|h"]["accessToken"],
            json!("MCP-SECRET")
        );

        // Identity cache now shows B; unrelated keys preserved.
        let dot_after = atomic_fs::read_json_value(&dot).unwrap();
        assert_eq!(dot_after["oauthAccount"]["emailAddress"], json!("b@example.test"));
        assert_eq!(dot_after["userID"], json!("uid-uuid-b"));
        assert!(dot_after.get("projects").is_some());

        // Previous account A was captured into the vault.
        assert!(keyring_store::vault_has("uuid-a").unwrap());
        assert!(keyring_store::vault_get("uuid-a").unwrap().contains("tok-A"));

        // Returned identity is non-secret.
        assert_eq!(result.identity.email.as_deref(), Some("b@example.test"));
        assert_eq!(result.identity.tier.as_deref(), Some("Max 5x"));
        let serialized = serde_json::to_string(&result).unwrap();
        assert!(!serialized.contains("tok-"), "identity leaked a token: {serialized}");
        assert!(!serialized.contains("accessToken"));
    }

    #[test]
    fn switch_write_failure_rolls_back_both_files() {
        let dir = tempfile::tempdir().unwrap();
        let cred = dir.path().join(".credentials.json");
        let dot = dir.path().join(".claude.json");
        let backend = credentials::FileBackend::new(&cred);

        // Stage target T into the vault.
        write_file(&cred, &cred_blob("tok-T", "default_claude_max_20x"));
        write_file(&dot, &profile("uuid-rb-t", "t@example.test"));
        capture_current(&backend, &dot).unwrap();

        // Live account = C (pre-switch state we must be able to restore).
        write_file(&cred, &cred_blob("tok-C", "default_claude_max_5x"));
        write_file(&dot, &profile("uuid-rb-c", "c@example.test"));
        let pre_cred = std::fs::read(&cred).unwrap();
        let pre_dot = std::fs::read(&dot).unwrap();

        let p = SwitchPaths {
            credentials: cred.clone(),
            dot_claude_json: dot.clone(),
        };
        // fail_inject = true: the credential write succeeds, the identity write faults.
        let err = switch_account_inner("uuid-rb-t", &p, &backend, true).unwrap_err();
        match err {
            CoreError::SwitchFailedRolledBack(_) => {}
            other => panic!("expected SwitchFailedRolledBack, got {other:?}"),
        }

        // BOTH files restored byte-for-byte to their pre-switch contents.
        assert_eq!(std::fs::read(&cred).unwrap(), pre_cred, "credentials must roll back");
        assert_eq!(std::fs::read(&dot).unwrap(), pre_dot, "identity must roll back");
    }

    #[test]
    fn switch_account_not_found_makes_zero_changes() {
        let dir = tempfile::tempdir().unwrap();
        let cred = dir.path().join(".credentials.json");
        let dot = dir.path().join(".claude.json");
        let backend = credentials::FileBackend::new(&cred);

        write_file(&cred, &cred_blob("tok-Z", "default_claude_max_20x"));
        write_file(&dot, &profile("uuid-nf-z", "z@example.test"));
        let pre_cred = std::fs::read(&cred).unwrap();
        let pre_dot = std::fs::read(&dot).unwrap();

        let p = SwitchPaths {
            credentials: cred.clone(),
            dot_claude_json: dot.clone(),
        };
        let err = switch_account_inner("does-not-exist-xyz", &p, &backend, false).unwrap_err();
        match err {
            CoreError::AccountNotFound(_) => {}
            other => panic!("expected AccountNotFound, got {other:?}"),
        }

        // Files unchanged; the current account was NOT captured; no backups written.
        assert_eq!(std::fs::read(&cred).unwrap(), pre_cred);
        assert_eq!(std::fs::read(&dot).unwrap(), pre_dot);
        assert!(!keyring_store::vault_has("uuid-nf-z").unwrap(), "no capture on miss");
        let strays: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains(".clavis.bak."))
            .collect();
        assert!(strays.is_empty(), "no backups on a zero-change miss");
    }

    #[test]
    fn active_identity_is_non_secret() {
        let dir = tempfile::tempdir().unwrap();
        let cred = dir.path().join(".credentials.json");
        let dot = dir.path().join(".claude.json");
        write_file(&cred, &cred_blob("tok-ID", "default_claude_max_20x"));
        write_file(&dot, &profile("uuid-id", "id@example.test"));

        let identity =
            read_active_identity_inner(&credentials::FileBackend::new(&cred), &dot).unwrap();
        assert_eq!(identity.kind, "account");
        assert_eq!(identity.email.as_deref(), Some("id@example.test"));
        assert_eq!(identity.org.as_deref(), Some("Acme Inc"), "non-secret org label");
        assert_eq!(identity.tier.as_deref(), Some("Max 20x"));
        assert_eq!(identity.expires_at, Some(1_750_000_000_000));

        let serialized = serde_json::to_string(&identity).unwrap();
        assert!(!serialized.contains("tok-"), "identity leaked a token: {serialized}");
        assert!(!serialized.contains("accessToken"));
    }

    #[test]
    fn active_identity_none_when_no_credential() {
        let dir = tempfile::tempdir().unwrap();
        let cred = dir.path().join("absent.json");
        let dot = dir.path().join("absent.claude.json");
        let identity =
            read_active_identity_inner(&credentials::FileBackend::new(&cred), &dot).unwrap();
        assert_eq!(identity.kind, "none");
        assert!(identity.email.is_none());
    }

    #[test]
    fn apply_and_clear_provider_touch_only_env() {
        let dir = tempfile::tempdir().unwrap();
        let settings_path = dir.path().join("settings.json");
        write_file(
            &settings_path,
            &json!({
                "model": "claude-opus",
                "theme": "dark",
                "hooks": { "Stop": [] }
            }),
        );

        let mut env = BTreeMap::new();
        env.insert(
            "ANTHROPIC_BASE_URL".to_string(),
            "https://provider.test/anthropic".to_string(),
        );
        env.insert("ANTHROPIC_MODEL".to_string(), "compat-model".to_string());
        apply_provider_at(&settings_path, env).unwrap();

        let after = atomic_fs::read_json_value(&settings_path).unwrap();
        assert_eq!(
            after["env"]["ANTHROPIC_BASE_URL"],
            json!("https://provider.test/anthropic")
        );
        assert_eq!(after["env"]["ANTHROPIC_MODEL"], json!("compat-model"));
        // Every other settings key untouched.
        assert_eq!(after["model"], json!("claude-opus"));
        assert_eq!(after["theme"], json!("dark"));
        assert_eq!(after["hooks"], json!({ "Stop": [] }));

        clear_provider_at(&settings_path).unwrap();
        let cleared = atomic_fs::read_json_value(&settings_path).unwrap();
        assert!(cleared.get("env").is_none(), "env block removed");
        assert_eq!(cleared["model"], json!("claude-opus"));
        assert_eq!(cleared["theme"], json!("dark"));
    }
}
