//! Editor for `~/.claude.json` — the identity/profile cache (a sibling of the
//! `.claude/` dir at `$HOME`, NOT inside it; see `paths::dot_claude_json`).
//!
//! Reads the non-secret identity (`oauthAccount` + `userID`) and writes a target
//! account's identity back so the Claude Code HUD/statusline shows the right
//! email/plan after a switch (G6). All writes go through
//! `atomic_fs::write_json_preserving`, so `mcpServers`, `projects`, and the ~50
//! other UI/telemetry keys are preserved in place. `oauthAccount` is profile
//! metadata only — it carries NO access/refresh token.
#![allow(dead_code)] // callers (switch/commands) land in later tasks

use std::path::Path;

use serde_json::Value;

use super::{atomic_fs, paths};
use crate::model::CoreError;

/// The non-secret identity stored in `~/.claude.json`.
#[derive(Debug, Clone, Default)]
pub struct OauthIdentity {
    /// The full `oauthAccount` object (email, displayName, org info — no tokens).
    /// `None` when the file or the key is absent.
    pub oauth_account: Option<Value>,
    /// The `userID` string, if present.
    pub user_id: Option<String>,
}

/// Read `oauthAccount` + `userID` from `~/.claude.json`.
pub fn read_oauth_account() -> Result<OauthIdentity, CoreError> {
    read_oauth_account_at(&paths::dot_claude_json())
}

/// Write the target account's `oauthAccount` + `userID` back into
/// `~/.claude.json`, preserving every other key (`mcpServers`, `projects`, …).
/// Backs up first.
pub fn write_identity(oauth_account: &Value, user_id: &str) -> Result<(), CoreError> {
    write_identity_at(&paths::dot_claude_json(), oauth_account, user_id)
}

/// Path-parameterized read (for tests, the switch flow's capture, and an explicit
/// config dir).
pub(crate) fn read_oauth_account_at(path: &Path) -> Result<OauthIdentity, CoreError> {
    if !path.exists() {
        return Ok(OauthIdentity::default());
    }
    let value = atomic_fs::read_json_value(path)?;
    let oauth_account = value
        .get("oauthAccount")
        .filter(|v| !v.is_null())
        .cloned();
    let user_id = value
        .get("userID")
        .and_then(Value::as_str)
        .map(str::to_string);
    Ok(OauthIdentity {
        oauth_account,
        user_id,
    })
}

/// Path-parameterized write (for tests, the switch flow's identity write, and an
/// explicit config dir).
pub(crate) fn write_identity_at(
    path: &Path,
    oauth_account: &Value,
    user_id: &str,
) -> Result<(), CoreError> {
    // Backup-first; the handle is the switch flow's concern (rollback lives there).
    atomic_fs::backup(path)?;

    let oauth_account = oauth_account.clone();
    let user_id = user_id.to_string();
    atomic_fs::write_json_preserving(path, None, move |value| {
        if let Some(obj) = value.as_object_mut() {
            obj.insert("oauthAccount".to_string(), oauth_account);
            obj.insert("userID".to_string(), Value::String(user_id));
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn write_identity_preserves_unknown_keys_and_order() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".claude.json");

        // Realistic shape: identity keys interleaved with state we must not drop.
        let seed = json!({
            "userID": "old-user",
            "mcpServers": { "context7": { "type": "stdio" } },
            "oauthAccount": { "emailAddress": "old@example.test" },
            "projects": { "/home/x": { "history": [] } },
            "tipsHistory": { "tip-1": 3 }
        });
        atomic_fs::atomic_write(&path, seed.to_string().as_bytes(), None).unwrap();

        let new_account = json!({
            "emailAddress": "new@example.test",
            "displayName": "New User"
        });
        write_identity_at(&path, &new_account, "new-user").unwrap();

        let after = atomic_fs::read_json_value(&path).unwrap();
        let obj = after.as_object().unwrap();

        // Identity updated.
        assert_eq!(obj.get("oauthAccount"), Some(&new_account));
        assert_eq!(obj.get("userID"), Some(&json!("new-user")));
        // Unknown / unrelated keys preserved untouched.
        assert_eq!(
            obj.get("mcpServers"),
            Some(&json!({ "context7": { "type": "stdio" } }))
        );
        assert_eq!(
            obj.get("projects"),
            Some(&json!({ "/home/x": { "history": [] } }))
        );
        assert_eq!(obj.get("tipsHistory"), Some(&json!({ "tip-1": 3 })));
        // Original key order preserved (serde_json preserve_order).
        let keys: Vec<&String> = obj.keys().collect();
        assert_eq!(
            keys,
            vec!["userID", "mcpServers", "oauthAccount", "projects", "tipsHistory"]
        );
    }

    #[test]
    fn read_oauth_account_returns_identity() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".claude.json");
        let seed = json!({
            "oauthAccount": { "emailAddress": "me@example.test" },
            "userID": "uid-1",
            "other": 1
        });
        atomic_fs::atomic_write(&path, seed.to_string().as_bytes(), None).unwrap();

        let id = read_oauth_account_at(&path).unwrap();
        assert_eq!(
            id.oauth_account,
            Some(json!({ "emailAddress": "me@example.test" }))
        );
        assert_eq!(id.user_id.as_deref(), Some("uid-1"));
    }

    #[test]
    fn read_oauth_account_missing_file_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("absent.json");
        let id = read_oauth_account_at(&path).unwrap();
        assert!(id.oauth_account.is_none());
        assert!(id.user_id.is_none());
    }
}
