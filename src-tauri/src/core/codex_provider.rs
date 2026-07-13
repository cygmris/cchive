//! Codex providers (gateways) — the Codex twin of `core/providers.rs`.
//!
//! Points Codex at an OpenAI-compatible gateway by SURGICALLY editing
//! `~/.codex/config.toml`: it sets the top-level `model_provider` + `model` and
//! upserts a `[model_providers.<id>]` table (`name` / `base_url` / `wire_api` /
//! `experimental_bearer_token`). Every other key (the user's `[mcp_servers.*]`,
//! `[projects.*]`, comments) is preserved via `toml_edit`, and `auth.json` is
//! NEVER touched — the ChatGPT OAuth login is left intact.
//!
//! Non-secret metadata lives in a cchive-managed index; the API key lives apart in
//! the OS keyring (`app.cchive.codex.providers/<id>`) and is folded into
//! `config.toml` only at apply time — no key ever rides on the index or any view.
#![allow(dead_code)] // commands wire these entry points up in a later task

use std::collections::HashSet;
use std::path::Path;

use toml_edit::{value, DocumentMut, Item, Table};

use super::{atomic_fs, keyring_store};
use crate::model::{CodexProviderConfigView, CodexProviderInput, CodexProviderMeta, CoreError};

/// Unix permission bits for the provider index (non-secret, but kept tight).
const INDEX_MODE: u32 = 0o600;

/// Reserved built-in Codex provider ids — must not be used as a custom gateway id
/// (they are owned by the Codex CLI; a `[model_providers.openai]` would shadow it).
const RESERVED_PROVIDER_IDS: &[&str] =
    &["openai", "ollama", "oss", "lmstudio", "ollama-chat", "amazon-bedrock"];

fn is_reserved(id: &str) -> bool {
    RESERVED_PROVIDER_IDS
        .iter()
        .any(|r| r.eq_ignore_ascii_case(id.trim()))
}

fn normalize_wire_api(wire_api: &str) -> String {
    match wire_api.trim().to_ascii_lowercase().as_str() {
        "responses" => "responses".to_string(),
        _ => "chat".to_string(), // default: /v1/chat/completions gateways
    }
}

// ---------------------------------------------------------------------------
// Public API (path-injectable so commands pass real paths, tests pass temps)
// ---------------------------------------------------------------------------

/// List saved Codex providers as non-secret metadata.
pub fn list(index: &Path) -> Result<Vec<CodexProviderMeta>, CoreError> {
    load(index)
}

/// Read one provider as a view (routing fields + `hasToken`, never the key).
pub fn get(index: &Path, id: &str) -> Result<CodexProviderConfigView, CoreError> {
    let m = find(index, id)?;
    let has_token = keyring_store::codex_provider_vault_has(id)?;
    Ok(view_of(m, has_token))
}

/// Create or replace a provider. `new_token` `Some` (re)writes the vaulted key;
/// `None` leaves any existing key untouched (an edit that doesn't retype it).
pub fn upsert(
    index: &Path,
    input: CodexProviderInput,
    new_token: Option<String>,
) -> Result<CodexProviderConfigView, CoreError> {
    let id = match input.id {
        Some(ref s) if !s.trim().is_empty() => s.trim().to_string(),
        _ => unique_id(index, &slugify(&input.label))?,
    };
    if is_reserved(&id) {
        return Err(CoreError::InvalidInput(format!(
            "'{id}' is a reserved Codex provider id"
        )));
    }

    let meta = CodexProviderMeta {
        id: id.clone(),
        label: input.label,
        base_url: input.base_url,
        wire_api: normalize_wire_api(&input.wire_api),
        model: input.model.filter(|m| !m.trim().is_empty()),
    };

    let mut list = load(index)?;
    list.retain(|c| c.id != id);
    list.push(meta.clone());
    store(index, &list)?;

    if let Some(token) = new_token {
        if !token.is_empty() {
            keyring_store::codex_provider_vault_put(&id, &token)?;
        }
    }
    let has_token = keyring_store::codex_provider_vault_has(&id)?;
    Ok(view_of(meta, has_token))
}

/// Remove a provider from the index AND delete its vaulted key (idempotent).
pub fn delete(index: &Path, id: &str) -> Result<(), CoreError> {
    let mut list = load(index)?;
    let before = list.len();
    list.retain(|c| c.id != id);
    if list.len() != before {
        store(index, &list)?;
    }
    keyring_store::codex_provider_vault_delete(id)
}

/// Point Codex at provider `id`: surgically edit `config.toml` (model_provider +
/// model + `[model_providers.<id>]` with the vaulted bearer token). `auth.json`
/// is never touched; every other config key is preserved.
pub fn apply(index: &Path, config_path: &Path, id: &str) -> Result<(), CoreError> {
    let meta = find(index, id)?;
    let token = match keyring_store::codex_provider_vault_get(id) {
        Ok(t) => Some(t),
        Err(CoreError::NotFound(_)) => None, // key-less profile applies without a token
        Err(other) => return Err(other),
    };

    let mut doc = parse_doc(config_path)?;

    doc["model_provider"] = value(id);
    if let Some(model) = &meta.model {
        doc["model"] = value(model.as_str());
    }

    // Ensure the parent `[model_providers]` table exists (implicit -> only the
    // `[model_providers.<id>]` header is emitted).
    if doc.get("model_providers").and_then(Item::as_table).is_none() {
        let mut parent = Table::new();
        parent.set_implicit(true);
        doc["model_providers"] = Item::Table(parent);
    }
    let providers = doc["model_providers"]
        .as_table_mut()
        .ok_or_else(|| CoreError::InvalidInput("model_providers is not a table".to_string()))?;

    let mut table = providers
        .get(id)
        .and_then(Item::as_table)
        .cloned()
        .unwrap_or_default();
    table["name"] = value(meta.label.as_str());
    table["base_url"] = value(meta.base_url.as_str());
    table["wire_api"] = value(meta.wire_api.as_str());
    if let Some(tok) = &token {
        table["experimental_bearer_token"] = value(tok.as_str());
    }
    providers.insert(id, Item::Table(table));

    write_config(config_path, &doc.to_string())
}

/// Switch back to the Codex account: remove the active `model_provider` and only
/// its `[model_providers.<id>]` table. Unrelated tables + `auth.json` are left as-is.
pub fn clear(config_path: &Path) -> Result<(), CoreError> {
    let current = read_text(config_path)?;
    if current.trim().is_empty() {
        return Ok(());
    }
    let mut doc = current
        .parse::<DocumentMut>()
        .map_err(|e| CoreError::InvalidInput(format!("~/.codex/config.toml is not valid TOML: {e}")))?;

    let Some(active) = doc
        .get("model_provider")
        .and_then(Item::as_str)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    else {
        return Ok(()); // no active provider — nothing to clear
    };

    doc.as_table_mut().remove("model_provider");
    if let Some(providers) = doc.get_mut("model_providers").and_then(Item::as_table_mut) {
        providers.remove(&active);
        if providers.is_empty() {
            doc.as_table_mut().remove("model_providers");
        }
    }

    write_config(config_path, &doc.to_string())
}

/// The active gateway provider from `config.toml`, if any: `(id, label, base_url)`.
/// A reserved/built-in `model_provider` (openai/ollama/…) is NOT a gateway → `None`.
pub fn read_active_provider(config_path: &Path) -> Option<(String, String, String)> {
    let text = std::fs::read_to_string(config_path).ok()?;
    let doc = text.parse::<DocumentMut>().ok()?;
    let id = doc
        .get("model_provider")
        .and_then(Item::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty() && !is_reserved(s))?
        .to_string();

    let table = doc
        .get("model_providers")
        .and_then(Item::as_table)
        .and_then(|t| t.get(&id))
        .and_then(Item::as_table);
    let label = table
        .and_then(|t| t.get("name"))
        .and_then(Item::as_str)
        .unwrap_or(&id)
        .to_string();
    let base_url = table
        .and_then(|t| t.get("base_url"))
        .and_then(Item::as_str)
        .unwrap_or("")
        .to_string();
    Some((id, label, base_url))
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

fn view_of(m: CodexProviderMeta, has_token: bool) -> CodexProviderConfigView {
    CodexProviderConfigView {
        id: m.id,
        label: m.label,
        base_url: m.base_url,
        wire_api: m.wire_api,
        model: m.model,
        has_token,
    }
}

fn read_text(path: &Path) -> Result<String, CoreError> {
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(path).map_err(|e| CoreError::Io(e.to_string()))
}

/// Parse `config.toml` (empty when absent) into an editable doc; a syntax error
/// is surfaced and leaves the file untouched (the caller never writes).
fn parse_doc(config_path: &Path) -> Result<DocumentMut, CoreError> {
    read_text(config_path)?
        .parse::<DocumentMut>()
        .map_err(|e| CoreError::InvalidInput(format!("~/.codex/config.toml is not valid TOML: {e}")))
}

/// Backup-first atomic write of `config.toml` (0600); restore on write failure.
fn write_config(config_path: &Path, text: &str) -> Result<(), CoreError> {
    let backup = atomic_fs::backup(config_path)?;
    if let Err(e) = atomic_fs::atomic_write(config_path, text.as_bytes(), Some(0o600)) {
        if let Some(h) = &backup {
            let _ = atomic_fs::restore(h);
        }
        return Err(e);
    }
    Ok(())
}

fn load(index: &Path) -> Result<Vec<CodexProviderMeta>, CoreError> {
    if !index.exists() {
        return Ok(Vec::new());
    }
    let value = atomic_fs::read_json_value(index)?;
    serde_json::from_value(value).map_err(CoreError::from)
}

fn store(index: &Path, list: &[CodexProviderMeta]) -> Result<(), CoreError> {
    let bytes = serde_json::to_vec_pretty(list).map_err(CoreError::from)?;
    atomic_fs::atomic_write(index, &bytes, Some(INDEX_MODE))
}

fn find(index: &Path, id: &str) -> Result<CodexProviderMeta, CoreError> {
    load(index)?
        .into_iter()
        .find(|c| c.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("codex provider {id}")))
}

fn slugify(label: &str) -> String {
    let s: String = label
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let s = s.trim_matches('-').to_string();
    if s.is_empty() {
        "gateway".to_string()
    } else {
        s
    }
}

/// A unique, non-reserved id derived from `slug` (`slug`, `slug-2`, `slug-3`, …).
fn unique_id(index: &Path, slug: &str) -> Result<String, CoreError> {
    let existing: HashSet<String> = load(index)?.into_iter().map(|c| c.id).collect();
    if !existing.contains(slug) && !is_reserved(slug) {
        return Ok(slug.to_string());
    }
    for n in 2u32.. {
        let candidate = format!("{slug}-{n}");
        if !existing.contains(&candidate) && !is_reserved(&candidate) {
            return Ok(candidate);
        }
    }
    unreachable!("an unused id always exists")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(label: &str, base_url: &str, model: Option<&str>) -> CodexProviderInput {
        CodexProviderInput {
            id: None,
            label: label.to_string(),
            base_url: base_url.to_string(),
            wire_api: "chat".to_string(),
            model: model.map(str::to_string),
        }
    }

    #[test]
    fn apply_into_empty_config_writes_provider_and_token() {
        let dir = tempfile::tempdir().unwrap();
        let index = dir.path().join("idx.json");
        let config = dir.path().join("config.toml");

        let view = upsert(
            &index,
            input("Pixie", "https://pixie.example/v1", Some("gpt-5.5")),
            Some("sk-SECRET".to_string()),
        )
        .unwrap();
        assert!(view.has_token);

        apply(&index, &config, &view.id).unwrap();
        let text = std::fs::read_to_string(&config).unwrap();
        let doc = text.parse::<DocumentMut>().unwrap();
        assert_eq!(doc.get("model_provider").and_then(Item::as_str), Some(view.id.as_str()));
        assert_eq!(doc.get("model").and_then(Item::as_str), Some("gpt-5.5"));
        let t = doc
            .get("model_providers")
            .and_then(Item::as_table)
            .and_then(|p| p.get(&view.id))
            .and_then(Item::as_table)
            .unwrap();
        assert_eq!(t.get("base_url").and_then(Item::as_str), Some("https://pixie.example/v1"));
        assert_eq!(t.get("wire_api").and_then(Item::as_str), Some("chat"));
        assert_eq!(t.get("name").and_then(Item::as_str), Some("Pixie"));
        assert_eq!(
            t.get("experimental_bearer_token").and_then(Item::as_str),
            Some("sk-SECRET")
        );
    }

    #[test]
    fn apply_preserves_existing_config() {
        let dir = tempfile::tempdir().unwrap();
        let index = dir.path().join("idx.json");
        let config = dir.path().join("config.toml");
        std::fs::write(
            &config,
            "# my notes\nmodel_reasoning_effort = \"max\"\n\n[mcp_servers.brave]\ncommand = \"npx\"\n",
        )
        .unwrap();

        let view = upsert(&index, input("GW", "https://gw/v1", None), Some("k".to_string())).unwrap();
        apply(&index, &config, &view.id).unwrap();

        let text = std::fs::read_to_string(&config).unwrap();
        assert!(text.contains("# my notes"), "comment preserved");
        assert!(text.contains("[mcp_servers.brave]"), "mcp server preserved");
        assert!(text.contains("model_reasoning_effort"), "other key preserved");
        assert!(text.contains("experimental_bearer_token"), "provider written");
    }

    #[test]
    fn malformed_config_errors_and_leaves_file_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let index = dir.path().join("idx.json");
        let config = dir.path().join("config.toml");
        std::fs::write(&config, "not = = valid toml").unwrap();

        let view = upsert(&index, input("GW", "https://gw/v1", None), Some("k".to_string())).unwrap();
        let err = apply(&index, &config, &view.id).unwrap_err();
        assert!(matches!(err, CoreError::InvalidInput(_)));
        assert_eq!(std::fs::read_to_string(&config).unwrap(), "not = = valid toml");
    }

    #[test]
    fn clear_removes_only_the_active_provider() {
        let dir = tempfile::tempdir().unwrap();
        let index = dir.path().join("idx.json");
        let config = dir.path().join("config.toml");
        std::fs::write(
            &config,
            "[model_providers.other]\nbase_url = \"https://other/v1\"\n",
        )
        .unwrap();

        let view = upsert(&index, input("GW", "https://gw/v1", None), Some("k".to_string())).unwrap();
        apply(&index, &config, &view.id).unwrap();
        // Sanity: active gateway is reported.
        let active = read_active_provider(&config).unwrap();
        assert_eq!(active.0, view.id);
        assert_eq!(active.2, "https://gw/v1");

        clear(&config).unwrap();
        let text = std::fs::read_to_string(&config).unwrap();
        assert!(!text.contains("model_provider ="), "model_provider removed");
        assert!(!text.contains(&format!("[model_providers.{}]", view.id)), "our table removed");
        assert!(text.contains("[model_providers.other]"), "unrelated table kept");
        assert!(read_active_provider(&config).is_none());
    }

    #[test]
    fn reserved_id_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let index = dir.path().join("idx.json");
        let mut inp = input("OpenAI", "https://x/v1", None);
        inp.id = Some("openai".to_string());
        assert!(matches!(
            upsert(&index, inp, None).unwrap_err(),
            CoreError::InvalidInput(_)
        ));
    }
}
