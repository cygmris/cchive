//! Editor for `~/.claude/settings.json` — the provider-switch surface.
//!
//! `merge_env` shallow-merges keys into the `env` block (add a provider override
//! without disturbing other settings), and `clear_env`
//! removes only `env` ("reset to subscription"). `read_summary` returns a
//! non-secret view (model id, whether an env block exists, top-level key names).
//! Every write goes through `atomic_fs::write_json_preserving` after a backup, so
//! unknown/future top-level keys are never dropped (G11).
#![allow(dead_code)] // callers (switch/commands) land in later tasks

use std::collections::BTreeMap;
use std::path::Path;

use serde_json::{Map, Value};

use super::{atomic_fs, paths};
use crate::model::{CoreError, SettingsSummary};

/// Shallow-merge `vars` into `settings.json` `env`, preserving every other
/// settings key and any existing env vars not in `vars`. Backs up first.
pub fn merge_env(vars: BTreeMap<String, String>) -> Result<(), CoreError> {
    merge_env_at(&paths::settings_path(), vars)
}

/// Remove ONLY the `env` block from `settings.json`, preserving everything else.
/// Backs up first. No-op when the file does not exist.
pub fn clear_env() -> Result<(), CoreError> {
    clear_env_at(&paths::settings_path())
}

/// Non-secret summary of `settings.json` for the settings screen.
pub fn read_summary() -> Result<SettingsSummary, CoreError> {
    read_summary_at(&paths::settings_path())
}

/// Path-parameterized merge (for tests, the switch flow's provider apply, and an
/// explicit config dir).
pub(crate) fn merge_env_at(path: &Path, vars: BTreeMap<String, String>) -> Result<(), CoreError> {
    atomic_fs::backup(path)?;
    atomic_fs::write_json_preserving(path, None, move |value| {
        let obj = match value.as_object_mut() {
            Some(o) => o,
            None => return,
        };
        // Ensure `env` is an object before merging into it.
        if !matches!(obj.get("env"), Some(Value::Object(_))) {
            obj.insert("env".to_string(), Value::Object(Map::new()));
        }
        if let Some(Value::Object(env)) = obj.get_mut("env") {
            for (k, v) in vars {
                env.insert(k, Value::String(v));
            }
        }
    })
}

/// Path-parameterized clear (for tests, the switch flow's provider reset, and an
/// explicit config dir).
pub(crate) fn clear_env_at(path: &Path) -> Result<(), CoreError> {
    if !path.exists() {
        return Ok(());
    }
    atomic_fs::backup(path)?;
    atomic_fs::write_json_preserving(path, None, |value| {
        if let Some(obj) = value.as_object_mut() {
            obj.remove("env");
        }
    })
}

/// Path-parameterized summary (for tests + an explicit config dir).
fn read_summary_at(path: &Path) -> Result<SettingsSummary, CoreError> {
    if !path.exists() {
        return Ok(SettingsSummary {
            model: None,
            has_env: false,
            top_level_keys: Vec::new(),
        });
    }
    let value = atomic_fs::read_json_value(path)?;
    let obj = value.as_object();

    let model = obj
        .and_then(|o| o.get("model"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let has_env = obj
        .and_then(|o| o.get("env"))
        .and_then(Value::as_object)
        .map(|env| !env.is_empty())
        .unwrap_or(false);
    let top_level_keys = obj
        .map(|o| o.keys().cloned().collect())
        .unwrap_or_default();

    Ok(SettingsSummary {
        model,
        has_env,
        top_level_keys,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn seed(path: &Path, value: Value) {
        atomic_fs::atomic_write(path, value.to_string().as_bytes(), None).unwrap();
    }

    fn map(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn merge_env_adds_env_but_keeps_other_keys() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        seed(
            &path,
            json!({
                "model": "claude-opus",
                "hooks": { "Stop": [] },
                "theme": "dark"
            }),
        );

        merge_env_at(
            &path,
            map(&[("ANTHROPIC_BASE_URL", "https://provider.test/anthropic")]),
        )
        .unwrap();

        let after = atomic_fs::read_json_value(&path).unwrap();
        let obj = after.as_object().unwrap();
        // env added.
        assert_eq!(
            obj.get("env"),
            Some(&json!({ "ANTHROPIC_BASE_URL": "https://provider.test/anthropic" }))
        );
        // Other top-level keys preserved.
        assert_eq!(obj.get("model"), Some(&json!("claude-opus")));
        assert_eq!(obj.get("hooks"), Some(&json!({ "Stop": [] })));
        assert_eq!(obj.get("theme"), Some(&json!("dark")));
    }

    #[test]
    fn merge_env_shallow_merges_existing_env() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        seed(
            &path,
            json!({
                "model": "m",
                "env": { "KEEP_ME": "1", "ANTHROPIC_MODEL": "old" }
            }),
        );

        merge_env_at(
            &path,
            map(&[
                ("ANTHROPIC_MODEL", "new"),
                ("ANTHROPIC_BASE_URL", "https://x.test"),
            ]),
        )
        .unwrap();

        let after = atomic_fs::read_json_value(&path).unwrap();
        let env = after.get("env").unwrap();
        // Pre-existing unrelated env var kept.
        assert_eq!(env.get("KEEP_ME"), Some(&json!("1")));
        // Overlapping key overwritten, new key added.
        assert_eq!(env.get("ANTHROPIC_MODEL"), Some(&json!("new")));
        assert_eq!(env.get("ANTHROPIC_BASE_URL"), Some(&json!("https://x.test")));
        // Other settings untouched.
        assert_eq!(after.get("model"), Some(&json!("m")));
    }

    #[test]
    fn clear_env_removes_only_env() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        seed(
            &path,
            json!({
                "model": "claude-opus",
                "env": { "ANTHROPIC_BASE_URL": "https://x.test" },
                "theme": "dark"
            }),
        );

        clear_env_at(&path).unwrap();

        let after = atomic_fs::read_json_value(&path).unwrap();
        let obj = after.as_object().unwrap();
        assert!(!obj.contains_key("env"), "env must be removed");
        // Everything else preserved.
        assert_eq!(obj.get("model"), Some(&json!("claude-opus")));
        assert_eq!(obj.get("theme"), Some(&json!("dark")));
    }

    #[test]
    fn read_summary_reports_model_env_and_keys() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        seed(
            &path,
            json!({
                "model": "claude-opus",
                "env": { "ANTHROPIC_BASE_URL": "https://x.test" },
                "theme": "dark"
            }),
        );

        let summary = read_summary_at(&path).unwrap();
        assert_eq!(summary.model.as_deref(), Some("claude-opus"));
        assert!(summary.has_env);
        assert_eq!(summary.top_level_keys, vec!["model", "env", "theme"]);
    }

    #[test]
    fn read_summary_missing_file_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("absent.json");
        let summary = read_summary_at(&path).unwrap();
        assert_eq!(summary.model, None);
        assert!(!summary.has_env);
        assert!(summary.top_level_keys.is_empty());
    }
}
