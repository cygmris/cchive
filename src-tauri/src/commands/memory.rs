//! Memory commands: read/write a `CLAUDE.md` for a scope (global or a project).
//!
//! These touch ONLY `~/.claude/CLAUDE.md` or `<project>/CLAUDE.md` — plain
//! markdown. `.credentials.json`, `~/.claude.json`, and any `mcpOAuth` data are
//! never read or written here.

use crate::core::memory;
use crate::model::{CoreError, MemoryDoc, MemoryScope};

/// Read the `CLAUDE.md` for `scope` → `{ path, content }` (`content` empty when
/// the file is absent). On-disk effect: reads one `CLAUDE.md`; writes nothing.
#[tauri::command]
pub fn read_memory(scope: MemoryScope) -> Result<MemoryDoc, CoreError> {
    memory::read_memory(&scope)
}

/// Atomically write `content` to the `CLAUDE.md` for `scope` (create if absent).
#[tauri::command]
pub fn write_memory(scope: MemoryScope, content: String) -> Result<(), CoreError> {
    memory::write_memory(&scope, &content)
}
