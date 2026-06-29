//! Resource commands: list/get/save/delete the markdown resources (agents,
//! commands, skills) + a safe skill enable/disable toggle.
//!
//! These touch ONLY `~/.claude/{agents,commands,skills}` and the cchive
//! disabled-skills stash under the app config dir. `.credentials.json`,
//! `~/.claude.json`, and any `mcpOAuth` data are never read or written here.

use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};

use crate::core::{paths, resources};
use crate::model::{CoreError, Resource, ResourceDetail, ResourceKind};

/// The cchive-managed stash for disabled skills, under the app config dir.
const DISABLED_SKILLS_STASH: &str = "disabled-skills";

/// The `~/.claude` directory backing a resource kind.
fn base_dir(kind: ResourceKind) -> PathBuf {
    match kind {
        ResourceKind::Agent => paths::agents_dir(),
        ResourceKind::Command => paths::commands_dir(),
        ResourceKind::Skill => paths::skills_dir(),
    }
}

/// Resolve the disabled-skills stash path under the app config dir.
fn stash_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, CoreError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| CoreError::Io(e.to_string()))?;
    Ok(dir.join(DISABLED_SKILLS_STASH))
}

/// List resources of `kind`. On-disk effect: reads the kind's dir (+ the stash
/// for skills); writes nothing.
#[tauri::command]
pub fn list_resources<R: Runtime>(
    app: AppHandle<R>,
    kind: ResourceKind,
) -> Result<Vec<Resource>, CoreError> {
    resources::list(kind, &base_dir(kind), &stash_dir(&app)?)
}

/// Read one resource's raw `.md` + parsed meta (for the editor).
#[tauri::command]
pub fn get_resource<R: Runtime>(
    app: AppHandle<R>,
    kind: ResourceKind,
    name: String,
) -> Result<ResourceDetail, CoreError> {
    resources::get(kind, &base_dir(kind), &stash_dir(&app)?, &name)
}

/// Atomically write a resource's `.md` to its path (skills → `<name>/SKILL.md`).
#[tauri::command]
pub fn save_resource(kind: ResourceKind, name: String, raw: String) -> Result<(), CoreError> {
    resources::save(kind, &base_dir(kind), &name, &raw)
}

/// Delete a resource (the `.md` file, or the whole skill folder). Idempotent.
#[tauri::command]
pub fn delete_resource<R: Runtime>(
    app: AppHandle<R>,
    kind: ResourceKind,
    name: String,
) -> Result<(), CoreError> {
    resources::delete(kind, &base_dir(kind), &stash_dir(&app)?, &name)
}

/// Enable/disable a skill by MOVING its folder between `skills/<name>/` and the
/// stash (never deleted). On-disk effect: a single atomic folder move.
#[tauri::command]
pub fn set_skill_enabled<R: Runtime>(
    app: AppHandle<R>,
    name: String,
    on: bool,
) -> Result<(), CoreError> {
    resources::set_skill_enabled(&paths::skills_dir(), &stash_dir(&app)?, &name, on)
}
