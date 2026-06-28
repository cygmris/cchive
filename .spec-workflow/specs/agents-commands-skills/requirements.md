# Requirements Document — agents-commands-skills (S9)

## Introduction

S9 builds three screens — **Agents**, **Commands**, and **Skills** — by reusing the S8 generic `Collection`. It adds a Rust backend that lists and edits the markdown files Claude Code loads: sub‑agents (`~/.claude/agents/*.md`), slash commands (`~/.claude/commands/*.md`), and Agent Skills (`~/.claude/skills/*/SKILL.md`), each with YAML frontmatter + a markdown body. It supports list / view / add / edit (via a CodeMirror markdown editor) / delete for all three, a model badge for agents, a source badge for skills, and a **skill enable/disable** toggle implemented safely (move the skill folder to a Clavis stash and back — never deleting). The Skills enabled count feeds the status bar. All writes are atomic.

## Alignment with Product Vision

Realizes `product.md` Features 5–6 (sub‑agents + slash commands managers) and the Skills manager, and design checklist items **52–55** (the three collection screens). It completes the four collection consumers (MCP from S8 + these three) and produces the Skills count the Overview needs. Honors safe writes and machine‑truth (verbatim markdown).

## Requirements

### Requirement 1 — Read/parse the markdown resources

**User Story:** As a user, I want to see my agents, commands, and skills, so I can manage them in one place.

#### Acceptance Criteria
1. The backend SHALL list `~/.claude/agents/*.md` parsing frontmatter (`name`, `description`, `model`, `tools`, `color`) + body; deriving a line count and a `model` badge value (sonnet/opus/haiku).
2. The backend SHALL list `~/.claude/commands/*.md` parsing frontmatter (`description`, `argument-hint`, `allowed-tools`) + body; names render with a leading `/`; line count.
3. The backend SHALL list `~/.claude/skills/*/SKILL.md` parsing frontmatter (`name`, `description`) + body; deriving a `source` (Personal=user dir, Project=project dir, Plugin=plugin dir) and an `enabled` flag (Req 4).
4. Missing dirs/files SHALL yield empty lists, never a crash; malformed frontmatter SHALL degrade gracefully (treat the whole file as body).

### Requirement 2 — Three screens via the shared Collection

**User Story:** As a user, I want consistent screens, so they behave like MCP.

#### Acceptance Criteria
1. **Agents** SHALL render via `Collection` (title/desc per design, "Add agent"): model badge tag, line meta, **no toggle**; master‑detail props Model/Tools/Path + a read‑only body preview of the `.md`.
2. **Commands** SHALL render via `Collection` ("Add command"): leading `/` names, **no tag, no toggle**, line meta; master‑detail props Argument‑hint/Path + body preview.
3. **Skills** SHALL render via `Collection` ("Add skill"): source badge tag, **a toggle**, master‑detail props Source/Path/Status + `SKILL.md` body preview.
4. All three SHALL support the Card/Table/Master‑detail views + search from the shared `Collection` unchanged.

### Requirement 3 — Add / edit / delete (markdown editor)

**User Story:** As a user, I want to edit these files comfortably, so I don't hand‑edit in a terminal.

#### Acceptance Criteria
1. The edit/add action SHALL open a **markdown editor** (CodeMirror 6, `lang-markdown`) on the raw `.md` (frontmatter + body), with Save (atomic write to the correct path) and Cancel.
2. Add SHALL create a new file at the right location (`agents/<name>.md`, `commands/<name>.md`, `skills/<name>/SKILL.md`) from a name + a starter template; edit SHALL load + save in place; delete SHALL confirm then remove the file (skills: remove the skill folder) — all atomic, preserving the rest of the file on save.
3. Name validation SHALL ensure a filesystem‑safe, unique name; saving SHALL never corrupt or truncate.

### Requirement 4 — Skill enable/disable (safe) + count

**User Story:** As a user, I want to disable a skill without deleting it, so I can re‑enable later.

#### Acceptance Criteria
1. WHEN a skill is toggled **off** THEN its folder SHALL be moved to a Clavis stash location (e.g. `<clavis-config>/disabled-skills/<name>/`) so Claude Code stops loading it but the files are preserved; toggled **on** SHALL move it back to `~/.claude/skills/<name>/`.
2. The Skills `enabled` flag SHALL reflect presence in `~/.claude/skills` vs the stash; the enabled count SHALL feed the status bar (replacing the placeholder) and be available to Overview.
3. Toggling SHALL be atomic and reversible; a skill can never be lost by toggling.

## Non-Functional Requirements

### Code Architecture and Modularity
- Backend: `core/resources.rs` (a shared markdown‑resource reader/writer for agents/commands/skills with frontmatter parse) reusing `atomic_fs`/`paths`; `commands/resources.rs`; DTOs in `model.rs`. Frontend: `src/screens/{agents,commands,skills}/` each building a `CollectionConfig` + a shared `MarkdownEditor` modal under `@/ui` (or `src/ui/MarkdownEditor.tsx`) using CodeMirror; hooks in `queries.ts`.
- Reuse the S8 `Collection` unchanged; the markdown editor is shared across the three.

### Performance
- Listing reads small `.md` files; editing loads one file; saves are single atomic writes.

### Security
- Only `~/.claude/{agents,commands,skills}` (+ the Clavis skill stash) are touched; no credential files, no `mcpOAuth`. These files are plain markdown the user authored.

### Reliability
- Atomic writes; skill toggle uses the stash so nothing is lost; missing dirs → empty lists; malformed frontmatter handled. Delete confirms.

### Usability
- Markdown shown verbatim in mono editor; leading `/` for commands; model/source badges colored per design (sonnet=clay/opus=violet/haiku=green; Personal=clay/Project=blue/Plugin=violet); destructive delete confirms.
