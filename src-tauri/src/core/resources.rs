//! The cchive markdown-resource manager — list/get/save/delete the three
//! resource families (agents, commands, skills) under `~/.claude/{agents,
//! commands,skills}`, plus a safe skill enable/disable that MOVES a skill's
//! folder between `skills/<name>/` and a cchive-managed disabled stash.
//!
//! A resource is a `.md` file (agents/commands) or a folder with a `SKILL.md`
//! (skills). Frontmatter (`---` fenced YAML) is parsed tolerantly: a missing or
//! unterminated fence means the whole file is body. Every write is atomic
//! (`atomic_fs`), and a skill toggle never deletes the folder — it is moved, so
//! a crash leaves it in exactly one place (recoverable in both).
//!
//! This module ONLY touches `agents/`, `commands/`, `skills/`, and the skill
//! stash. It NEVER reads or writes `.credentials.json`, `~/.claude.json`, or any
//! `mcpOAuth` data.

use std::collections::BTreeMap;
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use super::atomic_fs;
use crate::model::{CoreError, Resource, ResourceDetail, ResourceKind};

/// Skills are always user-level here (we only read `~/.claude/skills` + stash).
const SKILL_SOURCE: &str = "Personal";

// ---------------------------------------------------------------------------
// Public API (path-injectable: commands pass real paths, tests pass temps).
//   `base`  = the agents/commands/skills dir for `kind`.
//   `stash` = the cchive disabled-skills dir (only consulted for skills).
// ---------------------------------------------------------------------------

/// List every resource of `kind`. Agents/commands read `*.md` in `base`; skills
/// read each `*/SKILL.md` in `base` (enabled) plus the stash (disabled). A
/// missing directory yields an empty list (never a crash). Sorted by name.
pub fn list(kind: ResourceKind, base: &Path, stash: &Path) -> Result<Vec<Resource>, CoreError> {
    match kind {
        ResourceKind::Agent | ResourceKind::Command => list_files(kind, base),
        ResourceKind::Skill => list_skills(base, stash),
    }
}

/// Read one resource's raw `.md` + parsed meta. For skills the file is found in
/// `base` (enabled) or, failing that, the stash (disabled).
pub fn get(
    kind: ResourceKind,
    base: &Path,
    stash: &Path,
    name: &str,
) -> Result<ResourceDetail, CoreError> {
    let stem = safe_stem(name)?;
    let (path, enabled, source) = match kind {
        ResourceKind::Skill => {
            let active = base.join(&stem).join("SKILL.md");
            if active.is_file() {
                (active, Some(true), Some(SKILL_SOURCE.to_string()))
            } else {
                (
                    stash.join(&stem).join("SKILL.md"),
                    Some(false),
                    Some(SKILL_SOURCE.to_string()),
                )
            }
        }
        _ => (resource_path(kind, base, &stem), None, None),
    };
    let raw = fs::read_to_string(&path)
        .map_err(|_| CoreError::NotFound(path.display().to_string()))?;
    let resource = build_resource(kind, &stem, &raw, &path, enabled, source);
    Ok(ResourceDetail { resource, raw })
}

/// Atomically write `raw` to the resource's path: `base/<name>.md` for
/// agents/commands, `base/<name>/SKILL.md` for skills (parent dirs created).
pub fn save(kind: ResourceKind, base: &Path, name: &str, raw: &str) -> Result<(), CoreError> {
    let stem = safe_stem(name)?;
    let path = resource_path(kind, base, &stem);
    atomic_fs::atomic_write(&path, raw.as_bytes(), None)
}

/// Delete a resource: the `.md` file for agents/commands, the whole folder for
/// skills (from both `base` and the stash, so a disabled skill is removed too).
/// Idempotent: a missing target is not an error.
pub fn delete(
    kind: ResourceKind,
    base: &Path,
    stash: &Path,
    name: &str,
) -> Result<(), CoreError> {
    let stem = safe_stem(name)?;
    match kind {
        ResourceKind::Skill => {
            let active = base.join(&stem);
            if active.exists() {
                fs::remove_dir_all(&active)?;
            }
            let parked = stash.join(&stem);
            if parked.exists() {
                fs::remove_dir_all(&parked)?;
            }
        }
        _ => {
            let path = resource_path(kind, base, &stem);
            if path.exists() {
                fs::remove_file(&path)?;
            }
        }
    }
    Ok(())
}

/// Enable/disable a skill by MOVING its folder between `skills/<name>/` and the
/// disabled stash — the folder (and every file in it) is never deleted.
///
/// `rename` is atomic on one filesystem; a cross-device move falls back to a
/// recursive copy THEN remove of the source, so a crash leaves the folder in
/// both places (recoverable), never in neither. Idempotent: enabling an
/// already-enabled skill (or disabling an already-disabled one) is a no-op.
pub fn set_skill_enabled(
    skills_dir: &Path,
    stash: &Path,
    name: &str,
    on: bool,
) -> Result<(), CoreError> {
    let stem = safe_stem(name)?;
    let active = skills_dir.join(&stem);
    let parked = stash.join(&stem);
    if on {
        // Already enabled, or nothing parked to restore.
        if active.exists() || !parked.exists() {
            return Ok(());
        }
        move_dir(&parked, &active)?;
    } else {
        // Already disabled, or nothing live to stash.
        if parked.exists() || !active.exists() {
            return Ok(());
        }
        move_dir(&active, &parked)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Listing helpers.
// ---------------------------------------------------------------------------

/// List `*.md` files in `base` as agent/command resources (missing dir → empty).
fn list_files(kind: ResourceKind, base: &Path) -> Result<Vec<Resource>, CoreError> {
    let mut out = Vec::new();
    let rd = match fs::read_dir(base) {
        Ok(r) => r,
        Err(_) => return Ok(out),
    };
    for entry in rd.flatten() {
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };
        let raw = fs::read_to_string(&path).unwrap_or_default();
        out.push(build_resource(kind, &stem, &raw, &path, None, None));
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// List skills: each `*/SKILL.md` in `base` (enabled) then the stash (disabled).
/// A name found live is not re-reported from the stash. Missing dir → skipped.
fn list_skills(base: &Path, stash: &Path) -> Result<Vec<Resource>, CoreError> {
    let mut out = Vec::new();
    let mut seen = BTreeSet::new();
    for (dir, enabled) in [(base, true), (stash, false)] {
        let rd = match fs::read_dir(dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            let folder = entry.path();
            if !folder.is_dir() {
                continue;
            }
            let skill_md = folder.join("SKILL.md");
            if !skill_md.is_file() {
                continue;
            }
            let stem = match folder.file_name().and_then(|n| n.to_str()) {
                Some(s) if !s.is_empty() => s.to_string(),
                _ => continue,
            };
            if !seen.insert(stem.clone()) {
                continue;
            }
            let raw = fs::read_to_string(&skill_md).unwrap_or_default();
            out.push(build_resource(
                ResourceKind::Skill,
                &stem,
                &raw,
                &skill_md,
                Some(enabled),
                Some(SKILL_SOURCE.to_string()),
            ));
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// The on-disk path for a resource of `kind` with the cleaned file stem `stem`.
fn resource_path(kind: ResourceKind, base: &Path, stem: &str) -> PathBuf {
    match kind {
        ResourceKind::Agent | ResourceKind::Command => base.join(format!("{stem}.md")),
        ResourceKind::Skill => base.join(stem).join("SKILL.md"),
    }
}

/// Reject names that would escape the base dir; strip a leading `/` (commands
/// carry one in their display name).
fn safe_stem(name: &str) -> Result<String, CoreError> {
    let cleaned = name.trim().trim_start_matches('/').trim();
    if cleaned.is_empty()
        || cleaned.contains('/')
        || cleaned.contains('\\')
        || cleaned.contains("..")
    {
        return Err(CoreError::InvalidInput(format!(
            "invalid resource name: {name:?}"
        )));
    }
    Ok(cleaned.to_string())
}

// ---------------------------------------------------------------------------
// Resource construction from raw `.md`.
// ---------------------------------------------------------------------------

/// Build a `Resource` from raw `.md`: split frontmatter, parse the keys this
/// `kind` cares about, derive the name and body line count.
fn build_resource(
    kind: ResourceKind,
    stem: &str,
    raw: &str,
    path: &Path,
    enabled: Option<bool>,
    source: Option<String>,
) -> Resource {
    let (frontmatter, body) = split_frontmatter(raw);
    let fields = frontmatter
        .as_deref()
        .map(parse_frontmatter)
        .unwrap_or_default();

    let name = match kind {
        ResourceKind::Agent => fields
            .get("name")
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| stem.to_string()),
        ResourceKind::Command => format!("/{stem}"),
        ResourceKind::Skill => stem.to_string(),
    };

    let description = fields
        .get("description")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let model = match kind {
        ResourceKind::Agent => fields.get("model").and_then(|m| model_badge(m)),
        _ => None,
    };
    let tools = match kind {
        ResourceKind::Agent => fields
            .get("tools")
            .map(|t| normalize_tools(t))
            .filter(|s| !s.is_empty()),
        _ => None,
    };
    let args_hint = match kind {
        ResourceKind::Command => fields
            .get("argument-hint")
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        _ => None,
    };

    Resource {
        kind,
        name,
        description,
        body_lines: body_line_count(&body) as u32,
        model,
        source,
        enabled,
        path: path.display().to_string(),
        args_hint,
        tools,
    }
}

/// Split a `---`-fenced YAML frontmatter from the body. Tolerant: if the first
/// line is not exactly `---`, or there is no closing `---`, the whole file is
/// treated as body and the frontmatter is `None`.
fn split_frontmatter(raw: &str) -> (Option<String>, String) {
    let lines: Vec<&str> = raw.lines().collect();
    if lines.first().map(|l| l.trim()) != Some("---") {
        return (None, raw.to_string());
    }
    for (i, line) in lines.iter().enumerate().skip(1) {
        if line.trim() == "---" {
            let frontmatter = lines[1..i].join("\n");
            let body = lines[(i + 1)..].join("\n");
            return (Some(frontmatter), body);
        }
    }
    // Unterminated fence → malformed → treat the whole file as body.
    (None, raw.to_string())
}

/// Number of body lines, trimming surrounding blank lines (0 for an empty body).
fn body_line_count(body: &str) -> usize {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        0
    } else {
        trimmed.lines().count()
    }
}

/// A tolerant top-level-key extractor for the small set of scalar/list fields we
/// surface. Handles inline scalars (`key: value`), quoted scalars, block scalars
/// (`key: |` / `key: >` + indented lines, joined with spaces), and block lists
/// (`key:` + `  - item` lines, joined with `, `).
fn parse_frontmatter(frontmatter: &str) -> BTreeMap<String, String> {
    let lines: Vec<&str> = frontmatter.lines().collect();
    let mut map = BTreeMap::new();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        // Skip blank lines and any stray continuation lines.
        if line.trim().is_empty() || line.starts_with(char::is_whitespace) {
            i += 1;
            continue;
        }
        let colon = match line.find(':') {
            Some(c) => c,
            None => {
                i += 1;
                continue;
            }
        };
        let key = line[..colon].trim().to_string();
        let rest = line[colon + 1..].trim();
        let is_block = rest.is_empty() || rest == "|" || rest == ">" || rest.starts_with(['|', '>']);
        if is_block {
            // Gather the indented continuation block.
            let mut items: Vec<String> = Vec::new();
            let mut is_list = false;
            let mut j = i + 1;
            while j < lines.len() {
                let cont = lines[j];
                if cont.trim().is_empty() {
                    j += 1;
                    continue;
                }
                if !cont.starts_with(char::is_whitespace) {
                    break; // back to column 0 → next key
                }
                let t = cont.trim();
                if let Some(item) = t.strip_prefix("- ") {
                    is_list = true;
                    items.push(unquote(item.trim()));
                } else {
                    items.push(t.to_string());
                }
                j += 1;
            }
            let value = if is_list {
                items
                    .into_iter()
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<_>>()
                    .join(", ")
            } else {
                items
                    .iter()
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ")
            };
            map.insert(key, value);
            i = j;
        } else {
            map.insert(key, unquote(rest));
            i += 1;
        }
    }
    map
}

/// Strip matching surrounding quotes and unescape the few sequences that matter.
fn unquote(s: &str) -> String {
    let s = s.trim();
    let bytes = s.as_bytes();
    if bytes.len() >= 2 {
        let (first, last) = (bytes[0], bytes[bytes.len() - 1]);
        if first == b'"' && last == b'"' {
            return s[1..s.len() - 1].replace("\\\"", "\"").replace("\\\\", "\\");
        }
        if first == b'\'' && last == b'\'' {
            return s[1..s.len() - 1].replace("''", "'");
        }
    }
    s.to_string()
}

/// Normalize an agent `tools` value (inline `Read, Edit`, flow list
/// `[Read, Edit]`, or an already-joined block list) to a comma-joined string.
fn normalize_tools(raw: &str) -> String {
    let inner = raw.trim();
    let inner = inner
        .strip_prefix('[')
        .and_then(|x| x.strip_suffix(']'))
        .unwrap_or(inner);
    inner
        .split(',')
        .map(|t| unquote(t.trim()))
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
}

/// Map an agent `model` value to its badge keyword, or pass through a raw id.
fn model_badge(raw: &str) -> Option<String> {
    let lowered = raw.to_lowercase();
    if lowered.trim().is_empty() {
        None
    } else if lowered.contains("opus") {
        Some("opus".to_string())
    } else if lowered.contains("haiku") {
        Some("haiku".to_string())
    } else if lowered.contains("sonnet") {
        Some("sonnet".to_string())
    } else {
        Some(raw.trim().to_string())
    }
}

// ---------------------------------------------------------------------------
// Directory move (rename, with a cross-device copy+remove fallback).
// ---------------------------------------------------------------------------

/// Move `from` → `to`, preserving every file. Tries an atomic `rename`; on
/// failure (e.g. cross-device) copies the tree then removes the source.
fn move_dir(from: &Path, to: &Path) -> Result<(), CoreError> {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent)?;
    }
    if fs::rename(from, to).is_ok() {
        return Ok(());
    }
    copy_dir_all(from, to)?;
    fs::remove_dir_all(from)?;
    Ok(())
}

/// Recursively copy a directory tree.
fn copy_dir_all(from: &Path, to: &Path) -> Result<(), CoreError> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let src = entry.path();
        let dst = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&src, &dst)?;
        } else {
            fs::copy(&src, &dst)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture {
        _tmp: tempfile::TempDir,
        agents: PathBuf,
        commands: PathBuf,
        skills: PathBuf,
        stash: PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            let tmp = tempfile::tempdir().unwrap();
            let root = tmp.path();
            Fixture {
                agents: root.join("agents"),
                commands: root.join("commands"),
                skills: root.join("skills"),
                stash: root.join("disabled-skills"),
                _tmp: tmp,
            }
        }
    }

    fn write(path: &Path, contents: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }

    fn temp_leftovers(dir: &Path) -> Vec<String> {
        fs::read_dir(dir)
            .map(|rd| {
                rd.flatten()
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .filter(|n| n.contains(".cchive.tmp."))
                    .collect()
            })
            .unwrap_or_default()
    }

    #[test]
    fn list_agents_parses_frontmatter_model_tools_and_lines() {
        let fx = Fixture::new();
        write(
            &fx.agents.join("code-reviewer.md"),
            "---\nname: code-reviewer\ndescription: Reviews code\nmodel: sonnet\ntools: Read, Edit, Bash\n---\n\nYou are a focused reviewer.\nLine two.\nLine three.\n",
        );
        // Block-scalar description, full model id, and a flow-list tools value.
        write(
            &fx.agents.join("security-auditor.md"),
            "---\nname: security-auditor\ndescription: |\n  Audits code for vulnerabilities.\n  Flags risky patterns.\nmodel: claude-opus-4-1\ntools: [Read, Grep]\n---\nOne body line.\n",
        );

        let list = list(ResourceKind::Agent, &fx.agents, &fx.stash).unwrap();
        assert_eq!(list.len(), 2);
        // Sorted by name.
        let cr = &list[0];
        assert_eq!(cr.name, "code-reviewer");
        assert_eq!(cr.description.as_deref(), Some("Reviews code"));
        assert_eq!(cr.model.as_deref(), Some("sonnet"));
        assert_eq!(cr.tools.as_deref(), Some("Read, Edit, Bash"));
        assert_eq!(cr.body_lines, 3);
        assert!(cr.enabled.is_none() && cr.source.is_none() && cr.args_hint.is_none());

        let sa = &list[1];
        assert_eq!(sa.name, "security-auditor");
        assert_eq!(
            sa.description.as_deref(),
            Some("Audits code for vulnerabilities. Flags risky patterns.")
        );
        assert_eq!(sa.model.as_deref(), Some("opus"), "full model id → badge");
        assert_eq!(sa.tools.as_deref(), Some("Read, Grep"), "flow list normalized");
        assert_eq!(sa.body_lines, 1);
    }

    #[test]
    fn list_commands_uses_leading_slash_and_argument_hint() {
        let fx = Fixture::new();
        write(
            &fx.commands.join("review-pr.md"),
            "---\ndescription: Review a pull request\nargument-hint: [pr-number]\n---\nTarget: $ARGUMENTS\n",
        );

        let list = list(ResourceKind::Command, &fx.commands, &fx.stash).unwrap();
        assert_eq!(list.len(), 1);
        let c = &list[0];
        assert_eq!(c.name, "/review-pr", "command names carry a leading slash");
        assert_eq!(c.description.as_deref(), Some("Review a pull request"));
        assert_eq!(c.args_hint.as_deref(), Some("[pr-number]"));
        assert_eq!(c.body_lines, 1);
        assert!(c.model.is_none() && c.tools.is_none() && c.enabled.is_none());
    }

    #[test]
    fn list_skills_derives_source_and_enabled() {
        let fx = Fixture::new();
        write(
            &fx.skills.join("pdf-forms").join("SKILL.md"),
            "---\nname: pdf-forms\ndescription: Fill PDFs\n---\nUse this skill to fill PDFs.\n",
        );
        // A disabled skill lives in the stash.
        write(
            &fx.stash.join("slack-digest").join("SKILL.md"),
            "---\nname: slack-digest\ndescription: Summarize Slack\n---\nUse this skill to digest Slack.\n",
        );

        let list = list(ResourceKind::Skill, &fx.skills, &fx.stash).unwrap();
        assert_eq!(list.len(), 2);
        let pdf = &list[0];
        assert_eq!(pdf.name, "pdf-forms");
        assert_eq!(pdf.description.as_deref(), Some("Fill PDFs"));
        assert_eq!(pdf.source.as_deref(), Some("Personal"));
        assert_eq!(pdf.enabled, Some(true));
        let slack = &list[1];
        assert_eq!(slack.name, "slack-digest");
        assert_eq!(slack.enabled, Some(false), "stash → disabled");
    }

    #[test]
    fn get_returns_raw_plus_meta() {
        let fx = Fixture::new();
        let raw = "---\nname: code-reviewer\ndescription: Reviews code\nmodel: sonnet\n---\nBody.\n";
        write(&fx.agents.join("code-reviewer.md"), raw);

        let detail = get(ResourceKind::Agent, &fx.agents, &fx.stash, "code-reviewer").unwrap();
        assert_eq!(detail.raw, raw);
        assert_eq!(detail.resource.model.as_deref(), Some("sonnet"));

        // A disabled skill is fetched from the stash.
        write(
            &fx.stash.join("web-research").join("SKILL.md"),
            "---\nname: web-research\ndescription: Research\n---\nBody.\n",
        );
        let skill = get(ResourceKind::Skill, &fx.skills, &fx.stash, "web-research").unwrap();
        assert_eq!(skill.resource.enabled, Some(false));
    }

    #[test]
    fn save_writes_to_the_right_path_atomically() {
        let fx = Fixture::new();

        // Agent: base/<name>.md.
        save(ResourceKind::Agent, &fx.agents, "new-agent", "---\nname: new-agent\n---\nBody.\n").unwrap();
        let agent_path = fx.agents.join("new-agent.md");
        assert!(agent_path.is_file());
        assert!(temp_leftovers(&fx.agents).is_empty(), "no temp leftover");

        // Command: a leading slash in the name is stripped to the file stem.
        save(ResourceKind::Command, &fx.commands, "/with-slash", "Body.\n").unwrap();
        assert!(fx.commands.join("with-slash.md").is_file());

        // Skill: base/<name>/SKILL.md.
        save(ResourceKind::Skill, &fx.skills, "my-skill", "---\nname: my-skill\n---\nBody.\n").unwrap();
        let skill_path = fx.skills.join("my-skill").join("SKILL.md");
        assert!(skill_path.is_file());
        assert!(temp_leftovers(&fx.skills.join("my-skill")).is_empty());
    }

    #[test]
    fn delete_removes_file_and_skill_folder() {
        let fx = Fixture::new();
        write(&fx.agents.join("gone.md"), "Body.\n");
        delete(ResourceKind::Agent, &fx.agents, &fx.stash, "gone").unwrap();
        assert!(!fx.agents.join("gone.md").exists());
        // Idempotent.
        delete(ResourceKind::Agent, &fx.agents, &fx.stash, "gone").unwrap();

        write(&fx.skills.join("doomed").join("SKILL.md"), "Body.\n");
        write(&fx.skills.join("doomed").join("ref.md"), "Helper.\n");
        delete(ResourceKind::Skill, &fx.skills, &fx.stash, "doomed").unwrap();
        assert!(!fx.skills.join("doomed").exists(), "skill folder removed");
    }

    #[test]
    fn set_skill_enabled_stashes_then_restores_preserving_files() {
        let fx = Fixture::new();
        write(
            &fx.skills.join("web-research").join("SKILL.md"),
            "---\nname: web-research\ndescription: Research\n---\nBody.\n",
        );
        // An auxiliary file must survive the move.
        write(&fx.skills.join("web-research").join("reference.md"), "Aux.\n");

        // Disable → moved to the stash, files preserved, live copy gone.
        set_skill_enabled(&fx.skills, &fx.stash, "web-research", false).unwrap();
        assert!(!fx.skills.join("web-research").exists(), "live copy gone");
        assert!(fx.stash.join("web-research").join("SKILL.md").is_file());
        assert!(
            fx.stash.join("web-research").join("reference.md").is_file(),
            "aux file preserved through the move"
        );

        // list() now reports it disabled.
        let disabled = list(ResourceKind::Skill, &fx.skills, &fx.stash)
            .unwrap()
            .into_iter()
            .find(|s| s.name == "web-research")
            .unwrap();
        assert_eq!(disabled.enabled, Some(false));

        // Enable → restored to the live dir, stash entry gone, files intact.
        set_skill_enabled(&fx.skills, &fx.stash, "web-research", true).unwrap();
        assert!(fx.skills.join("web-research").join("SKILL.md").is_file());
        assert!(fx.skills.join("web-research").join("reference.md").is_file());
        assert!(!fx.stash.join("web-research").exists(), "stash entry cleared");

        // Idempotent re-enable is a no-op.
        set_skill_enabled(&fx.skills, &fx.stash, "web-research", true).unwrap();
        assert!(fx.skills.join("web-research").join("SKILL.md").is_file());
    }

    #[test]
    fn malformed_or_absent_frontmatter_is_body_only() {
        let fx = Fixture::new();
        // No frontmatter at all → whole file is body, name from filename.
        write(&fx.agents.join("plain.md"), "Just a body.\nSecond line.\n");
        // Opening fence with no closing → malformed → whole file is body.
        write(
            &fx.agents.join("half.md"),
            "---\nname: half\ndescription: missing close\nThis is the body text.\n",
        );

        let list = list(ResourceKind::Agent, &fx.agents, &fx.stash).unwrap();
        let plain = list.iter().find(|r| r.name == "plain").unwrap();
        assert!(plain.description.is_none());
        assert_eq!(plain.body_lines, 2);

        // Frontmatter never closed → no parsed fields, name falls back to stem.
        let half = list.iter().find(|r| r.name == "half").unwrap();
        assert!(half.description.is_none(), "unterminated fence → no fields");
        assert_eq!(half.model, None);
        assert_eq!(half.body_lines, 4, "the whole file counts as body");
    }

    #[test]
    fn missing_directory_lists_empty() {
        let fx = Fixture::new();
        assert!(list(ResourceKind::Agent, &fx.agents, &fx.stash).unwrap().is_empty());
        assert!(list(ResourceKind::Command, &fx.commands, &fx.stash).unwrap().is_empty());
        assert!(list(ResourceKind::Skill, &fx.skills, &fx.stash).unwrap().is_empty());
    }
}
