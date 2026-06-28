//! Reader/writer for the Claude Code memory files (`CLAUDE.md`).
//!
//! A scope resolves to exactly one `CLAUDE.md`: `Global` → `~/.claude/CLAUDE.md`
//! (the per-machine user memory), `Project(path)` → `<path>/CLAUDE.md`. Reads
//! return the verbatim markdown (or `""` when absent); writes go through
//! `atomic_fs::atomic_write` (create-if-absent, never truncate-in-place). Plain
//! markdown only — this module never touches `.credentials.json`, `~/.claude.json`,
//! or any `mcpOAuth` data.
#![allow(dead_code)] // callers (commands) wire these up alongside this task

use std::path::{Path, PathBuf};

use super::{atomic_fs, paths};
use crate::model::{CoreError, MemoryDoc, MemoryScope};

/// Resolve the `CLAUDE.md` path for a scope.
fn scope_path(scope: &MemoryScope) -> PathBuf {
    match scope {
        MemoryScope::Global => paths::claude_md(),
        MemoryScope::Project(project) => Path::new(project).join("CLAUDE.md"),
    }
}

/// Read the `CLAUDE.md` for `scope` → `{ path, content }` (`content` empty when
/// the file does not exist).
pub fn read_memory(scope: &MemoryScope) -> Result<MemoryDoc, CoreError> {
    read_memory_at(&scope_path(scope))
}

/// Atomically write `content` to the `CLAUDE.md` for `scope` (creating the file
/// when absent).
pub fn write_memory(scope: &MemoryScope, content: &str) -> Result<(), CoreError> {
    atomic_fs::atomic_write(&scope_path(scope), content.as_bytes(), None)
}

/// Path-parameterized read (for tests + explicit paths).
fn read_memory_at(path: &Path) -> Result<MemoryDoc, CoreError> {
    let content = if path.exists() {
        std::fs::read_to_string(path).map_err(CoreError::from)?
    } else {
        String::new()
    };
    Ok(MemoryDoc {
        path: path.display().to_string(),
        content,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn global_scope_resolves_to_user_claude_md() {
        assert_eq!(scope_path(&MemoryScope::Global), paths::claude_md());
    }

    #[test]
    fn project_scope_resolves_under_project_root() {
        let scope = MemoryScope::Project("/home/x/proj".to_string());
        assert_eq!(scope_path(&scope), Path::new("/home/x/proj/CLAUDE.md"));
    }

    #[test]
    fn read_absent_memory_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let scope = MemoryScope::Project(dir.path().to_string_lossy().into_owned());

        let doc = read_memory(&scope).unwrap();
        assert_eq!(doc.content, "");
        assert!(doc.path.ends_with("CLAUDE.md"));
    }

    #[test]
    fn write_then_read_round_trips_and_creates() {
        let dir = tempfile::tempdir().unwrap();
        let scope = MemoryScope::Project(dir.path().to_string_lossy().into_owned());
        let target = dir.path().join("CLAUDE.md");

        assert!(!target.exists(), "precondition: no CLAUDE.md yet");
        write_memory(&scope, "# Memory\n\n- be concise\n").unwrap();
        assert!(target.exists(), "write must create the file");

        let doc = read_memory(&scope).unwrap();
        assert_eq!(doc.content, "# Memory\n\n- be concise\n");

        // A second write overwrites in place (round-trip).
        write_memory(&scope, "updated").unwrap();
        assert_eq!(read_memory(&scope).unwrap().content, "updated");
    }
}
