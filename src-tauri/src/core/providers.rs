//! The Clavis provider index — persist + read saved API-provider configs.
//!
//! Each provider is stored as non-secret metadata + a full settings payload in a
//! Clavis-managed `providers.json` (written through `atomic_fs`, NOT the JS store
//! plugin, which the Rust side cannot easily reach). The auth token lives apart in
//! the OS keyring vault (`app.clavis.providers/<id>`) and is composed back into the
//! `env` block only at apply time — so no token ever rides on the index or any view.
//!
//! `apply` builds the `ANTHROPIC_*` env block (incl. the vaulted token) plus the
//! top-level config keys and merges them into `settings.json` via
//! `settings::merge_env_at` + `atomic_fs::write_json_preserving`, preserving every
//! other settings key (G11).
#![allow(dead_code)] // commands wire these entry points up alongside this task

use std::collections::BTreeMap;
use std::path::Path;

use serde_json::Value;

use super::{atomic_fs, keyring_store, settings};
use crate::model::{
    CoreError, ProviderConfig, ProviderConfigInput, ProviderConfigView, ProviderMeta,
    ProviderSettings,
};

/// Unix permission bits for the provider index (non-secret, but kept tight).
const INDEX_MODE: u32 = 0o600;

// ---------------------------------------------------------------------------
// Public API (path-injectable so commands pass real paths, tests pass temps)
// ---------------------------------------------------------------------------

/// List provider presets as non-secret metadata (label + base URL + model).
pub fn list(index: &Path) -> Result<Vec<ProviderMeta>, CoreError> {
    Ok(load(index)?.into_iter().map(meta_of).collect())
}

/// Read one provider as a view: the full payload + `hasToken`, never the token.
pub fn get(index: &Path, id: &str) -> Result<ProviderConfigView, CoreError> {
    let config = find(index, id)?;
    let has_token = keyring_store::provider_vault_has(id)?;
    Ok(ProviderConfigView { config, has_token })
}

/// Create or replace a provider in the index. When `new_token` is `Some`, the
/// token is (re)written to the vault; when `None`, any existing vaulted token is
/// left untouched (so an edit that doesn't retype the secret preserves it).
/// Returns the resulting non-secret view.
pub fn upsert(
    index: &Path,
    input: ProviderConfigInput,
    new_token: Option<String>,
) -> Result<ProviderConfigView, CoreError> {
    let id = match input.id {
        Some(ref s) if !s.is_empty() => s.clone(),
        _ => format!("prov-{}", atomic_fs::now_millis()),
    };
    let config = ProviderConfig {
        id: id.clone(),
        title: input.title,
        brand: input.brand,
        env: input.env,
        config: input.config,
    };

    let mut list = load(index)?;
    list.retain(|c| c.id != id);
    list.push(config.clone());
    store(index, &list)?;

    if let Some(token) = new_token {
        keyring_store::provider_vault_put(&id, &token)?;
    }
    let has_token = keyring_store::provider_vault_has(&id)?;
    Ok(ProviderConfigView { config, has_token })
}

/// Remove a provider from the index AND delete its vaulted token (idempotent).
pub fn delete(index: &Path, id: &str) -> Result<(), CoreError> {
    let mut list = load(index)?;
    let before = list.len();
    list.retain(|c| c.id != id);
    if list.len() != before {
        store(index, &list)?;
    }
    keyring_store::provider_vault_delete(id)
}

/// Apply a provider to `settings.json`: compose its `env` block (incl. the vaulted
/// token) + top-level config keys and merge them in, preserving every other key.
pub fn apply(index: &Path, settings_path: &Path, id: &str) -> Result<(), CoreError> {
    // Auto-snapshot the Claude files into the rotating backups store BEFORE any
    // mutation, so every apply is recoverable (best-effort; never blocks).
    // Skipped under unit tests, which drive temp settings paths.
    #[cfg(not(test))]
    super::backups::auto_snapshot();

    let config = find(index, id)?;

    // 1. Compose + merge the env block (incl. the vaulted token). `merge_env_at`
    //    backs up first and preserves every unrelated settings/env key (G11).
    let env = compose_env(&config, id)?;
    settings::merge_env_at(settings_path, env)?;

    // 2. Merge the top-level config keys, preserving all other settings keys.
    let config_keys = compose_config(&config.config);
    if !config_keys.is_empty() {
        atomic_fs::write_json_preserving(settings_path, None, move |value| {
            if let Some(obj) = value.as_object_mut() {
                for (k, v) in config_keys {
                    obj.insert(k, v);
                }
            }
        })?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Index file I/O
// ---------------------------------------------------------------------------

/// Load the full provider list from the index file (empty when absent).
fn load(index: &Path) -> Result<Vec<ProviderConfig>, CoreError> {
    if !index.exists() {
        return Ok(Vec::new());
    }
    let value = atomic_fs::read_json_value(index)?;
    serde_json::from_value(value).map_err(CoreError::from)
}

/// Atomically persist the full provider list to the index file.
fn store(index: &Path, list: &[ProviderConfig]) -> Result<(), CoreError> {
    let bytes = serde_json::to_vec_pretty(list).map_err(CoreError::from)?;
    atomic_fs::atomic_write(index, &bytes, Some(INDEX_MODE))
}

/// Look up one provider by id or `NotFound`.
fn find(index: &Path, id: &str) -> Result<ProviderConfig, CoreError> {
    load(index)?
        .into_iter()
        .find(|c| c.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("provider {id}")))
}

// ---------------------------------------------------------------------------
// Composition (payload -> settings.json shape)
// ---------------------------------------------------------------------------

fn meta_of(c: ProviderConfig) -> ProviderMeta {
    ProviderMeta {
        id: c.id,
        label: c.title,
        base_url: Some(c.env.base_url),
        model: Some(c.env.model),
    }
}

/// Build the `env` block (all values are strings) incl. the vaulted token.
fn compose_env(c: &ProviderConfig, id: &str) -> Result<BTreeMap<String, String>, CoreError> {
    let e = &c.env;
    let mut env = BTreeMap::new();
    env.insert("ANTHROPIC_BASE_URL".to_string(), e.base_url.clone());
    env.insert("ANTHROPIC_MODEL".to_string(), e.model.clone());
    env.insert(
        "ANTHROPIC_DEFAULT_SONNET_MODEL".to_string(),
        e.default_sonnet.clone(),
    );
    env.insert(
        "ANTHROPIC_DEFAULT_HAIKU_MODEL".to_string(),
        e.default_haiku.clone(),
    );
    if let Some(n) = e.max_thinking_tokens {
        env.insert("MAX_THINKING_TOKENS".to_string(), n.to_string());
    }
    if let Some(n) = e.max_output_tokens {
        env.insert("CLAUDE_CODE_MAX_OUTPUT_TOKENS".to_string(), n.to_string());
    }
    if let Some(ref p) = e.https_proxy {
        env.insert("HTTPS_PROXY".to_string(), p.clone());
    }
    if let Some(b) = e.disable_telemetry {
        env.insert("DISABLE_TELEMETRY".to_string(), b.to_string());
    }

    // The auth token lives only in the vault; fold it in when present. A missing
    // token is not an error (an unconfigured provider applies without one).
    match keyring_store::provider_vault_get(id) {
        Ok(token) => {
            env.insert("ANTHROPIC_AUTH_TOKEN".to_string(), token);
        }
        Err(CoreError::NotFound(_)) => {}
        Err(other) => return Err(other),
    }
    Ok(env)
}

/// Map the non-`env` settings to their top-level `settings.json` keys + JSON types.
fn compose_config(s: &ProviderSettings) -> Vec<(String, Value)> {
    let mut out: Vec<(String, Value)> = Vec::new();
    if let Some(n) = s.cleanup_period_days {
        out.push(("cleanupPeriodDays".to_string(), Value::from(n)));
    }
    if let Some(b) = s.include_co_authored_by {
        out.push(("includeCoAuthoredBy".to_string(), Value::from(b)));
    }
    if let Some(ref v) = s.output_style {
        out.push(("outputStyle".to_string(), Value::from(v.clone())));
    }
    if let Some(ref v) = s.force_login_method {
        out.push(("forceLoginMethod".to_string(), Value::from(v.clone())));
    }
    if let Some(ref v) = s.force_login_org_uuid {
        out.push(("forceLoginOrgUUID".to_string(), Value::from(v.clone())));
    }
    if let Some(b) = s.enable_all_project_mcp_servers {
        out.push(("enableAllProjectMcpServers".to_string(), Value::from(b)));
    }
    if let Some(ref v) = s.enabled_mcp_servers {
        let arr: Vec<Value> = v
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| Value::from(s.to_string()))
            .collect();
        out.push(("enabledMcpjsonServers".to_string(), Value::Array(arr)));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ProviderEnv, ProviderSettings};
    use serde_json::json;

    fn sample_input(id: &str) -> ProviderConfigInput {
        ProviderConfigInput {
            id: Some(id.to_string()),
            title: "GLM-4.6 · Z.ai".to_string(),
            brand: "zai".to_string(),
            env: ProviderEnv {
                base_url: "https://api.z.ai/api/anthropic".to_string(),
                model: "glm-4.6".to_string(),
                default_sonnet: "glm-4.6".to_string(),
                default_haiku: "glm-4.5-air".to_string(),
                max_thinking_tokens: Some(8192),
                max_output_tokens: Some(4096),
                https_proxy: Some("http://proxy.test:8080".to_string()),
                disable_telemetry: Some(true),
            },
            config: ProviderSettings {
                cleanup_period_days: Some(30),
                include_co_authored_by: Some(true),
                output_style: Some("Concise".to_string()),
                force_login_method: Some("console".to_string()),
                force_login_org_uuid: Some("11111111-2222-3333-4444-555555555555".to_string()),
                enable_all_project_mcp_servers: Some(false),
                enabled_mcp_servers: Some("memory, github".to_string()),
            },
        }
    }

    #[test]
    fn upsert_then_list_and_get_with_token_and_no_token_in_view() {
        let dir = tempfile::tempdir().unwrap();
        let index = dir.path().join("providers.json");

        let view = upsert(&index, sample_input("zai-1"), Some("sk-secret-zzz".to_string())).unwrap();
        assert!(view.has_token, "hasToken must reflect the vaulted token");

        // list surfaces non-secret metadata.
        let metas = list(&index).unwrap();
        assert_eq!(metas.len(), 1);
        assert_eq!(metas[0].id, "zai-1");
        assert_eq!(metas[0].label, "GLM-4.6 · Z.ai");
        assert_eq!(metas[0].base_url.as_deref(), Some("https://api.z.ai/api/anthropic"));
        assert_eq!(metas[0].model.as_deref(), Some("glm-4.6"));

        // get returns the full payload + hasToken.
        let got = get(&index, "zai-1").unwrap();
        assert!(got.has_token);
        assert_eq!(got.config.env.model, "glm-4.6");
        assert_eq!(got.config.config.output_style.as_deref(), Some("Concise"));

        // The serialized view NEVER carries the token value.
        let view_json = serde_json::to_string(&got).unwrap();
        assert!(
            !view_json.contains("sk-secret-zzz"),
            "token leaked into the view JSON: {view_json}"
        );
        assert!(!view_json.contains("AUTH_TOKEN"));
        // It DOES carry the hasToken flag + the non-secret payload.
        assert!(view_json.contains("\"hasToken\":true"));
        assert!(view_json.contains("glm-4.6"));
    }

    #[test]
    fn get_without_token_reports_has_token_false() {
        let dir = tempfile::tempdir().unwrap();
        let index = dir.path().join("providers.json");

        upsert(&index, sample_input("notok-1"), None).unwrap();
        let got = get(&index, "notok-1").unwrap();
        assert!(!got.has_token, "no token written -> hasToken must be false");
    }

    #[test]
    fn upsert_without_new_token_preserves_existing_vault_token() {
        let dir = tempfile::tempdir().unwrap();
        let index = dir.path().join("providers.json");

        upsert(&index, sample_input("keep-1"), Some("sk-keep".to_string())).unwrap();
        // Edit again WITHOUT a new token: the vault entry must survive.
        let mut edited = sample_input("keep-1");
        edited.title = "Renamed".to_string();
        let view = upsert(&index, edited, None).unwrap();
        assert!(view.has_token, "editing without a new token must keep the secret");
        assert_eq!(list(&index).unwrap()[0].label, "Renamed");
    }

    #[test]
    fn delete_removes_index_entry_and_token() {
        let dir = tempfile::tempdir().unwrap();
        let index = dir.path().join("providers.json");

        upsert(&index, sample_input("del-1"), Some("sk-del".to_string())).unwrap();
        assert!(keyring_store::provider_vault_has("del-1").unwrap());

        delete(&index, "del-1").unwrap();

        assert!(list(&index).unwrap().is_empty(), "index entry removed");
        assert!(
            !keyring_store::provider_vault_has("del-1").unwrap(),
            "vaulted token removed"
        );
        match get(&index, "del-1") {
            Err(CoreError::NotFound(_)) => {}
            other => panic!("expected NotFound after delete, got {other:?}"),
        }
    }

    #[test]
    fn upsert_without_id_mints_one_and_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let index = dir.path().join("providers.json");

        let mut input = sample_input("ignored");
        input.id = None;
        let view = upsert(&index, input, None).unwrap();
        assert!(view.config.id.starts_with("prov-"), "a fresh id is minted");
        assert_eq!(list(&index).unwrap().len(), 1);
    }

    #[test]
    fn apply_merges_full_payload_into_settings_preserving_other_keys() {
        let dir = tempfile::tempdir().unwrap();
        let index = dir.path().join("providers.json");
        let settings_path = dir.path().join("settings.json");

        // Pre-existing settings.json with unrelated keys that must survive.
        atomic_fs::atomic_write(
            &settings_path,
            json!({
                "model": "claude-opus",
                "theme": "dark",
                "hooks": { "Stop": [] },
                "env": { "KEEP_ME": "1" }
            })
            .to_string()
            .as_bytes(),
            None,
        )
        .unwrap();

        upsert(&index, sample_input("apply-1"), Some("sk-apply".to_string())).unwrap();
        apply(&index, &settings_path, "apply-1").unwrap();

        let after = atomic_fs::read_json_value(&settings_path).unwrap();

        // env block: composed ANTHROPIC_* + the vaulted token, merged over KEEP_ME.
        let env = after.get("env").unwrap();
        assert_eq!(env["ANTHROPIC_BASE_URL"], json!("https://api.z.ai/api/anthropic"));
        assert_eq!(env["ANTHROPIC_MODEL"], json!("glm-4.6"));
        assert_eq!(env["ANTHROPIC_DEFAULT_SONNET_MODEL"], json!("glm-4.6"));
        assert_eq!(env["ANTHROPIC_DEFAULT_HAIKU_MODEL"], json!("glm-4.5-air"));
        assert_eq!(env["MAX_THINKING_TOKENS"], json!("8192"));
        assert_eq!(env["CLAUDE_CODE_MAX_OUTPUT_TOKENS"], json!("4096"));
        assert_eq!(env["HTTPS_PROXY"], json!("http://proxy.test:8080"));
        assert_eq!(env["DISABLE_TELEMETRY"], json!("true"));
        assert_eq!(env["ANTHROPIC_AUTH_TOKEN"], json!("sk-apply"));
        // Pre-existing unrelated env var preserved.
        assert_eq!(env["KEEP_ME"], json!("1"));

        // top-level config keys merged with proper JSON types.
        assert_eq!(after["cleanupPeriodDays"], json!(30));
        assert_eq!(after["includeCoAuthoredBy"], json!(true));
        assert_eq!(after["outputStyle"], json!("Concise"));
        assert_eq!(after["forceLoginMethod"], json!("console"));
        assert_eq!(
            after["forceLoginOrgUUID"],
            json!("11111111-2222-3333-4444-555555555555")
        );
        assert_eq!(after["enableAllProjectMcpServers"], json!(false));
        assert_eq!(after["enabledMcpjsonServers"], json!(["memory", "github"]));

        // Every other top-level key preserved.
        assert_eq!(after["model"], json!("claude-opus"));
        assert_eq!(after["theme"], json!("dark"));
        assert_eq!(after["hooks"], json!({ "Stop": [] }));
    }

    #[test]
    fn apply_without_token_omits_auth_token() {
        let dir = tempfile::tempdir().unwrap();
        let index = dir.path().join("providers.json");
        let settings_path = dir.path().join("settings.json");

        upsert(&index, sample_input("apply-notok"), None).unwrap();
        apply(&index, &settings_path, "apply-notok").unwrap();

        let after = atomic_fs::read_json_value(&settings_path).unwrap();
        assert!(
            after["env"].get("ANTHROPIC_AUTH_TOKEN").is_none(),
            "no vaulted token -> no ANTHROPIC_AUTH_TOKEN written"
        );
        // Other env vars still composed.
        assert_eq!(after["env"]["ANTHROPIC_MODEL"], json!("glm-4.6"));
    }

    #[test]
    fn apply_unknown_provider_is_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let index = dir.path().join("providers.json");
        let settings_path = dir.path().join("settings.json");
        match apply(&index, &settings_path, "nope") {
            Err(CoreError::NotFound(_)) => {}
            other => panic!("expected NotFound, got {other:?}"),
        }
    }

    #[test]
    fn list_missing_index_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let index = dir.path().join("absent.json");
        assert!(list(&index).unwrap().is_empty());
    }
}
