//! The Grok account engine — capture / switch / identity against
//! `$GROK_HOME/auth.json`. A trimmed mirror of `core/codex.rs`: a Grok
//! "account" is the whole `auth.json` text (the file is a map keyed by
//! `<issuer>::<client_id>`; two personal logins collide, so we never merge).
//!
//! SAFETY: no token EVER crosses a return value. `key` / `refresh_token` live
//! only in the OS keyring + on disk. Identity is plaintext `email` /
//! `first_name` / `user_id`. Plan is the last `ctx.subscriptionTier` from
//! `unified.jsonl` — never a JWT `tier` number.

use std::path::Path;

use chrono::DateTime;
use serde_json::Value;

use super::{atomic_fs, keyring_store, paths};
use crate::model::{GrokAccountMeta, GrokIdentity, CoreError};

const LOG_TAIL_BYTES: u64 = 512 * 1024;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Report the active Grok identity. Missing/unreadable `auth.json` → kind none.
/// No token ever leaves.
pub fn read_active_grok_identity() -> Result<GrokIdentity, CoreError> {
    Ok(identity_from_file(
        &paths::grok_auth_path(),
        &paths::grok_logs_path(),
    ))
}

/// Capture the live Grok account into the vault and return its non-secret meta.
pub fn add_grok_account_from_active() -> Result<GrokAccountMeta, CoreError> {
    capture_grok_at(&paths::grok_auth_path(), &paths::grok_logs_path())
}

/// Switch the live `auth.json` to saved account `id` (atomic, backup-first,
/// rollback on failure) and return the new active identity.
pub fn switch_grok_account(target_id: &str) -> Result<GrokIdentity, CoreError> {
    switch_grok_inner(
        target_id,
        &paths::grok_auth_path(),
        &paths::grok_logs_path(),
        false,
    )
}

/// Drop a saved Grok account from the vault. The live `auth.json` is untouched.
pub fn remove_grok_account(id: &str) -> Result<(), CoreError> {
    keyring_store::grok_vault_delete(id)
}

/// Last `ctx.subscriptionTier` from a billing line in `unified.jsonl`.
/// Missing/unreadable/no match → `None`. Never maps JWT `tier`.
pub fn read_subscription_tier(log_path: &Path) -> Option<String> {
    read_credits_tier(log_path).and_then(|t| {
        let t = t.trim();
        (!t.is_empty()).then(|| t.to_string())
    })
}

// ---------------------------------------------------------------------------
// Internals (path-injectable so tests need no env mutation)
// ---------------------------------------------------------------------------

fn grok_none_identity() -> GrokIdentity {
    GrokIdentity {
        kind: "none".to_string(),
        label: "No Grok account".to_string(),
        email: None,
        plan: None,
        expires_at: None,
    }
}

fn identity_from_file(auth_path: &Path, log_path: &Path) -> GrokIdentity {
    let Ok(text) = std::fs::read_to_string(auth_path) else {
        return grok_none_identity();
    };
    let Ok(auth) = serde_json::from_str::<Value>(&text) else {
        return grok_none_identity();
    };
    let plan = read_subscription_tier(log_path);
    identity_from_auth(&auth, plan).unwrap_or_else(grok_none_identity)
}

/// First session object in the map that has a non-empty `email`.
fn first_session(auth: &Value) -> Option<&Value> {
    let obj = auth.as_object()?;
    obj.values().find(|v| {
        v.get("email")
            .and_then(Value::as_str)
            .is_some_and(|s| !s.is_empty())
    })
}

fn identity_from_auth(auth: &Value, plan: Option<String>) -> Option<GrokIdentity> {
    let entry = first_session(auth)?;
    let email = entry
        .get("email")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(String::from)?;
    let first_name = entry
        .get("first_name")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(String::from);
    let label = first_name.clone().unwrap_or_else(|| email.clone());
    let expires_at = entry
        .get("expires_at")
        .and_then(Value::as_str)
        .and_then(parse_expires_ms);
    Some(GrokIdentity {
        kind: "account".to_string(),
        label,
        email: Some(email),
        plan,
        expires_at,
    })
}

fn parse_expires_ms(s: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.timestamp_millis())
}

fn account_id_of(auth: &Value) -> String {
    let Some(entry) = first_session(auth) else {
        return "grok-default".to_string();
    };
    if let Some(id) = entry
        .get("user_id")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    {
        return format!("grok-{id}");
    }
    if let Some(id) = entry
        .get("principal_id")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    {
        return format!("grok-{id}");
    }
    "grok-default".to_string()
}

fn capture_grok_at(auth_path: &Path, log_path: &Path) -> Result<GrokAccountMeta, CoreError> {
    let text = std::fs::read_to_string(auth_path)
        .map_err(|_| CoreError::NotFound("no live ~/.grok/auth.json to capture".to_string()))?;
    let auth: Value = serde_json::from_str(&text)
        .map_err(|e| CoreError::InvalidInput(format!("~/.grok/auth.json is not valid JSON: {e}")))?;
    if first_session(&auth).is_none() {
        return Err(CoreError::NotFound(
            "nothing to capture".to_string(),
        ));
    }
    let id = account_id_of(&auth);
    let plan = read_subscription_tier(log_path);
    let (label, email) = match identity_from_auth(&auth, plan.clone()) {
        Some(i) => (i.label, i.email),
        None => ("Grok account".to_string(), None),
    };
    keyring_store::grok_vault_put(&id, &text)?;
    Ok(GrokAccountMeta {
        id,
        label,
        email,
        plan,
        last_used: None,
    })
}

fn switch_grok_inner(
    target_id: &str,
    auth_path: &Path,
    log_path: &Path,
    fail_inject: bool,
) -> Result<GrokIdentity, CoreError> {
    if !keyring_store::grok_vault_has(target_id)? {
        return Err(CoreError::AccountNotFound(target_id.to_string()));
    }
    let payload = keyring_store::grok_vault_get(target_id)?;
    let backup = atomic_fs::backup(auth_path)?;
    if let Err(e) = atomic_fs::atomic_write(auth_path, payload.as_bytes(), Some(0o600)) {
        if let Some(h) = &backup {
            let _ = atomic_fs::restore(h);
        }
        return Err(CoreError::SwitchFailedRolledBack(e.to_string()));
    }
    if fail_inject {
        if let Some(h) = &backup {
            let _ = atomic_fs::restore(h);
        }
        return Err(CoreError::SwitchFailedRolledBack(
            "injected post-write failure (test)".to_string(),
        ));
    }
    let auth: Value = serde_json::from_str(&payload).unwrap_or(Value::Null);
    let plan = read_subscription_tier(log_path);
    Ok(identity_from_auth(&auth, plan).unwrap_or_else(grok_none_identity))
}

/// Tail `unified.jsonl` and return the last `ctx.subscriptionTier` on a line
/// that carries `creditUsagePercent`.
fn read_credits_tier(log_path: &Path) -> Option<String> {
    let rec = last_billing_record(log_path)?;
    rec.get("ctx")
        .and_then(|c| c.get("subscriptionTier"))
        .and_then(Value::as_str)
        .map(String::from)
}

fn last_billing_record(log_path: &Path) -> Option<Value> {
    let meta = std::fs::metadata(log_path).ok()?;
    let size = meta.len();
    let mut file = std::fs::File::open(log_path).ok()?;
    use std::io::{Read, Seek, SeekFrom};
    let start = size.saturating_sub(LOG_TAIL_BYTES);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf);
    let lines = if start > 0 {
        text.split('\n').skip(1)
    } else {
        // skip(0) still works; unify types via a Vec.
        text.split('\n').skip(0)
    };
    let mut found = None;
    for line in lines {
        if !line.contains("creditUsagePercent") {
            continue;
        }
        if let Ok(rec) = serde_json::from_str::<Value>(line) {
            if rec
                .pointer("/ctx/config/creditUsagePercent")
                .and_then(Value::as_f64)
                .is_some()
            {
                found = Some(rec);
            }
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Distinctive JWT-shaped secret that must never appear on a DTO.
    const LEAK_KEY: &str = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWVyIjo1LCJzdWIiOiJsZWFrIn0.sig";
    const LEAK_REFRESH: &str = "SECRET-GROK-REFRESH";

    fn oidc_auth(email: &str, user_id: &str, first_name: &str) -> String {
        serde_json::json!({
            "https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828": {
                "auth_mode": "oidc",
                "key": LEAK_KEY,
                "refresh_token": LEAK_REFRESH,
                "email": email,
                "first_name": first_name,
                "user_id": user_id,
                "principal_id": user_id,
                "expires_at": "2026-12-01T00:00:00Z"
            }
        })
        .to_string()
    }

    fn billing_line(tier: &str, percent: f64) -> String {
        serde_json::json!({
            "msg": "billing: fetched credits config",
            "ts": "2026-09-06T12:00:00Z",
            "ctx": {
                "subscriptionTier": tier,
                "config": {
                    "creditUsagePercent": percent,
                    "currentPeriod": {
                        "type": "USAGE_PERIOD_TYPE_WEEKLY",
                        "start": "2026-08-30T15:02:43Z",
                        "end": "2026-09-06T15:02:43Z"
                    }
                }
            }
        })
        .to_string()
    }

    fn write_log(dir: &Path, lines: &[&str]) -> std::path::PathBuf {
        let logs = dir.join("logs");
        std::fs::create_dir_all(&logs).unwrap();
        let path = logs.join("unified.jsonl");
        std::fs::write(&path, lines.join("\n") + "\n").unwrap();
        path
    }

    #[test]
    fn identity_missing_file_is_none() {
        let id = identity_from_file(
            Path::new("/nonexistent/grok/auth.json"),
            Path::new("/nonexistent/grok/logs/unified.jsonl"),
        );
        assert_eq!(id.kind, "none");
        assert!(id.plan.is_none());
    }

    #[test]
    fn identity_oidc_reads_plaintext_email_and_plan_from_log() {
        let dir = tempfile::tempdir().unwrap();
        let auth_path = dir.path().join("auth.json");
        std::fs::write(
            &auth_path,
            oidc_auth("lucas.moreau@gmail.com", "uid-lucas", "Lucas"),
        )
        .unwrap();
        let log_path = write_log(dir.path(), &[&billing_line("SuperGrok Heavy", 73.0)]);
        let id = identity_from_file(&auth_path, &log_path);
        assert_eq!(id.kind, "account");
        assert_eq!(id.email.as_deref(), Some("lucas.moreau@gmail.com"));
        assert_eq!(id.label, "Lucas");
        assert_eq!(id.plan.as_deref(), Some("SuperGrok Heavy"));
        assert_ne!(id.plan.as_deref(), Some("5"));
    }

    #[test]
    fn identity_plan_empty_without_log() {
        let dir = tempfile::tempdir().unwrap();
        let auth_path = dir.path().join("auth.json");
        std::fs::write(&auth_path, oidc_auth("a@b.dev", "uid-a", "Ada")).unwrap();
        let id = identity_from_file(&auth_path, &dir.path().join("logs/unified.jsonl"));
        assert_eq!(id.kind, "account");
        assert!(id.plan.is_none(), "missing log must not invent a plan");
    }

    #[test]
    fn capture_then_switch_roundtrips_and_upserts() {
        let dir = tempfile::tempdir().unwrap();
        let auth_path = dir.path().join("auth.json");
        let log_path = write_log(dir.path(), &[&billing_line("SuperGrok Heavy", 10.0)]);
        let payload = oidc_auth("capture@example.dev", "uid-capture", "Cap");
        std::fs::write(&auth_path, &payload).unwrap();

        let meta = capture_grok_at(&auth_path, &log_path).unwrap();
        assert_eq!(meta.id, "grok-uid-capture");
        assert_eq!(meta.email.as_deref(), Some("capture@example.dev"));
        assert_eq!(meta.plan.as_deref(), Some("SuperGrok Heavy"));
        assert!(keyring_store::grok_vault_has(&meta.id).unwrap());
        let meta2 = capture_grok_at(&auth_path, &log_path).unwrap();
        assert_eq!(meta2.id, meta.id);

        std::fs::write(&auth_path, "{}").unwrap();
        let id = switch_grok_inner(&meta.id, &auth_path, &log_path, false).unwrap();
        assert_eq!(id.email.as_deref(), Some("capture@example.dev"));
        assert_eq!(std::fs::read_to_string(&auth_path).unwrap(), payload);
    }

    #[test]
    fn switch_two_distinct_user_ids_replaces_live_file() {
        let dir = tempfile::tempdir().unwrap();
        let auth_path = dir.path().join("auth.json");
        let log_path = write_log(dir.path(), &[&billing_line("SuperGrok Heavy", 1.0)]);
        let a = oidc_auth("a@example.dev", "uid-aaa", "Ada");
        let b = oidc_auth("b@example.dev", "uid-bbb", "Bea");
        std::fs::write(&auth_path, &a).unwrap();
        let meta_a = capture_grok_at(&auth_path, &log_path).unwrap();
        std::fs::write(&auth_path, &b).unwrap();
        let meta_b = capture_grok_at(&auth_path, &log_path).unwrap();
        assert_ne!(meta_a.id, meta_b.id);

        let switched = switch_grok_inner(&meta_a.id, &auth_path, &log_path, false).unwrap();
        assert_eq!(switched.email.as_deref(), Some("a@example.dev"));
        assert_eq!(std::fs::read_to_string(&auth_path).unwrap(), a);
    }

    #[test]
    fn switch_unknown_id_errors_without_touching_file() {
        let dir = tempfile::tempdir().unwrap();
        let auth_path = dir.path().join("auth.json");
        std::fs::write(&auth_path, "ORIGINAL").unwrap();
        let err = switch_grok_inner(
            "grok-nope-xyz",
            &auth_path,
            &dir.path().join("logs/unified.jsonl"),
            false,
        )
        .unwrap_err();
        assert!(matches!(err, CoreError::AccountNotFound(_)));
        assert_eq!(std::fs::read_to_string(&auth_path).unwrap(), "ORIGINAL");
    }

    #[test]
    fn switch_failure_rolls_back_to_original() {
        let dir = tempfile::tempdir().unwrap();
        let auth_path = dir.path().join("auth.json");
        let log_path = write_log(dir.path(), &[&billing_line("SuperGrok Heavy", 1.0)]);
        let original = oidc_auth("orig@example.dev", "uid-orig", "Orig");
        std::fs::write(&auth_path, &original).unwrap();
        let meta = capture_grok_at(&auth_path, &log_path).unwrap();
        let err = switch_grok_inner(&meta.id, &auth_path, &log_path, true).unwrap_err();
        assert!(matches!(err, CoreError::SwitchFailedRolledBack(_)));
        assert_eq!(std::fs::read_to_string(&auth_path).unwrap(), original);
    }

    #[test]
    fn remove_drops_vault_entry_only() {
        let dir = tempfile::tempdir().unwrap();
        let auth_path = dir.path().join("auth.json");
        let log_path = write_log(dir.path(), &[&billing_line("SuperGrok Heavy", 1.0)]);
        let payload = oidc_auth("rm@example.dev", "uid-rm", "Rm");
        std::fs::write(&auth_path, &payload).unwrap();
        let meta = capture_grok_at(&auth_path, &log_path).unwrap();
        remove_grok_account(&meta.id).unwrap();
        assert!(!keyring_store::grok_vault_has(&meta.id).unwrap());
        assert_eq!(std::fs::read_to_string(&auth_path).unwrap(), payload);
    }

    #[test]
    fn meta_and_identity_carry_no_secret_and_no_jwt_tier_plan() {
        let dir = tempfile::tempdir().unwrap();
        let auth_path = dir.path().join("auth.json");
        let log_path = write_log(dir.path(), &[&billing_line("SuperGrok Heavy", 73.0)]);
        std::fs::write(
            &auth_path,
            oidc_auth("leak@example.dev", "uid-leak", "Leak"),
        )
        .unwrap();

        let meta = capture_grok_at(&auth_path, &log_path).unwrap();
        let identity = identity_from_file(&auth_path, &log_path);
        let meta_json = serde_json::to_string(&meta).unwrap();
        let id_json = serde_json::to_string(&identity).unwrap();
        for needle in [LEAK_KEY, LEAK_REFRESH, "refresh_token"] {
            assert!(!meta_json.contains(needle), "GrokAccountMeta leaked {needle}");
            assert!(!id_json.contains(needle), "GrokIdentity leaked {needle}");
        }
        assert_eq!(identity.plan.as_deref(), Some("SuperGrok Heavy"));
        assert!(!id_json.contains("\"plan\":\"5\""));
        assert!(!id_json.contains("\"plan\":5"));
        // The JWT payload encodes tier 5; it must not become the plan label.
        assert_ne!(identity.plan.as_deref(), Some("5"));
    }

    #[test]
    fn capture_without_email_is_nothing_to_capture() {
        let dir = tempfile::tempdir().unwrap();
        let auth_path = dir.path().join("auth.json");
        std::fs::write(&auth_path, "{}").unwrap();
        let err = capture_grok_at(&auth_path, &dir.path().join("no-log")).unwrap_err();
        assert!(matches!(err, CoreError::NotFound(_)));
    }
}
