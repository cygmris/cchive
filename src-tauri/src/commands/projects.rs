//! Project commands: list projects + read/write a project's local settings.
//!
//! These read ONLY the `projects` map of `~/.claude.json` and read/write ONLY
//! `<project>/.claude/settings.local.json`. `.credentials.json`, `oauthAccount`,
//! and any `mcpOAuth` data are never read or written here.

use crate::core::projects;
use crate::model::{CoreError, Project, ProjectSettings};

/// List the projects discovered in `~/.claude.json` `projects` (empty when the
/// file is absent or malformed). On-disk effect: reads `~/.claude.json` + probes
/// each `<project>/.claude/settings.local.json` for existence; writes nothing.
#[tauri::command]
pub fn list_projects() -> Result<Vec<Project>, CoreError> {
    projects::list_projects()
}

/// Read a project's `.claude/settings.local.json` raw text (`"{}"` if absent).
#[tauri::command]
pub fn read_project_settings(path: String) -> Result<ProjectSettings, CoreError> {
    projects::read_project_settings(&path)
}

/// Validate `raw` is JSON, then atomically write it to the project's
/// `.claude/settings.local.json` (creating `.claude/`). Rejects invalid JSON.
#[tauri::command]
pub fn write_project_settings(path: String, raw: String) -> Result<(), CoreError> {
    projects::write_project_settings(&path, &raw)
}
