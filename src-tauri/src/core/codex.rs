//! The Codex account engine — capture / switch / identity against
//! `~/.codex/auth.json`. A trimmed mirror of `core/switch.rs`: Codex keeps a
//! single opaque auth file (no sibling identity cache, no `mcpOAuth` to
//! preserve), so a "Codex account" is simply the whole `auth.json` text.
//!
//! SAFETY: no token EVER crosses a return value. The payload (id_token /
//! access / refresh / API key) lives only in the OS keyring + on disk; the
//! identity we surface carries email + plan label + expiry only.
#![allow(dead_code)] // commands wire these up in a later task

use std::path::Path;

use serde_json::Value;

use super::{atomic_fs, keyring_store, paths};
use crate::model::{CodexAccountMeta, CodexIdentity, CoreError};

// ---------------------------------------------------------------------------
// Public API (mirrors core/switch.rs)
// ---------------------------------------------------------------------------

/// Report the active Codex identity. When a gateway provider is active in
/// `config.toml`, that takes precedence (Codex routes there); otherwise the
/// `auth.json` account/apikey. No token ever leaves.
pub fn read_active_codex_identity() -> Result<CodexIdentity, CoreError> {
    if let Some((_id, label, base_url)) =
        super::codex_provider::read_active_provider(&paths::codex_config_path())
    {
        return Ok(CodexIdentity {
            kind: "provider".to_string(),
            label,
            email: base_url_host(&base_url), // the gateway host in the hero sub
            plan: Some("Gateway".to_string()),
            expires_at: None,
        });
    }
    Ok(identity_from_file(&paths::codex_auth_path()))
}

/// Host of a base URL for display (e.g. `https://pixie.example/v1` -> `pixie.example`).
fn base_url_host(base_url: &str) -> Option<String> {
    let s = base_url.trim();
    if s.is_empty() {
        return None;
    }
    let no_scheme = s.split("://").last().unwrap_or(s);
    let host = no_scheme.split('/').next().unwrap_or(no_scheme).trim();
    (!host.is_empty()).then(|| host.to_string())
}

/// Capture the live Codex account into the vault and return its non-secret meta.
pub fn add_codex_account_from_active() -> Result<CodexAccountMeta, CoreError> {
    capture_codex_at(&paths::codex_auth_path())
}

/// Switch the live `~/.codex/auth.json` to saved account `id` (atomic, backup-first,
/// rollback on failure) and return the new active identity.
pub fn switch_codex_account(target_id: &str) -> Result<CodexIdentity, CoreError> {
    switch_codex_inner(target_id, &paths::codex_auth_path(), false)
}

/// Drop a saved Codex account from the vault. The live `auth.json` is untouched.
pub fn remove_codex_account(id: &str) -> Result<(), CoreError> {
    keyring_store::codex_vault_delete(id)
}

// ---------------------------------------------------------------------------
// Internals (path-injectable so tests need no env mutation)
// ---------------------------------------------------------------------------

fn codex_none_identity() -> CodexIdentity {
    CodexIdentity {
        kind: "none".to_string(),
        label: "No Codex account".to_string(),
        email: None,
        plan: None,
        expires_at: None,
    }
}

fn identity_from_file(path: &Path) -> CodexIdentity {
    let Ok(text) = std::fs::read_to_string(path) else {
        return codex_none_identity();
    };
    let Ok(auth) = serde_json::from_str::<Value>(&text) else {
        return codex_none_identity();
    };
    identity_from_auth(&auth).unwrap_or_else(codex_none_identity)
}

/// Derive the non-secret identity from a parsed `auth.json`. Returns `None` only
/// when a chatgpt-mode token cannot be decoded at all (caller maps that to "none").
fn identity_from_auth(auth: &Value) -> Option<CodexIdentity> {
    let mode = auth.get("auth_mode").and_then(Value::as_str).unwrap_or("");
    let id_token = auth
        .get("tokens")
        .and_then(|t| t.get("id_token"))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty());
    let api_key_set = auth
        .get("OPENAI_API_KEY")
        .and_then(Value::as_str)
        .is_some_and(|k| !k.is_empty());

    // API-key mode (explicit, or a key present with no ChatGPT token).
    if mode == "apikey" || (id_token.is_none() && api_key_set) {
        return Some(CodexIdentity {
            kind: "apikey".to_string(),
            label: "API key".to_string(),
            email: None,
            plan: Some("API key".to_string()),
            expires_at: None,
        });
    }

    // ChatGPT mode: read claims from the id_token (display-only, no signature check).
    let claims = decode_jwt_claims(id_token?)?;
    let email = claims.get("email").and_then(Value::as_str).map(String::from);
    let name = claims.get("name").and_then(Value::as_str).map(String::from);
    let plan = claims
        .get("https://api.openai.com/auth")
        .and_then(|a| a.get("chatgpt_plan_type"))
        .and_then(Value::as_str)
        .map(plan_label);
    let expires_at = claims.get("exp").and_then(Value::as_i64).map(|s| s * 1000);
    let label = name
        .or_else(|| email.clone())
        .unwrap_or_else(|| "Codex account".to_string());

    Some(CodexIdentity {
        kind: "account".to_string(),
        label,
        email,
        plan,
        expires_at,
    })
}

fn capture_codex_at(path: &Path) -> Result<CodexAccountMeta, CoreError> {
    let text = std::fs::read_to_string(path)
        .map_err(|_| CoreError::NotFound("no live ~/.codex/auth.json to capture".to_string()))?;
    let auth: Value = serde_json::from_str(&text)
        .map_err(|e| CoreError::InvalidInput(format!("~/.codex/auth.json is not valid JSON: {e}")))?;

    let id = account_id_of(&auth);
    let (label, email, plan) = match identity_from_auth(&auth) {
        Some(i) => (i.label, i.email, i.plan),
        None => ("Codex account".to_string(), None, None),
    };

    // The WHOLE auth payload is the secret — keyring only, never a return value.
    keyring_store::codex_vault_put(&id, &text)?;

    Ok(CodexAccountMeta {
        id,
        label,
        email,
        plan,
        last_used: None,
    })
}

fn switch_codex_inner(
    target_id: &str,
    path: &Path,
    fail_inject: bool,
) -> Result<CodexIdentity, CoreError> {
    // A miss is zero-change: never touch the live file for an unknown id.
    if !keyring_store::codex_vault_has(target_id)? {
        return Err(CoreError::AccountNotFound(target_id.to_string()));
    }
    let payload = keyring_store::codex_vault_get(target_id)?;

    // Back up first so any failure past here is fully reversible.
    let backup = atomic_fs::backup(path)?;

    // Atomic write (temp + fsync + rename, 0600) — the live file is never half-written.
    if let Err(e) = atomic_fs::atomic_write(path, payload.as_bytes(), Some(0o600)) {
        if let Some(h) = &backup {
            let _ = atomic_fs::restore(h);
        }
        return Err(CoreError::SwitchFailedRolledBack(e.to_string()));
    }

    // `fail_inject` (test-only) simulates a post-write fault to exercise the rollback.
    if fail_inject {
        if let Some(h) = &backup {
            let _ = atomic_fs::restore(h);
        }
        return Err(CoreError::SwitchFailedRolledBack(
            "injected post-write failure (test)".to_string(),
        ));
    }

    let auth: Value = serde_json::from_str(&payload).unwrap_or(Value::Null);
    Ok(identity_from_auth(&auth).unwrap_or_else(codex_none_identity))
}

/// A stable id for de-dup: the ChatGPT `account_id`, else a hash of the email,
/// else a hash of the API key, else a single default. Never the raw secret.
fn account_id_of(auth: &Value) -> String {
    if let Some(id) = auth
        .get("tokens")
        .and_then(|t| t.get("account_id"))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    {
        return format!("codex-{id}");
    }
    if let Some(claims) = auth
        .get("tokens")
        .and_then(|t| t.get("id_token"))
        .and_then(Value::as_str)
        .and_then(decode_jwt_claims)
    {
        if let Some(email) = claims.get("email").and_then(Value::as_str) {
            return format!("codex-{}", fnv1a(email));
        }
    }
    if let Some(key) = auth
        .get("OPENAI_API_KEY")
        .and_then(Value::as_str)
        .filter(|k| !k.is_empty())
    {
        return format!("codex-key-{}", fnv1a(key));
    }
    "codex-default".to_string()
}

fn plan_label(raw: &str) -> String {
    match raw.to_ascii_lowercase().as_str() {
        "pro" => "ChatGPT Pro".to_string(),
        "plus" => "ChatGPT Plus".to_string(),
        "team" => "ChatGPT Team".to_string(),
        "free" => "ChatGPT Free".to_string(),
        "business" => "ChatGPT Business".to_string(),
        "enterprise" => "ChatGPT Enterprise".to_string(),
        other if !other.is_empty() => {
            let mut c = other.chars();
            let first = c.next().unwrap().to_ascii_uppercase();
            format!("ChatGPT {first}{}", c.as_str())
        }
        _ => "ChatGPT".to_string(),
    }
}

/// Decode a JWT's claim set (the middle segment). Display-only — no signature
/// check; a malformed token yields `None`.
fn decode_jwt_claims(jwt: &str) -> Option<Value> {
    let payload = jwt.split('.').nth(1)?;
    let bytes = b64url_decode(payload)?;
    serde_json::from_slice(&bytes).ok()
}

/// Minimal base64url (no padding) decoder — avoids a crate dependency for the one
/// place cchive reads a JWT payload.
fn b64url_decode(s: &str) -> Option<Vec<u8>> {
    fn val(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some((c - b'A') as u32),
            b'a'..=b'z' => Some((c - b'a' + 26) as u32),
            b'0'..=b'9' => Some((c - b'0' + 52) as u32),
            b'-' => Some(62),
            b'_' => Some(63),
            b'=' => None, // padding: tolerated by stopping early below
            _ => None,
        }
    }
    let mut out = Vec::new();
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;
    for &c in s.as_bytes() {
        if c == b'=' {
            break;
        }
        let v = val(c)?;
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}

/// FNV-1a 64-bit — a small, stable (cross-run, cross-version) hash for ids.
fn fnv1a(s: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// base64url-encode (no padding) — builds id_token payloads for the tests.
    fn b64url_encode(bytes: &[u8]) -> String {
        const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let mut out = String::new();
        for chunk in bytes.chunks(3) {
            let b0 = chunk[0] as u32;
            let b1 = *chunk.get(1).unwrap_or(&0) as u32;
            let b2 = *chunk.get(2).unwrap_or(&0) as u32;
            let n = (b0 << 16) | (b1 << 8) | b2;
            out.push(A[((n >> 18) & 63) as usize] as char);
            out.push(A[((n >> 12) & 63) as usize] as char);
            if chunk.len() > 1 {
                out.push(A[((n >> 6) & 63) as usize] as char);
            }
            if chunk.len() > 2 {
                out.push(A[(n & 63) as usize] as char);
            }
        }
        out
    }

    /// A fake but well-formed chatgpt-mode auth.json with the given claims.
    fn chatgpt_auth(email: &str, plan: &str, account_id: &str) -> String {
        let claims = serde_json::json!({
            "email": email,
            "name": "Lucas Moreau",
            "exp": 1800000000_i64,
            "https://api.openai.com/auth": { "chatgpt_plan_type": plan }
        });
        let id_token = format!(
            "h.{}.s",
            b64url_encode(serde_json::to_string(&claims).unwrap().as_bytes())
        );
        serde_json::json!({
            "auth_mode": "chatgpt",
            "OPENAI_API_KEY": null,
            "tokens": {
                "id_token": id_token,
                "access_token": "SECRET-access",
                "refresh_token": "SECRET-refresh",
                "account_id": account_id
            },
            "last_refresh": "2026-06-30T00:00:00Z"
        })
        .to_string()
    }

    #[test]
    fn identity_chatgpt_mode_reads_email_and_plan() {
        let auth: Value = serde_json::from_str(&chatgpt_auth("lucas@example.dev", "pro", "acc-1")).unwrap();
        let id = identity_from_auth(&auth).unwrap();
        assert_eq!(id.kind, "account");
        assert_eq!(id.email.as_deref(), Some("lucas@example.dev"));
        assert_eq!(id.plan.as_deref(), Some("ChatGPT Pro"));
        assert_eq!(id.expires_at, Some(1800000000_000));
    }

    #[test]
    fn identity_apikey_mode_is_labelled_api_key() {
        let auth: Value = serde_json::from_str(
            r#"{"auth_mode":"apikey","OPENAI_API_KEY":"sk-SECRET","tokens":null}"#,
        )
        .unwrap();
        let id = identity_from_auth(&auth).unwrap();
        assert_eq!(id.kind, "apikey");
        assert_eq!(id.label, "API key");
        assert!(id.email.is_none());
    }

    #[test]
    fn identity_missing_file_is_none() {
        let id = identity_from_file(Path::new("/nonexistent/codex/auth.json"));
        assert_eq!(id.kind, "none");
    }

    #[test]
    fn capture_then_switch_roundtrips_and_upserts() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let payload = chatgpt_auth("capture@example.dev", "plus", "acc-capture");
        std::fs::write(&path, &payload).unwrap();

        let meta = capture_codex_at(&path).unwrap();
        assert_eq!(meta.id, "codex-acc-capture");
        assert_eq!(meta.email.as_deref(), Some("capture@example.dev"));
        assert_eq!(meta.plan.as_deref(), Some("ChatGPT Plus"));
        assert!(keyring_store::codex_vault_has(&meta.id).unwrap());
        // Re-capture upserts (same account_id -> same vault id, no duplicate).
        let meta2 = capture_codex_at(&path).unwrap();
        assert_eq!(meta2.id, meta.id);

        // Switch a *different* live file back to the captured account.
        std::fs::write(&path, "{}").unwrap();
        let id = switch_codex_inner(&meta.id, &path, false).unwrap();
        assert_eq!(id.email.as_deref(), Some("capture@example.dev"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), payload);
    }

    #[test]
    fn switch_unknown_id_errors_without_touching_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        std::fs::write(&path, "ORIGINAL").unwrap();
        let err = switch_codex_inner("codex-nope-xyz", &path, false).unwrap_err();
        assert!(matches!(err, CoreError::AccountNotFound(_)));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "ORIGINAL");
    }

    #[test]
    fn switch_failure_rolls_back_to_original() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let original = chatgpt_auth("orig@example.dev", "pro", "acc-orig");
        std::fs::write(&path, &original).unwrap();

        // Capture so the vault has a target, then force a post-write failure.
        let meta = capture_codex_at(&path).unwrap();
        let err = switch_codex_inner(&meta.id, &path, true).unwrap_err();
        assert!(matches!(err, CoreError::SwitchFailedRolledBack(_)));
        // The live file is restored byte-for-byte.
        assert_eq!(std::fs::read_to_string(&path).unwrap(), original);
    }

    #[test]
    fn remove_drops_vault_entry_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let payload = chatgpt_auth("rm@example.dev", "team", "acc-rm");
        std::fs::write(&path, &payload).unwrap();
        let meta = capture_codex_at(&path).unwrap();

        remove_codex_account(&meta.id).unwrap();
        assert!(!keyring_store::codex_vault_has(&meta.id).unwrap());
        // The live file is left intact.
        assert_eq!(std::fs::read_to_string(&path).unwrap(), payload);
    }

    #[test]
    fn meta_and_identity_carry_no_secret() {
        // The captured auth.json bundles obvious secret markers; neither the
        // CodexAccountMeta (capture return) nor the CodexIdentity may leak them.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        std::fs::write(&path, chatgpt_auth("leak@example.dev", "pro", "acc-leak")).unwrap();

        let meta = capture_codex_at(&path).unwrap();
        let identity = identity_from_file(&path);
        let meta_json = serde_json::to_string(&meta).unwrap();
        let id_json = serde_json::to_string(&identity).unwrap();
        for needle in [
            "SECRET-access",
            "SECRET-refresh",
            "id_token",
            "access_token",
            "refresh_token",
        ] {
            assert!(!meta_json.contains(needle), "CodexAccountMeta leaked {needle}");
            assert!(!id_json.contains(needle), "CodexIdentity leaked {needle}");
        }
    }
}
