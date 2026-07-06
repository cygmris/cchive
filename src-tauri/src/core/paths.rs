//! Cross-platform resolution of every Claude Code path cchive touches, plus
//! detection of the env vars that override or relocate the credential.
//!
//! Pure path logic: nothing here reads or writes a file. The home directory is
//! resolved via `dirs::home_dir()` — we never hardcode `/home` or `C:\Users`.
#![allow(dead_code)] // scaffolding: callers (switch/credentials/commands) land later

use std::path::PathBuf;

use crate::model::EnvOverrides;

/// The Claude config directory: `$CLAUDE_CONFIG_DIR` when set (and non-empty),
/// otherwise `$HOME/.claude`.
pub fn claude_dir() -> PathBuf {
    match std::env::var_os("CLAUDE_CONFIG_DIR") {
        Some(v) if !v.is_empty() => PathBuf::from(v),
        _ => home_dir().join(".claude"),
    }
}

/// The user's home directory. Panics only if the OS cannot supply one at all,
/// which on a real desktop session does not happen.
fn home_dir() -> PathBuf {
    dirs::home_dir().expect("home directory could not be resolved")
}

/// The cchive app config dir (`<config_dir>/app.cchive`) — where the provider/pref
/// index files and the rotating backups store live. This mirrors Tauri's
/// `app_config_dir()` for the `app.cchive` identifier, so the secret-free backup
/// hook (which has no `AppHandle`) and the command layer resolve the SAME directory.
pub fn cchive_config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| home_dir().join(".config"))
        .join("app.cchive")
}

/// `<claude_dir>/.credentials.json` — the live credential on Linux/Windows.
pub fn credentials_path() -> PathBuf {
    claude_dir().join(".credentials.json")
}

/// The Codex config directory: `$CODEX_HOME` when set (and non-empty), otherwise
/// `$HOME/.codex`. A sibling of `.claude/`; cchive only ever touches `auth.json` here.
pub fn codex_dir() -> PathBuf {
    match std::env::var_os("CODEX_HOME") {
        Some(v) if !v.is_empty() => PathBuf::from(v),
        _ => home_dir().join(".codex"),
    }
}

/// `<codex_dir>/auth.json` — Codex's live auth. The whole file IS one "account":
/// `auth_mode` + optional `OPENAI_API_KEY` + a `tokens` block. Switching swaps it.
pub fn codex_auth_path() -> PathBuf {
    codex_dir().join("auth.json")
}

/// `<cchive_config_dir>/usage-parse-cache.json` — the incremental usage parse cache
/// (per-file parsed events keyed by mtime+size). Non-secret: token counts only.
pub fn usage_cache_path() -> PathBuf {
    cchive_config_dir().join("usage-parse-cache.json")
}

/// `<claude_dir>/settings.json`.
pub fn settings_path() -> PathBuf {
    claude_dir().join("settings.json")
}

/// `<claude_dir>/CLAUDE.md` — user memory.
pub fn claude_md() -> PathBuf {
    claude_dir().join("CLAUDE.md")
}

/// `<claude_dir>/agents/` — user subagents.
pub fn agents_dir() -> PathBuf {
    claude_dir().join("agents")
}

/// `<claude_dir>/commands/` — user slash commands.
pub fn commands_dir() -> PathBuf {
    claude_dir().join("commands")
}

/// `<claude_dir>/skills/` — user skills.
pub fn skills_dir() -> PathBuf {
    claude_dir().join("skills")
}

/// `<claude_dir>/projects/` — per-project usage `.jsonl`.
pub fn projects_dir() -> PathBuf {
    claude_dir().join("projects")
}

/// `<claude_dir>/backups/` — Claude Code's own `.claude.json` auto-backups.
pub fn backups_dir() -> PathBuf {
    claude_dir().join("backups")
}

/// `$HOME/.claude.json` — the identity/profile cache.
///
/// IMPORTANT: this is a sibling of `.claude/` at `$HOME`, **never** under
/// `CLAUDE_CONFIG_DIR`. Getting this wrong silently edits the wrong file.
pub fn dot_claude_json() -> PathBuf {
    home_dir().join(".claude.json")
}

/// macOS Keychain descriptor for the live Claude Code credential: a generic
/// password under service `"Claude Code-credentials"`, account = current `$USER`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeychainService {
    pub service: String,
    pub account: String,
}

/// Build the macOS Keychain descriptor (service + `$USER` account). The struct
/// is plain data, so it is available on every platform for testing; only
/// `credentials::KeychainBackend` (macOS-gated) actually talks to the Keychain.
pub fn macos_keychain_service() -> KeychainService {
    KeychainService {
        service: "Claude Code-credentials".to_string(),
        account: std::env::var("USER").unwrap_or_default(),
    }
}

/// Detect auth-relevant env vars that override or relocate what cchive writes:
/// `CLAUDE_CODE_OAUTH_TOKEN` (bypasses the credential file/keychain entirely),
/// `CLAUDE_CONFIG_DIR` (relocation), and the presence of any `ANTHROPIC_*` vars.
/// Values are never captured — only the `ANTHROPIC_*` names.
pub fn detect_env_overrides() -> EnvOverrides {
    let oauth_token_set = std::env::var_os("CLAUDE_CODE_OAUTH_TOKEN")
        .map(|v| !v.is_empty())
        .unwrap_or(false);

    let config_dir_override = std::env::var_os("CLAUDE_CONFIG_DIR")
        .filter(|v| !v.is_empty())
        .map(|v| v.to_string_lossy().into_owned());

    let mut anthropic_vars: Vec<String> = std::env::vars_os()
        .filter_map(|(k, _)| k.into_string().ok())
        .filter(|k| k.starts_with("ANTHROPIC_"))
        .collect();
    anthropic_vars.sort();

    EnvOverrides {
        oauth_token_set,
        anthropic_vars,
        config_dir_override,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // Env is process-global; serialize the env-mutating tests so they don't
    // race each other under cargo's parallel test runner.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn config_dir_override_resolves_every_path() {
        let _g = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().to_path_buf();
        std::env::set_var("CLAUDE_CONFIG_DIR", &dir);

        assert_eq!(claude_dir(), dir);
        assert_eq!(credentials_path(), dir.join(".credentials.json"));
        assert_eq!(settings_path(), dir.join("settings.json"));
        assert_eq!(claude_md(), dir.join("CLAUDE.md"));
        assert_eq!(agents_dir(), dir.join("agents"));
        assert_eq!(commands_dir(), dir.join("commands"));
        assert_eq!(skills_dir(), dir.join("skills"));
        assert_eq!(projects_dir(), dir.join("projects"));
        assert_eq!(backups_dir(), dir.join("backups"));

        std::env::remove_var("CLAUDE_CONFIG_DIR");
    }

    #[test]
    fn dot_claude_json_is_at_home_not_config_dir() {
        let _g = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("CLAUDE_CONFIG_DIR", tmp.path());

        let dot = dot_claude_json();
        let home = dirs::home_dir().unwrap();
        assert_eq!(dot, home.join(".claude.json"));
        assert!(
            !dot.starts_with(tmp.path()),
            "dot_claude_json must NOT be under CLAUDE_CONFIG_DIR"
        );

        std::env::remove_var("CLAUDE_CONFIG_DIR");
    }

    #[test]
    fn default_dir_is_home_dot_claude() {
        let _g = ENV_LOCK.lock().unwrap();
        std::env::remove_var("CLAUDE_CONFIG_DIR");

        let home = dirs::home_dir().unwrap();
        assert_eq!(claude_dir(), home.join(".claude"));
        assert_eq!(credentials_path(), home.join(".claude").join(".credentials.json"));
    }

    #[test]
    fn codex_home_override_resolves_auth_path() {
        let _g = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().to_path_buf();
        std::env::set_var("CODEX_HOME", &dir);

        assert_eq!(codex_dir(), dir);
        assert_eq!(codex_auth_path(), dir.join("auth.json"));

        std::env::remove_var("CODEX_HOME");
        // Default falls back to $HOME/.codex (never under CLAUDE_CONFIG_DIR).
        let home = dirs::home_dir().unwrap();
        assert_eq!(codex_dir(), home.join(".codex"));
    }

    #[test]
    fn keychain_descriptor_uses_claude_service_name() {
        let svc = macos_keychain_service();
        assert_eq!(svc.service, "Claude Code-credentials");
    }

    #[test]
    fn detect_env_overrides_flags_oauth_token_and_anthropic() {
        let _g = ENV_LOCK.lock().unwrap();
        std::env::set_var("CLAUDE_CODE_OAUTH_TOKEN", "sk-test");
        std::env::set_var("ANTHROPIC_BASE_URL", "https://example.test");

        let ov = detect_env_overrides();
        assert!(ov.oauth_token_set, "OAuth token override must be flagged");
        assert!(
            ov.anthropic_vars.iter().any(|k| k == "ANTHROPIC_BASE_URL"),
            "ANTHROPIC_* names must be listed: {:?}",
            ov.anthropic_vars
        );

        std::env::remove_var("CLAUDE_CODE_OAUTH_TOKEN");
        std::env::remove_var("ANTHROPIC_BASE_URL");
    }

    #[test]
    fn detect_env_overrides_clear_when_unset() {
        let _g = ENV_LOCK.lock().unwrap();
        std::env::remove_var("CLAUDE_CODE_OAUTH_TOKEN");

        let ov = detect_env_overrides();
        assert!(!ov.oauth_token_set);
    }
}
