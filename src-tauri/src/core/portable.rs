//! Portable, SECRET-FREE export/import of the Clavis setup.
//!
//! `build_export` assembles an `ExportDoc` from the Clavis-managed files under the
//! app config dir: the provider index (label + base URL + model — NEVER the vaulted
//! key), the non-secret app preferences (theme / language / experimental only), and
//! the saved-account labels (no token). `apply_import` validates the header
//! (`app == "clavis"`) then merges providers back KEYLESS (a created/updated provider
//! never gets a token written) and applies the allow-listed preference keys; any
//! foreign header is rejected before a single byte is written.
//!
//! SAFETY CONTRACT: no secret crosses this module. Export reads only non-secret
//! index/pref files and never touches the keyring; import writes providers with
//! `new_token = None` and only ever applies the known, non-secret pref keys.
#![allow(dead_code)] // commands wire these entry points up alongside this task

use std::path::Path;

use serde_json::{Map, Value};

use super::{atomic_fs, providers};
use crate::model::{
    AccountMeta, CoreError, ExportAccount, ExportDoc, ExportProvider, ImportSummary,
    ProviderConfigInput, ProviderEnv, ProviderSettings,
};

/// Identity tag every Clavis export carries; an import rejects anything else.
const APP_ID: &str = "clavis";
/// Current export schema version.
const SCHEMA: u32 = 1;

/// The Clavis-managed provider index, under the app config dir.
const PROVIDERS_INDEX: &str = "providers.json";
/// The `tauri-plugin-store` file holding the non-secret app preferences.
const STORE_FILE: &str = "clavis.store.json";
/// The store file holding the non-secret account index.
const ACCOUNTS_FILE: &str = "clavis-accounts.json";
/// Store key inside `ACCOUNTS_FILE` holding the account array.
const ACCOUNTS_KEY: &str = "accounts";

/// The ONLY preference keys that are exported / applied. Everything else in the
/// store (and any unknown/foreign key in an import) is ignored — this is what
/// keeps prefs non-secret on the way out and on the way in.
const PREF_KEYS: &[&str] = &["theme", "language", "experimental"];

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/// Build a secret-free `ExportDoc` from the Clavis files under `config_dir`.
pub fn build_export(config_dir: &Path) -> Result<ExportDoc, CoreError> {
    // Providers as non-secret metadata (label + base URL + model). `list` reads
    // only the index and never probes the vault, so no token is in reach.
    let providers = providers::list(&config_dir.join(PROVIDERS_INDEX))?
        .into_iter()
        .map(|m| ExportProvider {
            label: m.label,
            base_url: m.base_url,
            model: m.model,
        })
        .collect();

    let prefs = read_prefs(&config_dir.join(STORE_FILE));
    let accounts = read_account_labels(&config_dir.join(ACCOUNTS_FILE));

    Ok(ExportDoc {
        app: APP_ID.to_string(),
        schema: SCHEMA,
        exported_at: atomic_fs::now_millis() as i64,
        providers,
        prefs,
        accounts,
    })
}

/// Read only the allow-listed (non-secret) preference keys from the store file.
/// A missing or corrupt store yields an empty prefs object rather than erroring.
fn read_prefs(store_path: &Path) -> Value {
    let mut out = Map::new();
    if store_path.exists() {
        if let Ok(Value::Object(obj)) = atomic_fs::read_json_value(store_path) {
            for key in PREF_KEYS {
                if let Some(v) = obj.get(*key) {
                    out.insert((*key).to_string(), v.clone());
                }
            }
        }
    }
    Value::Object(out)
}

/// Read the saved-account labels (token-free). A missing/corrupt index yields an
/// empty list — an export never fails because the account store is absent.
fn read_account_labels(accounts_path: &Path) -> Vec<ExportAccount> {
    if !accounts_path.exists() {
        return Vec::new();
    }
    let value = match atomic_fs::read_json_value(accounts_path) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let arr = value
        .get(ACCOUNTS_KEY)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    arr.into_iter()
        .filter_map(|item| serde_json::from_value::<AccountMeta>(item).ok())
        .map(|m| ExportAccount {
            label: m.label,
            email: m.email,
            tier: m.tier,
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/// Validate the header then merge a portable export into `config_dir`: create or
/// update providers KEYLESS (matched by label), apply the allow-listed prefs, and
/// report the counts. A foreign/invalid header is rejected before any write.
pub fn apply_import(config_dir: &Path, doc: &ExportDoc) -> Result<ImportSummary, CoreError> {
    // Reject a foreign export up front — no partial state.
    if doc.app != APP_ID {
        return Err(CoreError::InvalidInput(format!(
            "not a Clavis export (app = {:?})",
            doc.app
        )));
    }

    let mut summary = ImportSummary::default();

    // Merge providers KEYLESS. Match by label against the pre-import index so a
    // re-import updates in place instead of duplicating.
    let index = config_dir.join(PROVIDERS_INDEX);
    let existing = providers::list(&index)?;
    for (i, p) in doc.providers.iter().enumerate() {
        let existing_id = existing.iter().find(|m| m.label == p.label).map(|m| m.id.clone());
        let updating = existing_id.is_some();
        // A fresh provider gets a unique, keyless id (the loop index disambiguates
        // same-millisecond inserts); an existing one keeps its id.
        let id = existing_id
            .unwrap_or_else(|| format!("prov-{}-{}", atomic_fs::now_millis(), i));
        // `None` => never write a token to the vault.
        providers::upsert(&index, build_provider_input(id, p), None)?;
        if updating {
            summary.providers_updated += 1;
        } else {
            summary.providers_added += 1;
        }
    }

    // Apply only the known, non-secret pref keys.
    summary.prefs_applied = apply_prefs(&config_dir.join(STORE_FILE), &doc.prefs)?;

    Ok(summary)
}

/// Build a keyless provider upsert input from an export entry. The base URL and
/// model carry over; everything secret/unknown defaults to empty/None.
fn build_provider_input(id: String, p: &ExportProvider) -> ProviderConfigInput {
    let model = p.model.clone().unwrap_or_default();
    ProviderConfigInput {
        id: Some(id),
        title: p.label.clone(),
        brand: String::new(),
        env: ProviderEnv {
            base_url: p.base_url.clone().unwrap_or_default(),
            model: model.clone(),
            default_sonnet: model.clone(),
            default_haiku: model,
            max_thinking_tokens: None,
            max_output_tokens: None,
            https_proxy: None,
            disable_telemetry: None,
        },
        config: ProviderSettings {
            cleanup_period_days: None,
            include_co_authored_by: None,
            output_style: None,
            force_login_method: None,
            force_login_org_uuid: None,
            enable_all_project_mcp_servers: None,
            enabled_mcp_servers: None,
        },
    }
}

/// Apply the allow-listed pref keys from `prefs` into the store file (preserving
/// every other store key), returning how many keys were applied. Unknown/secret
/// keys in `prefs` are silently skipped.
fn apply_prefs(store_path: &Path, prefs: &Value) -> Result<u32, CoreError> {
    let obj = match prefs.as_object() {
        Some(o) => o,
        None => return Ok(0),
    };
    let to_apply: Vec<(String, Value)> = PREF_KEYS
        .iter()
        .filter_map(|key| obj.get(*key).map(|v| ((*key).to_string(), v.clone())))
        .collect();
    if to_apply.is_empty() {
        return Ok(0);
    }
    let applied = to_apply.len() as u32;
    atomic_fs::write_json_preserving(store_path, None, move |value| {
        if !value.is_object() {
            *value = Value::Object(Map::new());
        }
        if let Some(map) = value.as_object_mut() {
            for (k, v) in to_apply {
                map.insert(k, v);
            }
        }
    })?;
    Ok(applied)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Seed the store file with the allow-listed prefs PLUS a foreign secret key
    /// that must never reach the export.
    fn seed_store(dir: &Path) {
        let store = dir.join(STORE_FILE);
        atomic_fs::atomic_write(
            &store,
            json!({
                "theme": { "theme": "dark", "accent": "violet", "density": "comfortable" },
                "language": "fr",
                "experimental": { "agentTeams": true, "teammateMode": "auto" },
                "secretApiKey": "sk-must-not-export"
            })
            .to_string()
            .as_bytes(),
            None,
        )
        .unwrap();
    }

    fn provider_input(id: &str, label: &str, base_url: &str, model: &str) -> ProviderConfigInput {
        ProviderConfigInput {
            id: Some(id.to_string()),
            title: label.to_string(),
            brand: "zai".to_string(),
            env: ProviderEnv {
                base_url: base_url.to_string(),
                model: model.to_string(),
                default_sonnet: model.to_string(),
                default_haiku: model.to_string(),
                max_thinking_tokens: None,
                max_output_tokens: None,
                https_proxy: None,
                disable_telemetry: None,
            },
            config: ProviderSettings {
                cleanup_period_days: None,
                include_co_authored_by: None,
                output_style: None,
                force_login_method: None,
                force_login_org_uuid: None,
                enable_all_project_mcp_servers: None,
                enabled_mcp_servers: None,
            },
        }
    }

    #[test]
    fn build_export_has_labels_baseurls_prefs_and_no_secret() {
        let dir = tempfile::tempdir().unwrap();
        let index = dir.path().join(PROVIDERS_INDEX);

        // Two providers saved WITH tokens — the tokens go to the vault, never the
        // export. The account index carries a label only (no secret blob).
        providers::upsert(
            &index,
            provider_input("zai-1", "GLM-4.6 · Z.ai", "https://api.z.ai/api/anthropic", "glm-4.6"),
            Some("sk-secret-zzz".to_string()),
        )
        .unwrap();
        providers::upsert(
            &index,
            provider_input("kimi-1", "Kimi · Moonshot", "https://api.moonshot.ai/anthropic", "kimi-k2"),
            Some("sk-token-kimi-999".to_string()),
        )
        .unwrap();
        seed_store(dir.path());
        atomic_fs::atomic_write(
            &dir.path().join(ACCOUNTS_FILE),
            json!({ "accounts": [
                { "id": "acc-1", "label": "Work", "email": "w@x.test", "tier": "Max 20x", "lastUsed": 1 }
            ] })
            .to_string()
            .as_bytes(),
            None,
        )
        .unwrap();

        let doc = build_export(dir.path()).unwrap();

        // Header + content present.
        assert_eq!(doc.app, "clavis");
        assert_eq!(doc.schema, SCHEMA);
        assert_eq!(doc.providers.len(), 2);
        assert_eq!(doc.accounts.len(), 1);
        assert_eq!(doc.accounts[0].label, "Work");

        let serialized = serde_json::to_string(&doc).unwrap();
        // Provider labels + base URLs + prefs survive.
        assert!(serialized.contains("GLM-4.6 · Z.ai"));
        assert!(serialized.contains("https://api.z.ai/api/anthropic"));
        assert!(serialized.contains("Kimi · Moonshot"));
        assert!(serialized.contains("glm-4.6"));
        assert!(serialized.contains("\"language\":\"fr\""), "prefs exported: {serialized}");
        assert!(serialized.contains("agentTeams"));

        // SECRET-SAFE: no token value, no secret pref key, no "token"/"apiKey" word.
        let lower = serialized.to_lowercase();
        assert!(!serialized.contains("sk-secret-zzz"), "provider token leaked: {serialized}");
        assert!(!serialized.contains("sk-token-kimi-999"), "provider token leaked: {serialized}");
        assert!(!serialized.contains("sk-must-not-export"), "secret pref leaked: {serialized}");
        assert!(!serialized.contains("secretApiKey"), "non-allow-listed pref leaked: {serialized}");
        assert!(!lower.contains("token"), "the word 'token' must not appear: {serialized}");
        assert!(!lower.contains("apikey"), "the word 'apiKey' must not appear: {serialized}");
    }

    #[test]
    fn apply_import_merges_keyless_and_applies_prefs() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path();

        let doc = ExportDoc {
            app: "clavis".to_string(),
            schema: 1,
            exported_at: 0,
            providers: vec![
                ExportProvider {
                    label: "Imported · GLM".to_string(),
                    base_url: Some("https://api.z.ai/api/anthropic".to_string()),
                    model: Some("glm-4.6".to_string()),
                },
                ExportProvider {
                    label: "Imported · Kimi".to_string(),
                    base_url: Some("https://api.moonshot.ai/anthropic".to_string()),
                    model: Some("kimi-k2".to_string()),
                },
            ],
            prefs: json!({
                "theme": { "theme": "dark", "accent": "violet", "density": "compact" },
                "language": "ja",
                "secretApiKey": "sk-should-be-ignored"
            }),
            accounts: vec![],
        };

        let summary = apply_import(config, &doc).unwrap();
        assert_eq!(summary.providers_added, 2);
        assert_eq!(summary.providers_updated, 0);
        // Only the two allow-listed pref keys were applied (secret key ignored).
        assert_eq!(summary.prefs_applied, 2);

        // Providers were recreated KEYLESS.
        let index = config.join(PROVIDERS_INDEX);
        let metas = providers::list(&index).unwrap();
        assert_eq!(metas.len(), 2);
        let glm = metas.iter().find(|m| m.label == "Imported · GLM").unwrap();
        assert_eq!(glm.base_url.as_deref(), Some("https://api.z.ai/api/anthropic"));
        assert!(
            !providers::get(&index, &glm.id).unwrap().has_token,
            "an imported provider must have NO vaulted token"
        );

        // Prefs landed in the store; the secret key never did.
        let store = atomic_fs::read_json_value(&config.join(STORE_FILE)).unwrap();
        assert_eq!(store["language"], json!("ja"));
        assert_eq!(store["theme"]["density"], json!("compact"));
        assert!(store.get("secretApiKey").is_none(), "secret pref must not be applied");

        // Re-importing the same doc updates in place (matched by label).
        let again = apply_import(config, &doc).unwrap();
        assert_eq!(again.providers_added, 0);
        assert_eq!(again.providers_updated, 2, "re-import updates, never duplicates");
        assert_eq!(providers::list(&index).unwrap().len(), 2);
    }

    #[test]
    fn apply_import_preserves_unrelated_store_keys() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path();
        // A pre-existing store with an unrelated key that must survive the merge.
        atomic_fs::atomic_write(
            &config.join(STORE_FILE),
            json!({ "language": "en", "windowState": { "w": 1200 } })
                .to_string()
                .as_bytes(),
            None,
        )
        .unwrap();

        let doc = ExportDoc {
            app: "clavis".to_string(),
            schema: 1,
            exported_at: 0,
            providers: vec![],
            prefs: json!({ "language": "de" }),
            accounts: vec![],
        };
        let summary = apply_import(config, &doc).unwrap();
        assert_eq!(summary.prefs_applied, 1);

        let store = atomic_fs::read_json_value(&config.join(STORE_FILE)).unwrap();
        assert_eq!(store["language"], json!("de"), "allow-listed pref overwritten");
        assert_eq!(store["windowState"]["w"], json!(1200), "unrelated key preserved");
    }

    #[test]
    fn foreign_header_is_rejected_before_any_write() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path();

        let doc = ExportDoc {
            app: "not-clavis".to_string(),
            schema: 1,
            exported_at: 0,
            providers: vec![ExportProvider {
                label: "Hostile".to_string(),
                base_url: Some("https://evil.test".to_string()),
                model: Some("x".to_string()),
            }],
            prefs: json!({ "language": "zz" }),
            accounts: vec![],
        };

        match apply_import(config, &doc) {
            Err(CoreError::InvalidInput(_)) => {}
            other => panic!("expected InvalidInput for a foreign header, got {other:?}"),
        }
        // No provider index and no store file were created.
        assert!(!config.join(PROVIDERS_INDEX).exists(), "no provider written on reject");
        assert!(!config.join(STORE_FILE).exists(), "no prefs written on reject");
    }

    #[test]
    fn build_export_empty_config_dir_is_a_valid_empty_doc() {
        let dir = tempfile::tempdir().unwrap();
        let doc = build_export(dir.path()).unwrap();
        assert_eq!(doc.app, "clavis");
        assert!(doc.providers.is_empty());
        assert!(doc.accounts.is_empty());
        assert_eq!(doc.prefs, json!({}));
    }
}
