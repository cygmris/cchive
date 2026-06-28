//! Project discovery + per-project `.claude/settings.local.json` editing.
//!
//! `list_projects` enumerates the `projects` keys in `~/.claude.json` (read-only)
//! and reports each as `{ path, name, has_local_settings, last_activity? }`. A
//! malformed/absent `~/.claude.json` (or a missing/non-object `projects`) yields
//! an empty list rather than erroring the whole screen. `read_project_settings` /
//! `write_project_settings` round-trip a project's `.claude/settings.local.json`
//! as raw JSON text (validated before any write, atomic, creating `.claude/`).
//!
//! SAFETY: this module reads ONLY the `projects` map of `~/.claude.json` and
//! reads/writes ONLY `<project>/.claude/settings.local.json`. It never touches
//! `.credentials.json`, `oauthAccount`, `mcpOAuth`, or any other secret.
#![allow(dead_code)] // callers (commands) wire these up alongside this task

use std::path::{Path, PathBuf};

use serde_json::Value;

use super::{atomic_fs, paths};
use crate::model::{CoreError, Project, ProjectSettings};

/// `<project>/.claude/settings.local.json`.
fn local_settings_path(project: &Path) -> PathBuf {
    project.join(".claude").join("settings.local.json")
}

/// List the projects from `~/.claude.json` `projects` (empty on malformed/absent).
pub fn list_projects() -> Result<Vec<Project>, CoreError> {
    list_projects_at(&paths::dot_claude_json())
}

/// Read a project's `.claude/settings.local.json` raw text (`"{}"` if absent).
pub fn read_project_settings(project: &str) -> Result<ProjectSettings, CoreError> {
    read_project_settings_at(Path::new(project))
}

/// Validate `raw` is JSON, then atomically write it to a project's
/// `.claude/settings.local.json` (creating `.claude/`).
pub fn write_project_settings(project: &str, raw: &str) -> Result<(), CoreError> {
    write_project_settings_at(Path::new(project), raw)
}

/// Path-parameterized listing (for tests + an explicit config path).
fn list_projects_at(claude_json: &Path) -> Result<Vec<Project>, CoreError> {
    if !claude_json.exists() {
        return Ok(Vec::new());
    }
    // A corrupt `~/.claude.json` must not break the Projects screen — empty list.
    let value = match atomic_fs::read_json_value(claude_json) {
        Ok(v) => v,
        Err(_) => return Ok(Vec::new()),
    };
    // Missing or non-object `projects` → empty list.
    let projects = match value.get("projects").and_then(Value::as_object) {
        Some(p) => p,
        None => return Ok(Vec::new()),
    };

    let mut out: Vec<Project> = projects
        .iter()
        .map(|(path, entry)| {
            let root = Path::new(path);
            let name = root
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.clone());
            Project {
                path: path.clone(),
                name,
                has_local_settings: local_settings_path(root).exists(),
                last_activity: entry.get("lastActivity").and_then(Value::as_i64),
            }
        })
        .collect();
    // Deterministic, alphabetical order for the list + stable test assertions.
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// Path-parameterized read (for tests + an explicit project root).
fn read_project_settings_at(project: &Path) -> Result<ProjectSettings, CoreError> {
    let file = local_settings_path(project);
    let raw = if file.exists() {
        std::fs::read_to_string(&file).map_err(CoreError::from)?
    } else {
        "{}".to_string()
    };
    Ok(ProjectSettings {
        path: project.to_string_lossy().into_owned(),
        raw,
    })
}

/// Path-parameterized write (for tests + an explicit project root).
fn write_project_settings_at(project: &Path, raw: &str) -> Result<(), CoreError> {
    // Validate before any write — never persist a broken settings file.
    serde_json::from_str::<Value>(raw).map_err(|e| {
        CoreError::InvalidInput(format!("settings.local.json is not valid JSON: {e}"))
    })?;
    // `atomic_write` creates the parent `.claude/` dir as needed.
    atomic_fs::atomic_write(&local_settings_path(project), raw.as_bytes(), None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn seed(path: &Path, value: &Value) {
        atomic_fs::atomic_write(path, value.to_string().as_bytes(), None).unwrap();
    }

    #[test]
    fn list_projects_reads_keys_names_and_local_settings_flag() {
        let dir = tempfile::tempdir().unwrap();
        let claude_json = dir.path().join(".claude.json");

        // Two project roots; give the first a settings.local.json on disk.
        let proj_a = dir.path().join("code/api-gateway");
        let proj_b = dir.path().join("code/marketing-site");
        std::fs::create_dir_all(proj_a.join(".claude")).unwrap();
        std::fs::write(
            local_settings_path(&proj_a),
            r#"{"permissions":{"allow":[]}}"#,
        )
        .unwrap();

        let mut projects = serde_json::Map::new();
        projects.insert(
            proj_a.to_string_lossy().into_owned(),
            json!({ "lastActivity": 1700000000000i64 }),
        );
        projects.insert(
            proj_b.to_string_lossy().into_owned(),
            json!({ "history": [] }),
        );
        seed(
            &claude_json,
            &json!({
                "oauthAccount": { "emailAddress": "me@example.test" },
                "projects": Value::Object(projects)
            }),
        );

        let list = list_projects_at(&claude_json).unwrap();
        assert_eq!(list.len(), 2);

        // Sorted by path: api-gateway before marketing-site.
        assert_eq!(list[0].name, "api-gateway");
        assert!(list[0].has_local_settings, "proj_a has settings.local.json");
        assert_eq!(list[0].last_activity, Some(1700000000000));

        assert_eq!(list[1].name, "marketing-site");
        assert!(!list[1].has_local_settings, "proj_b has none");
        assert_eq!(list[1].last_activity, None);
    }

    #[test]
    fn list_projects_absent_file_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let list = list_projects_at(&dir.path().join("nope.json")).unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn list_projects_malformed_json_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let claude_json = dir.path().join(".claude.json");
        atomic_fs::atomic_write(&claude_json, b"{ not json at all", None).unwrap();

        let list = list_projects_at(&claude_json).unwrap();
        assert!(list.is_empty(), "malformed ~/.claude.json -> empty list");
    }

    #[test]
    fn list_projects_missing_projects_key_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let claude_json = dir.path().join(".claude.json");
        seed(&claude_json, &json!({ "oauthAccount": { "x": 1 } }));

        let list = list_projects_at(&claude_json).unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn read_project_settings_absent_is_empty_object() {
        let dir = tempfile::tempdir().unwrap();
        let settings = read_project_settings_at(dir.path()).unwrap();
        assert_eq!(settings.raw, "{}");
        assert_eq!(settings.path, dir.path().to_string_lossy());
    }

    #[test]
    fn write_then_read_settings_round_trips_and_creates_claude_dir() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path();
        assert!(!project.join(".claude").exists(), "precondition: no .claude/");

        let raw = "{\n  \"permissions\": {\n    \"allow\": [\"Bash(pnpm test:*)\"]\n  }\n}";
        write_project_settings_at(project, raw).unwrap();

        assert!(
            local_settings_path(project).exists(),
            "write must create .claude/settings.local.json"
        );
        // Raw text preserved verbatim (formatting round-trips).
        let settings = read_project_settings_at(project).unwrap();
        assert_eq!(settings.raw, raw);
    }

    #[test]
    fn write_settings_rejects_invalid_json_and_writes_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path();

        let err = write_project_settings_at(project, "{ not: valid }").unwrap_err();
        match err {
            CoreError::InvalidInput(_) => {}
            other => panic!("expected InvalidInput, got {other:?}"),
        }
        assert!(
            !local_settings_path(project).exists(),
            "invalid JSON must not create or write the file"
        );
    }
}
