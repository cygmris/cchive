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
use super::oauth::{self, RefreshError, TokenEndpoint};
use super::{claude_json, claude_locks, keyring_store, paths, sessions, settings};
use crate::model::{
    AccountMeta, ActiveIdentity, CoreError, EnvOverrides, Freshen, FreshenStatus, ProviderMeta,
    SwitchResult,
};

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

/// On-disk locations a subscription switch touches, including the two advisory
/// locks Claude Code itself takes around a credential write.
struct SwitchPaths {
    credentials: PathBuf,
    dot_claude_json: PathBuf,
    lock_primary: PathBuf,
    lock_legacy: PathBuf,
    /// How long to wait for a contended lock. Production waits the full
    /// window; tests shorten it so a deliberately-held lock does not cost the
    /// suite 15 seconds.
    lock_timeout_ms: u64,
}

impl SwitchPaths {
    fn live() -> Self {
        Self {
            credentials: paths::credentials_path(),
            dot_claude_json: paths::dot_claude_json(),
            lock_primary: claude_locks::oauth_refresh_lock_path(),
            lock_legacy: claude_locks::legacy_lock_path(),
            lock_timeout_ms: claude_locks::ACQUIRE_TIMEOUT_MS,
        }
    }

    /// Locks beside the given credential file — tests point every path at a
    /// temp dir, and a test must never touch the real `~/.claude` locks.
    #[cfg(test)]
    fn for_test(credentials: PathBuf, dot_claude_json: PathBuf) -> Self {
        let dir = credentials.parent().map(Path::to_path_buf).unwrap_or_default();
        Self {
            lock_primary: dir.join(".oauth_refresh.lock"),
            lock_legacy: dir.join(".claude.lock"),
            credentials,
            dot_claude_json,
            lock_timeout_ms: 200,
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
    let endpoint = oauth::HttpTokenEndpoint::new();
    switch_account_inner(
        target_id,
        &SwitchPaths::live(),
        backend.as_ref(),
        &endpoint,
        false,
    )
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


/// How many legacy rotating credential backups are still on disk.
pub fn legacy_credential_backup_count() -> u32 {
    atomic_fs::count_backups(&paths::credentials_path()) as u32
}

/// Delete every legacy rotating credential backup, returning how many went.
///
/// Each one holds a refresh token that has since been rotated away — a spent
/// grant is not a restore point, and restoring one signs the user out. Current
/// switches keep their copy in a temp directory for the length of the
/// transaction only.
pub fn purge_legacy_credential_backups() -> u32 {
    atomic_fs::purge_backups(&paths::credentials_path()) as u32
}

/// Remove a saved account's secret blob from the OS keyring vault (idempotent).
/// Touches only the cchive vault namespace; the live Claude files are untouched.
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
    // A live credential we cannot make sense of must not replace a good stored
    // one — a snapshot with an empty accessToken and expiresAt 0 was found in a
    // real backup on this machine, written by an unguarded path like this.
    oauth::validate_snapshot(&claude_ai_oauth)
        .map_err(|why| CoreError::CorruptFile(format!("live credential: {why}")))?;

    let profile = claude_json::read_oauth_account_at(dot_path)?;

    let id = account_id(profile.oauth_account.as_ref());
    let email = email_of(profile.oauth_account.as_ref());
    let tier = tier_of(
        profile.oauth_account.as_ref(),
        active.descriptor.rate_limit_tier.as_deref(),
    );

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
    endpoint: &dyn TokenEndpoint,
    fail_inject: bool,
) -> Result<SwitchResult, CoreError> {
    // Everything below runs under Claude Code's own credential locks. Its
    // refresh reads, refreshes over the network and saves inside that lock, so
    // an unlocked swap landing in that window is overwritten by the refreshed
    // OLD account's token — and the capture we just took would keep a
    // pre-rotation refresh token. `LockBusy` is a zero-change outcome: nothing
    // below has run.
    claude_locks::with_locks_at(
        &p.lock_primary,
        &p.lock_legacy,
        p.lock_timeout_ms,
        || switch_locked(target_id, p, backend, endpoint, fail_inject),
    )
}

/// The switch transaction proper. Runs with both credential locks held.
fn switch_locked(
    target_id: &str,
    p: &SwitchPaths,
    backend: &dyn CredentialBackend,
    endpoint: &dyn TokenEndpoint,
    fail_inject: bool,
) -> Result<SwitchResult, CoreError> {
    // Read-only env probe — does not block; surfaced in the apply note (G5).
    let env = paths::detect_env_overrides();

    // The target must exist BEFORE we mutate anything: a miss is zero-change.
    if !keyring_store::vault_has(target_id)? {
        return Err(CoreError::AccountNotFound(target_id.to_string()));
    }

    // 1. Capture the live account into the vault so we never lose it (G1, G8).
    //    Read under the lock, so what lands in the vault is the generation on
    //    disk right now — not one an earlier read remembered.
    let active = capture_current(backend, &p.dot_claude_json)?;

    // 2. Back up both files so any failure past here is fully reversible (G1).
    //    Transactional copies in a private temp dir, not the rotating store:
    //    a kept credential backup holds a refresh token that has since been
    //    rotated away, so restoring one signs the user out instead of undoing
    //    anything. Both copies are discarded when this function returns.
    let backup_cred = atomic_fs::backup_transactional(&p.credentials)?;
    let backup_dot = atomic_fs::backup_transactional(&p.dot_claude_json)?;

    // 3. Load the target bundle from the vault.
    let mut target = load_target(target_id)?;

    // Structure before freshness: a blob missing its access token would
    // otherwise be reported as a dead grant ("sign in again"), which is not
    // what is wrong with it. Nothing has been written yet, so this is a
    // zero-change refusal.
    if let Err(why) = oauth::validate_snapshot(&target.claude_ai_oauth) {
        return Err(CoreError::CorruptFile(format!(
            "saved credential for {target_id}: {why} — re-capture this account"
        )));
    }

    // 3b. Freshen before activating. A stored snapshot ages on its own: Claude
    //     Code rotates the refresh token on every refresh and the grant is
    //     single-use, so activating a stale snapshot hands it a dead credential
    //     — which shows up as a 403 on the first first-party handshake, long
    //     before anything says "log in again".
    let freshen = freshen_target(&mut target, target_id, &active, endpoint)?;

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
        tier: tier_of(
            target.oauth_account.as_ref(),
            descriptor.rate_limit_tier.as_deref(),
        ),
        model: None,
        expires_at: descriptor.expires_at,
    };
    atomic_fs::discard(&backup_cred);
    atomic_fs::discard(&backup_dot);

    Ok(SwitchResult {
        identity,
        apply_note: apply_note(&env),
        freshen,
        // Reported, not enforced: other sessions hold the credential they
        // already read, so they keep using the previous account.
        live_sessions: live_session_count(p),
    })
}


/// Refresh the target's token before it is written, when it needs it and when
/// nobody else owns it.
///
/// Two gates, both about **ownership of a single-use grant**:
///
/// 1. The active account is Claude Code's — refreshing it would consume the
///    grant a running session may be about to use.
/// 2. A credential that is not near expiry needs nothing, and refreshing it
///    anyway would burn a grant for no reason.
///
/// A permanent failure is NOT written: activating a credential the server has
/// already rejected would leave the user signed in to nothing, with no clue
/// why. A transient failure activates the stored token as-is — Claude Code
/// refreshes it itself on first use.
fn freshen_target(
    target: &mut VaultBlob,
    target_id: &str,
    active: &AccountMeta,
    endpoint: &dyn TokenEndpoint,
) -> Result<Freshen, CoreError> {
    if active.id == target_id {
        return Ok(Freshen::new(FreshenStatus::SkippedActive));
    }
    let now_ms = now_millis();
    if !oauth::is_near_expiry(&target.claude_ai_oauth, now_ms) {
        return Ok(Freshen::new(FreshenStatus::NotNeeded));
    }

    let outcome = oauth::refresh(&target.claude_ai_oauth, now_ms, endpoint);
    if let Some(next) = outcome.credentials {
        target.claude_ai_oauth = next;
        // Persist the successor immediately: the grant we just spent is dead,
        // so a vault still holding it would fail the next time this account is
        // activated — the exact "stale copy" this spec exists to remove.
        // Under CAS, so a copy someone else advanced meanwhile is never
        // clobbered with ours.
        let expected = outcome.consumed_fp.unwrap_or_default();
        vault_put_cas(target_id, &expected, target)?;
        return Ok(Freshen::new(FreshenStatus::Refreshed));
    }

    match outcome.error {
        Some(RefreshError::Permanent(kind)) => Err(CoreError::CredentialDead(format!(
            "{kind:?}: sign in to this account again, then re-capture it"
        ))),
        Some(RefreshError::Deterministic(kind)) => Err(CoreError::CredentialDead(kind)),
        Some(RefreshError::Transient(why)) => {
            Ok(Freshen::with_detail(FreshenStatus::SkippedTransient, why))
        }
        None => Ok(Freshen::new(FreshenStatus::NotNeeded)),
    }
}


/// Write `blob` back to the vault only if the stored entry is still the
/// generation we refreshed from.
///
/// The comparison is on [`oauth::fingerprint`] — the hash of the *refresh*
/// token, which survives access-token rotation and changes exactly when the
/// lineage advances. A mismatch means another writer got there first with a
/// newer generation; theirs is at least as fresh as ours, so we leave it alone
/// rather than overwrite it with a token we already spent.
fn vault_put_cas(id: &str, expected_fp: &str, blob: &VaultBlob) -> Result<bool, CoreError> {
    if let Ok(current) = keyring_store::vault_get(id) {
        if let Ok(stored) = serde_json::from_str::<VaultBlob>(&current) {
            let stored_fp = oauth::fingerprint(&stored.claude_ai_oauth);
            if stored_fp != expected_fp {
                // Not an error: the switch still activates the credential we
                // hold, which is newer than what we read.
                return Ok(false);
            }
        }
    }
    keyring_store::vault_put(id, &serde_json::to_string(blob)?)?;
    Ok(true)
}

/// Epoch milliseconds, saturating rather than panicking on a bad clock.
fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Running Claude Code processes. Under test the sessions directory sits beside
/// the injected credential file, so a test never counts the developer's own
/// live sessions.
fn live_session_count(p: &SwitchPaths) -> u32 {
    let dir = p
        .credentials
        .parent()
        .map(|d| d.join("sessions"))
        .unwrap_or_else(|| sessions::sessions_dir());
    sessions::live_sessions_at(&dir, &sessions::ProcTable).len() as u32
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
        tier: tier_of(
            profile.oauth_account.as_ref(),
            active.descriptor.rate_limit_tier.as_deref(),
        ),
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
    // The copies have done their job; leaving them on disk would leave a live
    // token in a temp file.
    atomic_fs::discard(backup_cred);
    atomic_fs::discard(backup_dot);
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

/// The account's plan tier for display, preferring the profile
/// (`~/.claude.json` `oauthAccount`) over the credential.
///
/// The credential's `rateLimitTier` is baked into the OAuth token and LAGS a plan
/// change — it only updates when the token is re-issued — whereas the profile's
/// `userRateLimitTier` / `organizationRateLimitTier` reflect the CURRENT plan (what
/// claude.ai and Claude Code show). So right after an upgrade (e.g. Max 5x → 20x)
/// the credential can still say 5x while the profile already says 20x; we show the
/// profile, falling back to the credential when the profile carries no tier.
fn tier_of(oauth_account: Option<&Value>, cred_rate_limit_tier: Option<&str>) -> Option<String> {
    let profile_tier = oauth_account.and_then(Value::as_object).and_then(|m| {
        m.get("userRateLimitTier")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .or_else(|| {
                m.get("organizationRateLimitTier")
                    .and_then(Value::as_str)
                    .filter(|s| !s.is_empty())
            })
    });
    tier_label(profile_tier.or(cred_rate_limit_tier))
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

        let p = SwitchPaths::for_test(cred.clone(), dot.clone());
        let result = switch_account_inner("uuid-b", &p, &backend, &Offline, false).unwrap();

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

        let p = SwitchPaths::for_test(cred.clone(), dot.clone());
        // fail_inject = true: the credential write succeeds, the identity write faults.
        let err = switch_account_inner("uuid-rb-t", &p, &backend, &Offline, true).unwrap_err();
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

        let p = SwitchPaths::for_test(cred.clone(), dot.clone());
        let err = switch_account_inner("does-not-exist-xyz", &p, &backend, &Offline, false).unwrap_err();
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
            .filter(|e| e.file_name().to_string_lossy().contains(".cchive.bak."))
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
    fn tier_prefers_profile_over_stale_credential() {
        // Repro: after upgrading Max 5x → 20x, the credential's rateLimitTier still
        // lags at 5x (the OAuth token isn't re-issued yet) while the profile's
        // organizationRateLimitTier already shows 20x. The displayed tier must be
        // the fresher profile value.
        let dir = tempfile::tempdir().unwrap();
        let cred = dir.path().join(".credentials.json");
        let dot = dir.path().join(".claude.json");
        write_file(&cred, &cred_blob("tok-up", "default_claude_max_5x")); // stale token = 5x
        write_file(
            &dot,
            &json!({
                "oauthAccount": {
                    "accountUuid": "uuid-up",
                    "emailAddress": "up@example.test",
                    "organizationName": "Acme Inc",
                    "organizationRateLimitTier": "default_claude_max_20x" // fresh plan = 20x
                },
                "userID": "uid-up"
            }),
        );

        let identity =
            read_active_identity_inner(&credentials::FileBackend::new(&cred), &dot).unwrap();
        assert_eq!(
            identity.tier.as_deref(),
            Some("Max 20x"),
            "tier must reflect the profile's 20x, not the credential's stale 5x"
        );
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

    #[test]
    fn a_held_credential_lock_makes_the_switch_a_zero_change() {
        let dir = tempfile::tempdir().unwrap();
        let cred = dir.path().join(".credentials.json");
        let dot = dir.path().join(".claude.json");
        let backend = credentials::FileBackend::new(&cred);

        write_file(&cred, &cred_blob("tok-B", "default_claude_max_5x"));
        write_file(&dot, &profile("uuid-b-lock", "b@example.test"));
        capture_current(&backend, &dot).unwrap();

        write_file(&cred, &cred_blob("tok-A", "default_claude_max_20x"));
        write_file(&dot, &profile("uuid-a-lock", "a@example.test"));
        let before_cred = std::fs::read(&cred).unwrap();
        let before_dot = std::fs::read(&dot).unwrap();

        // Someone else (Claude Code, mid-refresh) holds the primary lock.
        let mut p = SwitchPaths::for_test(cred.clone(), dot.clone());
        p.lock_primary = dir.path().join("held.lock");
        std::fs::create_dir(&p.lock_primary).unwrap();

        let err = switch_account_inner("uuid-b-lock", &p, &backend, &Offline, false).unwrap_err();
        assert!(matches!(err, CoreError::LockBusy(_)), "got {err:?}");
        assert_eq!(std::fs::read(&cred).unwrap(), before_cred, "credential untouched");
        assert_eq!(std::fs::read(&dot).unwrap(), before_dot, "identity untouched");
        keyring_store::vault_delete("uuid-b-lock").ok();
    }

    /// Endpoint that always fails in a retryable way. The fixtures below carry
    /// long-expired tokens, so a switch always reaches the freshen step; this
    /// keeps that step from needing the network while leaving activation
    /// unchanged (a transient failure activates the stored token as-is).
    struct Offline;
    impl TokenEndpoint for Offline {
        fn refresh(&self, _rt: &str) -> Result<oauth::TokenResponse, RefreshError> {
            Err(RefreshError::Transient("test: offline".into()))
        }
    }

    /// Endpoint that counts calls and answers with a canned outcome.
    struct Scripted {
        calls: std::cell::Cell<usize>,
        reply: Box<dyn Fn() -> Result<oauth::TokenResponse, RefreshError>>,
    }
    impl Scripted {
        fn ok(access: &'static str, refresh: &'static str) -> Self {
            Scripted {
                calls: std::cell::Cell::new(0),
                reply: Box::new(move || {
                    Ok(oauth::TokenResponse {
                        access_token: access.into(),
                        expires_in: 28_800,
                        refresh_token: Some(refresh.into()),
                        scope: None,
                    })
                }),
            }
        }
        fn failing(make: impl Fn() -> RefreshError + 'static) -> Self {
            Scripted { calls: std::cell::Cell::new(0), reply: Box::new(move || Err(make())) }
        }
    }
    impl TokenEndpoint for Scripted {
        fn refresh(&self, _rt: &str) -> Result<oauth::TokenResponse, RefreshError> {
            self.calls.set(self.calls.get() + 1);
            (self.reply)()
        }
    }

    /// Stage `id` into the vault with the given credential, leaving `A` live.
    fn stage(dir: &Path, cred: &Path, dot: &Path, backend: &credentials::FileBackend,
             id: &str, blob: Value) -> SwitchPaths {
        write_file(cred, &blob);
        write_file(dot, &profile(id, "staged@example.test"));
        capture_current(backend, dot).unwrap();
        write_file(cred, &cred_blob("tok-A", "default_claude_max_20x"));
        write_file(dot, &profile("uuid-live-a", "a@example.test"));
        let _ = dir;
        SwitchPaths::for_test(cred.to_path_buf(), dot.to_path_buf())
    }

    fn blob_expiring(token: &str, expires_at: i64) -> Value {
        json!({
            "claudeAiOauth": {
                "accessToken": token,
                "refreshToken": format!("ref-{token}"),
                "expiresAt": expires_at,
                "subscriptionType": "max",
                "rateLimitTier": "default_claude_max_20x"
            },
            "mcpOAuth": { "plugin:demo|h": { "accessToken": "MCP-SECRET" } }
        })
    }

    fn far_future() -> i64 {
        now_millis() + 8 * 60 * 60 * 1000
    }

    #[test]
    fn a_fresh_target_is_activated_without_touching_the_network() {
        let dir = tempfile::tempdir().unwrap();
        let cred = dir.path().join(".credentials.json");
        let dot = dir.path().join(".claude.json");
        let backend = credentials::FileBackend::new(&cred);
        let p = stage(dir.path(), &cred, &dot, &backend, "uuid-fresh",
                      blob_expiring("tok-fresh", far_future()));

        let ep = Scripted::ok("unused", "unused");
        let out = switch_account_inner("uuid-fresh", &p, &backend, &ep, false).unwrap();

        assert_eq!(out.freshen.status, FreshenStatus::NotNeeded);
        assert_eq!(ep.calls.get(), 0, "a valid token must not burn a grant");
        keyring_store::vault_delete("uuid-fresh").ok();
        keyring_store::vault_delete("uuid-live-a").ok();
    }

    #[test]
    fn an_expired_target_is_refreshed_and_the_successor_is_persisted() {
        let dir = tempfile::tempdir().unwrap();
        let cred = dir.path().join(".credentials.json");
        let dot = dir.path().join(".claude.json");
        let backend = credentials::FileBackend::new(&cred);
        let p = stage(dir.path(), &cred, &dot, &backend, "uuid-stale",
                      blob_expiring("tok-stale", 1_750_000_000_000));

        let ep = Scripted::ok("tok-refreshed", "ref-rotated");
        let out = switch_account_inner("uuid-stale", &p, &backend, &ep, false).unwrap();

        assert_eq!(out.freshen.status, FreshenStatus::Refreshed);
        assert_eq!(ep.calls.get(), 1);

        // The live credential got the successor…
        let live = atomic_fs::read_json_value(&cred).unwrap();
        assert_eq!(live["claudeAiOauth"]["accessToken"], "tok-refreshed");
        // …and so did the vault: a stored copy keeping the spent grant is
        // exactly the stale-copy failure this spec removes.
        let stored: Value = serde_json::from_str(&keyring_store::vault_get("uuid-stale").unwrap()).unwrap();
        assert_eq!(stored["claudeAiOauth"]["refreshToken"], "ref-rotated");
        // mcpOAuth (machine-shared) still belongs to the live file.
        assert_eq!(live["mcpOAuth"]["plugin:demo|h"]["accessToken"], "MCP-SECRET");

        keyring_store::vault_delete("uuid-stale").ok();
        keyring_store::vault_delete("uuid-live-a").ok();
    }

    #[test]
    fn a_dead_grant_is_not_activated() {
        let dir = tempfile::tempdir().unwrap();
        let cred = dir.path().join(".credentials.json");
        let dot = dir.path().join(".claude.json");
        let backend = credentials::FileBackend::new(&cred);
        let p = stage(dir.path(), &cred, &dot, &backend, "uuid-dead",
                      blob_expiring("tok-dead", 1_750_000_000_000));
        let before = std::fs::read(&cred).unwrap();

        let ep = Scripted::failing(|| {
            RefreshError::Permanent(oauth::PermanentKind::InvalidGrant)
        });
        let err = switch_account_inner("uuid-dead", &p, &backend, &ep, false).unwrap_err();

        assert!(matches!(err, CoreError::CredentialDead(_)), "got {err:?}");
        assert_eq!(
            std::fs::read(&cred).unwrap(),
            before,
            "a server-rejected credential must never be activated"
        );
        keyring_store::vault_delete("uuid-dead").ok();
        keyring_store::vault_delete("uuid-live-a").ok();
    }

    #[test]
    fn a_transient_refresh_failure_still_activates() {
        let dir = tempfile::tempdir().unwrap();
        let cred = dir.path().join(".credentials.json");
        let dot = dir.path().join(".claude.json");
        let backend = credentials::FileBackend::new(&cred);
        let p = stage(dir.path(), &cred, &dot, &backend, "uuid-flaky",
                      blob_expiring("tok-flaky", 1_750_000_000_000));

        let ep = Scripted::failing(|| RefreshError::Transient("timed out".into()));
        let out = switch_account_inner("uuid-flaky", &p, &backend, &ep, false).unwrap();

        assert_eq!(out.freshen.status, FreshenStatus::SkippedTransient);
        assert_eq!(out.freshen.detail.as_deref(), Some("timed out"));
        let live = atomic_fs::read_json_value(&cred).unwrap();
        assert_eq!(live["claudeAiOauth"]["accessToken"], "tok-flaky");
        keyring_store::vault_delete("uuid-flaky").ok();
        keyring_store::vault_delete("uuid-live-a").ok();
    }

    #[test]
    fn the_active_account_is_never_refreshed() {
        let dir = tempfile::tempdir().unwrap();
        let cred = dir.path().join(".credentials.json");
        let dot = dir.path().join(".claude.json");
        let backend = credentials::FileBackend::new(&cred);

        // Stage it and leave it active — switching to yourself must not consume
        // the grant a running Claude Code may be about to use.
        write_file(&cred, &blob_expiring("tok-self", 1_750_000_000_000));
        write_file(&dot, &profile("uuid-self", "self@example.test"));
        capture_current(&backend, &dot).unwrap();
        let p = SwitchPaths::for_test(cred.clone(), dot.clone());

        let ep = Scripted::ok("must-not-be-used", "must-not-be-used");
        let out = switch_account_inner("uuid-self", &p, &backend, &ep, false).unwrap();

        assert_eq!(out.freshen.status, FreshenStatus::SkippedActive);
        assert_eq!(ep.calls.get(), 0);
        keyring_store::vault_delete("uuid-self").ok();
    }

    #[test]
    fn vault_write_back_does_not_clobber_a_newer_generation() {
        let id = "uuid-cas";
        let stored = VaultBlob {
            claude_ai_oauth: json!({
                "accessToken": "at-newer",
                "refreshToken": "rt-newer",
                "expiresAt": far_future(),
            }),
            oauth_account: None,
            user_id: None,
        };
        keyring_store::vault_put(id, &serde_json::to_string(&stored).unwrap()).unwrap();

        // We refreshed from an older generation (different refresh token).
        let ours = VaultBlob {
            claude_ai_oauth: json!({
                "accessToken": "at-ours",
                "refreshToken": "rt-ours",
                "expiresAt": far_future(),
            }),
            oauth_account: None,
            user_id: None,
        };
        let stale_fp = oauth::fingerprint(&json!({"refreshToken": "rt-older"}));
        let written = vault_put_cas(id, &stale_fp, &ours).unwrap();

        assert!(!written, "a superseded generation must not be written back");
        let after: VaultBlob =
            serde_json::from_str(&keyring_store::vault_get(id).unwrap()).unwrap();
        assert_eq!(after.claude_ai_oauth["accessToken"], "at-newer");

        // Matching fingerprint writes.
        let fp = oauth::fingerprint(&stored.claude_ai_oauth);
        assert!(vault_put_cas(id, &fp, &ours).unwrap());
        let after: VaultBlob =
            serde_json::from_str(&keyring_store::vault_get(id).unwrap()).unwrap();
        assert_eq!(after.claude_ai_oauth["accessToken"], "at-ours");

        keyring_store::vault_delete(id).ok();
    }

    #[test]
    fn a_corrupt_stored_credential_is_not_activated() {
        let dir = tempfile::tempdir().unwrap();
        let cred = dir.path().join(".credentials.json");
        let dot = dir.path().join(".claude.json");
        let backend = credentials::FileBackend::new(&cred);

        // The shape found in a real backup: empty token, expiresAt 0. It cannot
        // be captured through the normal path any more, so stage it directly.
        let broken = VaultBlob {
            claude_ai_oauth: json!({"accessToken": "", "expiresAt": 0}),
            oauth_account: Some(json!({"accountUuid": "uuid-broken"})),
            user_id: Some("uid".into()),
        };
        keyring_store::vault_put("uuid-broken", &serde_json::to_string(&broken).unwrap()).unwrap();

        write_file(&cred, &cred_blob("tok-A", "default_claude_max_20x"));
        write_file(&dot, &profile("uuid-live-a", "a@example.test"));
        let before = std::fs::read(&cred).unwrap();
        let p = SwitchPaths::for_test(cred.clone(), dot.clone());

        let err = switch_account_inner("uuid-broken", &p, &backend, &Offline, false).unwrap_err();
        assert!(matches!(err, CoreError::CorruptFile(_)), "got {err:?}");
        assert_eq!(std::fs::read(&cred).unwrap(), before);

        keyring_store::vault_delete("uuid-broken").ok();
        keyring_store::vault_delete("uuid-live-a").ok();
    }

    #[test]
    fn a_corrupt_live_credential_does_not_replace_a_good_capture() {
        let dir = tempfile::tempdir().unwrap();
        let cred = dir.path().join(".credentials.json");
        let dot = dir.path().join(".claude.json");
        let backend = credentials::FileBackend::new(&cred);

        write_file(&cred, &json!({"claudeAiOauth": {"accessToken": "", "expiresAt": 0}}));
        write_file(&dot, &profile("uuid-live-broken", "x@example.test"));

        let err = capture_current(&backend, &dot).unwrap_err();
        assert!(matches!(err, CoreError::CorruptFile(_)), "got {err:?}");
    }

    #[test]
    fn switching_leaves_no_credential_backup_beside_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let cred = dir.path().join(".credentials.json");
        let dot = dir.path().join(".claude.json");
        let backend = credentials::FileBackend::new(&cred);
        let p = stage(dir.path(), &cred, &dot, &backend, "uuid-nobak",
                      blob_expiring("tok-nobak", far_future()));

        switch_account_inner("uuid-nobak", &p, &backend, &Offline, false).unwrap();

        // A kept credential backup holds a spent refresh token — restoring one
        // signs the user out rather than undoing anything.
        let leftovers: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            // Only the credential matters: `.claude.json` backups carry a
            // profile, not a token, and their rotation is still useful.
            .filter(|n| n.starts_with(".credentials.json.cchive.bak."))
            .collect();
        assert!(leftovers.is_empty(), "unexpected backups: {leftovers:?}");

        keyring_store::vault_delete("uuid-nobak").ok();
        keyring_store::vault_delete("uuid-live-a").ok();
    }
}
