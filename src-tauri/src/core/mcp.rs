//! The Clavis MCP manager — read/normalize/add/edit/remove/toggle the GLOBAL
//! MCP servers in `~/.claude.json` `mcpServers`.
//!
//! A server name lives in exactly one of two places:
//! - **enabled** servers sit in `~/.claude.json` `mcpServers` (what Claude Code reads);
//! - **disabled** servers sit in a Clavis-managed *disabled stash*
//!   (`mcp_disabled.json` in the app config dir), so toggling a server off never
//!   loses its definition.
//!
//! Every `~/.claude.json` write goes through `atomic_fs` (`write_json_preserving`),
//! so the ~50 other keys (`oauthAccount`, `userID`, `projects`, `mcpOAuth`, …) are
//! preserved in place and order. This module NEVER reads or writes
//! `.credentials.json` or the `mcpOAuth` key — per-MCP OAuth tokens are not ours.
#![allow(dead_code)] // commands wire these entry points up alongside this task

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use serde_json::{Map, Value};

use super::atomic_fs;
use crate::model::{CoreError, McpServer, McpServerInput};

/// Unix permission bits for the Clavis disabled stash (non-secret index).
const STASH_MODE: u32 = 0o600;

// ---------------------------------------------------------------------------
// Public API (path-injectable: commands pass real paths, tests pass temps)
// ---------------------------------------------------------------------------

/// List MCP servers: enabled from `~/.claude.json` + disabled from the stash,
/// each normalized. A missing/malformed `mcpServers` yields no enabled servers
/// (never a crash). A name found in both places is reported once (enabled wins).
pub fn list(claude_json: &Path, stash: &Path) -> Result<Vec<McpServer>, CoreError> {
    let mut out = Vec::new();
    let mut seen = BTreeSet::new();

    for (name, def) in read_servers(claude_json)? {
        seen.insert(name.clone());
        out.push(normalize(&name, &def, true));
    }
    for (name, def) in read_stash(stash)? {
        if seen.contains(&name) {
            continue; // defensive: a name should live in exactly one place
        }
        out.push(normalize(&name, &def, false));
    }
    Ok(out)
}

/// Create or replace an (enabled) server in `~/.claude.json` `mcpServers`,
/// preserving every other key. Returns the normalized view.
pub fn upsert(claude_json: &Path, input: McpServerInput) -> Result<McpServer, CoreError> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(CoreError::InvalidInput("MCP server name is required".into()));
    }
    let def = build_def(&input)?;
    let stored = def.clone();
    let stored_name = name.clone();
    edit_servers(claude_json, move |map| {
        map.insert(stored_name, stored);
    })?;
    Ok(normalize(&name, &def, true))
}

/// Remove a server by name from BOTH `~/.claude.json` `mcpServers` and the
/// disabled stash (so removing a disabled server works too). Idempotent.
pub fn remove(claude_json: &Path, stash: &Path, name: &str) -> Result<(), CoreError> {
    edit_servers(claude_json, |map| {
        map.remove(name);
    })?;
    let mut disabled = read_stash(stash)?;
    if disabled.remove(name).is_some() {
        write_stash(stash, &disabled)?;
    }
    Ok(())
}

/// Toggle a server on/off by MOVING its definition between `~/.claude.json`
/// `mcpServers` and the disabled stash — the definition is never lost.
///
/// - **disable** (`on=false`): copy the def into the stash FIRST, then remove it
///   from `~/.claude.json`. A crash in between leaves the def in BOTH places
///   (recoverable), never in neither.
/// - **enable** (`on=true`): add the def to `~/.claude.json` FIRST, then clear
///   the stash entry.
///
/// Idempotent: enabling an already-enabled server (or disabling an already-disabled
/// one) is a no-op.
pub fn set_enabled(
    claude_json: &Path,
    stash: &Path,
    name: &str,
    on: bool,
) -> Result<(), CoreError> {
    if on {
        let mut disabled = read_stash(stash)?;
        let def = match disabled.get(name).cloned() {
            Some(d) => d,
            None => return Ok(()), // already enabled / unknown
        };
        // Add to json FIRST, then clear the stash.
        edit_servers(claude_json, |map| {
            map.insert(name.to_string(), def);
        })?;
        disabled.remove(name);
        write_stash(stash, &disabled)?;
    } else {
        let servers = read_servers(claude_json)?;
        let def = match servers.get(name).cloned() {
            Some(d) => d,
            None => return Ok(()), // already disabled / unknown
        };
        // Write the stash FIRST, then remove from json.
        let mut disabled = read_stash(stash)?;
        disabled.insert(name.to_string(), def);
        write_stash(stash, &disabled)?;
        edit_servers(claude_json, |map| {
            map.remove(name);
        })?;
    }
    Ok(())
}

/// Count of enabled (global) servers in `~/.claude.json` `mcpServers`.
pub fn enabled_count(claude_json: &Path) -> Result<usize, CoreError> {
    Ok(read_servers(claude_json)?.len())
}

// ---------------------------------------------------------------------------
// `~/.claude.json` `mcpServers` I/O (atomic, preserve every other key)
// ---------------------------------------------------------------------------

/// Read the `mcpServers` object as name -> raw definition. Missing file, missing
/// key, or a non-object `mcpServers` all yield an empty map (no crash); non-object
/// entries are skipped.
fn read_servers(claude_json: &Path) -> Result<Map<String, Value>, CoreError> {
    if !claude_json.exists() {
        return Ok(Map::new());
    }
    let value = atomic_fs::read_json_value(claude_json)?;
    Ok(object_entries(value.get("mcpServers").cloned()))
}

/// Backup `~/.claude.json`, then mutate its `mcpServers` map in place (preserving
/// every other key + order) and atomically write it back.
fn edit_servers<F>(claude_json: &Path, mutate: F) -> Result<(), CoreError>
where
    F: FnOnce(&mut Map<String, Value>),
{
    atomic_fs::backup(claude_json)?;
    atomic_fs::write_json_preserving(claude_json, None, |value| {
        let obj = match value.as_object_mut() {
            Some(o) => o,
            None => return,
        };
        let servers = obj
            .entry("mcpServers")
            .or_insert_with(|| Value::Object(Map::new()));
        if !servers.is_object() {
            *servers = Value::Object(Map::new());
        }
        if let Some(map) = servers.as_object_mut() {
            mutate(map);
        }
    })
}

// ---------------------------------------------------------------------------
// Disabled stash I/O (a JSON map name -> raw definition)
// ---------------------------------------------------------------------------

/// Read the disabled stash as name -> raw definition (empty when absent/malformed).
fn read_stash(stash: &Path) -> Result<Map<String, Value>, CoreError> {
    if !stash.exists() {
        return Ok(Map::new());
    }
    // Tolerate a malformed stash (Clavis-managed, but never crash the list).
    match atomic_fs::read_json_value(stash) {
        Ok(v) => Ok(object_entries(Some(v))),
        Err(_) => Ok(Map::new()),
    }
}

/// Atomically persist the disabled stash map.
fn write_stash(stash: &Path, map: &Map<String, Value>) -> Result<(), CoreError> {
    let bytes = serde_json::to_vec_pretty(&Value::Object(map.clone())).map_err(CoreError::from)?;
    atomic_fs::atomic_write(stash, &bytes, Some(STASH_MODE))
}

// ---------------------------------------------------------------------------
// Normalization (raw definition <-> McpServer / McpServerInput)
// ---------------------------------------------------------------------------

/// Keep only object-valued entries from a JSON object value (else empty map).
fn object_entries(v: Option<Value>) -> Map<String, Value> {
    match v {
        Some(Value::Object(obj)) => obj.into_iter().filter(|(_, d)| d.is_object()).collect(),
        _ => Map::new(),
    }
}

/// Normalize one raw `mcpServers` entry into an `McpServer`. Missing `type`
/// defaults to `"stdio"`; global servers are scope `"user"`.
fn normalize(name: &str, def: &Value, enabled: bool) -> McpServer {
    let transport = def
        .get("type")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("stdio")
        .to_string();
    let command = def.get("command").and_then(Value::as_str).map(str::to_string);
    let args = def.get("args").and_then(Value::as_array).map(|a| {
        a.iter()
            .filter_map(|v| v.as_str().map(str::to_string))
            .collect()
    });
    let env = def.get("env").and_then(Value::as_object).map(|o| {
        o.iter()
            .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
            .collect::<BTreeMap<String, String>>()
    });
    let url = def.get("url").and_then(Value::as_str).map(str::to_string);
    let tools_hint = def
        .get("toolsHint")
        .and_then(Value::as_str)
        .map(str::to_string);
    McpServer {
        name: name.to_string(),
        transport,
        command,
        args,
        env,
        url,
        scope: "user".to_string(),
        enabled,
        tools_hint,
    }
}

/// Build the raw `mcpServers` entry value for an input (stdio: `type`+`command`
/// [+`args`][+`env`]; http/sse: `type`+`url`).
fn build_def(input: &McpServerInput) -> Result<Value, CoreError> {
    let transport = match input.transport.trim() {
        "" => "stdio",
        other => other,
    };
    let mut def = Map::new();
    def.insert("type".to_string(), Value::from(transport));
    match transport {
        "http" | "sse" => {
            let url = input
                .url
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    CoreError::InvalidInput(format!("{transport} server needs a url"))
                })?;
            def.insert("url".to_string(), Value::from(url));
        }
        _ => {
            let command = input
                .command
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| CoreError::InvalidInput("stdio server needs a command".into()))?;
            def.insert("command".to_string(), Value::from(command));
            if let Some(args) = &input.args {
                if !args.is_empty() {
                    def.insert(
                        "args".to_string(),
                        Value::Array(args.iter().map(|a| Value::from(a.clone())).collect()),
                    );
                }
            }
            if let Some(env) = &input.env {
                if !env.is_empty() {
                    let mut envmap = Map::new();
                    for (k, v) in env {
                        envmap.insert(k.clone(), Value::from(v.clone()));
                    }
                    def.insert("env".to_string(), Value::Object(envmap));
                }
            }
        }
    }
    Ok(Value::Object(def))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// A realistic `~/.claude.json` with identity/state keys we must NOT touch
    /// plus a `mcpServers` block (stdio with type+command+args+env, http with url,
    /// and a minimal stdio without `type`).
    fn seed_claude_json(path: &Path) {
        let seed = json!({
            "userID": "uid-1",
            "oauthAccount": { "emailAddress": "me@example.test" },
            "mcpOAuth": { "github": { "access": "DO-NOT-TOUCH" } },
            "mcpServers": {
                "context7": {
                    "type": "stdio",
                    "command": "npx",
                    "args": ["-y", "@upstash/context7-mcp"],
                    "env": { "API_KEY": "k1" }
                },
                "exa": { "type": "http", "url": "https://mcp.exa.ai/mcp" },
                "minimal": { "command": "node", "args": ["server.js"] }
            },
            "projects": { "/home/x": { "history": [] } }
        });
        atomic_fs::atomic_write(path, seed.to_string().as_bytes(), None).unwrap();
    }

    fn paths(dir: &Path) -> (std::path::PathBuf, std::path::PathBuf) {
        (dir.join(".claude.json"), dir.join("mcp_disabled.json"))
    }

    #[test]
    fn list_normalizes_stdio_and_http() {
        let dir = tempfile::tempdir().unwrap();
        let (cj, stash) = paths(dir.path());
        seed_claude_json(&cj);

        let servers = list(&cj, &stash).unwrap();
        assert_eq!(servers.len(), 3, "all three enabled servers listed");

        let c7 = servers.iter().find(|s| s.name == "context7").unwrap();
        assert_eq!(c7.transport, "stdio");
        assert_eq!(c7.command.as_deref(), Some("npx"));
        assert_eq!(
            c7.args.as_deref(),
            Some(&["-y".to_string(), "@upstash/context7-mcp".to_string()][..])
        );
        assert_eq!(c7.env.as_ref().unwrap().get("API_KEY").unwrap(), "k1");
        assert_eq!(c7.scope, "user");
        assert!(c7.enabled);

        let exa = servers.iter().find(|s| s.name == "exa").unwrap();
        assert_eq!(exa.transport, "http");
        assert_eq!(exa.url.as_deref(), Some("https://mcp.exa.ai/mcp"));
        assert!(exa.command.is_none());

        // Missing `type` normalizes to stdio.
        let minimal = servers.iter().find(|s| s.name == "minimal").unwrap();
        assert_eq!(minimal.transport, "stdio");
        assert_eq!(minimal.command.as_deref(), Some("node"));
    }

    #[test]
    fn upsert_preserves_other_claude_json_keys() {
        let dir = tempfile::tempdir().unwrap();
        let (cj, _stash) = paths(dir.path());
        seed_claude_json(&cj);

        let input = McpServerInput {
            name: "serena".to_string(),
            transport: "stdio".to_string(),
            command: Some("uvx".to_string()),
            args: Some(vec!["serena".to_string()]),
            env: Some(BTreeMap::from([("LOG".to_string(), "info".to_string())])),
            url: None,
            scope: None,
        };
        let view = upsert(&cj, input).unwrap();
        assert_eq!(view.name, "serena");
        assert!(view.enabled);

        let after = atomic_fs::read_json_value(&cj).unwrap();
        let obj = after.as_object().unwrap();

        // New server written.
        let servers = obj.get("mcpServers").unwrap().as_object().unwrap();
        assert_eq!(servers.get("serena").unwrap()["command"], json!("uvx"));
        // Pre-existing servers preserved.
        assert!(servers.contains_key("context7"));
        assert!(servers.contains_key("exa"));
        // Every other top-level key preserved untouched — including mcpOAuth.
        assert_eq!(obj.get("userID"), Some(&json!("uid-1")));
        assert_eq!(
            obj.get("oauthAccount"),
            Some(&json!({ "emailAddress": "me@example.test" }))
        );
        assert_eq!(
            obj.get("mcpOAuth"),
            Some(&json!({ "github": { "access": "DO-NOT-TOUCH" } }))
        );
        assert_eq!(obj.get("projects"), Some(&json!({ "/home/x": { "history": [] } })));
    }

    #[test]
    fn remove_deletes_the_server() {
        let dir = tempfile::tempdir().unwrap();
        let (cj, stash) = paths(dir.path());
        seed_claude_json(&cj);

        remove(&cj, &stash, "exa").unwrap();

        let names: Vec<String> = list(&cj, &stash).unwrap().into_iter().map(|s| s.name).collect();
        assert!(!names.contains(&"exa".to_string()), "exa removed");
        assert!(names.contains(&"context7".to_string()), "others kept");
    }

    #[test]
    fn set_enabled_false_stashes_and_true_restores() {
        let dir = tempfile::tempdir().unwrap();
        let (cj, stash) = paths(dir.path());
        seed_claude_json(&cj);

        // Disable: leaves json, enters stash, definition preserved.
        set_enabled(&cj, &stash, "context7", false).unwrap();

        let in_json = read_servers(&cj).unwrap();
        assert!(!in_json.contains_key("context7"), "removed from ~/.claude.json");
        let stashed = read_stash(&stash).unwrap();
        assert!(stashed.contains_key("context7"), "parked in the stash");
        // Definition preserved verbatim (command/args/env intact).
        assert_eq!(stashed["context7"]["command"], json!("npx"));
        assert_eq!(stashed["context7"]["env"]["API_KEY"], json!("k1"));

        // list still shows it, now disabled.
        let disabled = list(&cj, &stash)
            .unwrap()
            .into_iter()
            .find(|s| s.name == "context7")
            .unwrap();
        assert!(!disabled.enabled);
        assert_eq!(disabled.command.as_deref(), Some("npx"));

        // Enable: restored to json, stash cleared.
        set_enabled(&cj, &stash, "context7", true).unwrap();
        assert!(read_servers(&cj).unwrap().contains_key("context7"), "restored to json");
        assert!(
            !read_stash(&stash).unwrap().contains_key("context7"),
            "stash entry cleared"
        );
        let restored = list(&cj, &stash)
            .unwrap()
            .into_iter()
            .find(|s| s.name == "context7")
            .unwrap();
        assert!(restored.enabled);
    }

    #[test]
    fn enabled_count_counts_only_json_servers() {
        let dir = tempfile::tempdir().unwrap();
        let (cj, stash) = paths(dir.path());
        seed_claude_json(&cj);

        assert_eq!(enabled_count(&cj).unwrap(), 3);

        // Disabling one drops the enabled count (it moves to the stash).
        set_enabled(&cj, &stash, "minimal", false).unwrap();
        assert_eq!(enabled_count(&cj).unwrap(), 2);
        // The disabled one still appears in list() (4-1 enabled + 1 disabled = 3 total).
        assert_eq!(list(&cj, &stash).unwrap().len(), 3);
    }

    #[test]
    fn malformed_mcp_servers_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let (cj, stash) = paths(dir.path());
        // Valid JSON, but `mcpServers` is not an object.
        atomic_fs::atomic_write(
            &cj,
            json!({ "mcpServers": "not-an-object", "userID": "u" })
                .to_string()
                .as_bytes(),
            None,
        )
        .unwrap();

        assert!(list(&cj, &stash).unwrap().is_empty(), "no crash, empty list");
        assert_eq!(enabled_count(&cj).unwrap(), 0);
    }

    #[test]
    fn list_missing_file_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let (cj, stash) = paths(dir.path());
        assert!(list(&cj, &stash).unwrap().is_empty());
        assert_eq!(enabled_count(&cj).unwrap(), 0);
    }

    #[test]
    fn upsert_http_requires_url_and_stdio_requires_command() {
        let dir = tempfile::tempdir().unwrap();
        let (cj, _stash) = paths(dir.path());

        let bad_http = McpServerInput {
            name: "h".into(),
            transport: "http".into(),
            command: None,
            args: None,
            env: None,
            url: None,
            scope: None,
        };
        assert!(matches!(upsert(&cj, bad_http), Err(CoreError::InvalidInput(_))));

        let bad_stdio = McpServerInput {
            name: "s".into(),
            transport: "stdio".into(),
            command: None,
            args: None,
            env: None,
            url: None,
            scope: None,
        };
        assert!(matches!(upsert(&cj, bad_stdio), Err(CoreError::InvalidInput(_))));
    }
}
