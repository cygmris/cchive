# Requirements Document — memory-and-projects (S10)

## Introduction

S10 builds two screens. **Memory** edits the Claude Code memory files — the global `~/.claude/CLAUDE.md` and (optionally) a selected project's `CLAUDE.md` — in a full‑height inline markdown editor with Save and ⌘S autosave. **Projects** discovers the folders you've run Claude Code in (from `~/.claude.json` `projects`) and presents a master‑detail view where you can edit each project's `.claude/settings.local.json` (per‑project permissions / env / enabled MCP servers) with validation and Save. Both reuse a shared inline CodeMirror editor (markdown for memory, JSON for project settings). All writes are atomic and preserve structure.

## Alignment with Product Vision

Realizes `product.md` Features 7–8 (memory editor + projects view) and design checklist items **56–58** (Memory) and **41–44** (Projects). It rounds out the per‑surface editors so Clavis covers global memory and per‑project configuration, honoring safe writes and machine‑truth (verbatim paths/JSON).

## Requirements

### Requirement 1 — Memory editor (global + project)

**User Story:** As a user, I want to edit my `CLAUDE.md` comfortably, so I can curate Claude's memory without a terminal.

#### Acceptance Criteria
1. The Memory screen SHALL show the mono path subtitle `~/.claude/CLAUDE.md` and a full‑height inline markdown editor (CodeMirror, `lang-markdown`) seeded with the file's content.
2. WHEN Save is used (or ⌘S) THEN the content SHALL be written atomically to `~/.claude/CLAUDE.md`; ⌘S SHALL autosave (debounced or on keystroke per the design's "Auto‑saves on ⌘S").
3. The screen SHALL allow switching the editor target between the global memory and a project's `CLAUDE.md` (the project chosen from the Projects list / a selector); the active path subtitle SHALL update accordingly.
4. A missing `CLAUDE.md` SHALL open as empty and be created on first Save; the editor SHALL never lose unsaved content silently (warn on switching with unsaved changes).

### Requirement 2 — Projects discovery

**User Story:** As a user, I want to see every folder I've used Claude Code in, so I can manage per‑project config.

#### Acceptance Criteria
1. The backend SHALL list projects from `~/.claude.json` `projects` (the keys are project paths), returning for each: the path, a display name (last path segment), whether `.claude/settings.local.json` exists, and a recent‑activity hint if available.
2. The Projects screen SHALL render a master‑detail layout: a left list (name + mono path, selectable) and a right detail pane for the selected project.
3. Missing/empty `projects` SHALL yield an empty list + an empty state, never a crash.

### Requirement 3 — Per‑project settings editor

**User Story:** As a user, I want to edit a project's local settings, so I can set per‑project permissions and overrides.

#### Acceptance Criteria
1. WHEN a project is selected THEN its `.claude/settings.local.json` SHALL be shown in a JSON editor (CodeMirror `lang-json`) with the file header path (mono) and a Save button.
2. The editor SHALL validate JSON before Save; invalid JSON SHALL block Save with an inline error.
3. WHEN Save is used THEN the file SHALL be written atomically (creating `.claude/` + the file if absent), preserving structure; the design's sample keys (`permissions.allow/deny`, `enabledMcpjsonServers`, `env`) SHALL round‑trip.
4. The detail pane MAY also offer a quick link to edit that project's `CLAUDE.md` in the Memory screen.

### Requirement 4 — Shared inline editor

**User Story:** As a developer, I want one inline editor used by both screens, so behavior is consistent.

#### Acceptance Criteria
1. A reusable inline `CodeEditor` (CodeMirror) SHALL accept a `language` (markdown | json), a value, and onChange/onSave, themed to the Clavis tokens (light/dark), used by Memory (markdown) and Projects (json). (The existing modal `MarkdownEditor` from S9 may be refactored to wrap it, or they may coexist.)
2. ⌘S SHALL trigger onSave in the editor; the editor SHALL be mono and full‑height within its container.

## Non-Functional Requirements

### Code Architecture and Modularity
- Backend: extend `core/resources.rs` or a small `core/memory.rs` + `core/projects.rs` for `read_memory/write_memory(path?)`, `list_projects`, `read_project_settings/write_project_settings(path)`; commands; DTOs in `model.rs` (reuse `claude_json` to read `~/.claude.json` `projects`). Frontend: `src/ui/CodeEditor.tsx` (inline), `src/screens/memory/`, `src/screens/projects/`, hooks in `queries.ts`.

### Performance
- Editing is local/instant; saves are single atomic writes; the projects list reads `~/.claude.json` once.

### Security
- Only `CLAUDE.md`, `~/.claude.json` (read `projects`), and per‑project `.claude/settings.local.json` are touched; no credential files, no `mcpOAuth`. Project settings may contain user env the user typed; not surfaced beyond the editor.

### Reliability
- Atomic writes; JSON validated before write; missing files created on Save; unsaved‑changes warning on target switch; malformed `~/.claude.json` `projects` → empty list.

### Usability
- Mono for paths/JSON/markdown; full‑height editors; ⌘S autosave hint matching the design; honest path subtitles; destructive/lossy actions warn.
