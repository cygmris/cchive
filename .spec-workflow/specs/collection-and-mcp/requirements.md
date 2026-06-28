# Requirements Document — collection-and-mcp (S8)

## Introduction

S8 builds the **shared collection component** (the Card / Table / Master‑detail view used by MCP, Agents, Commands, and Skills) and the first consumer, the **MCP manager**. The collection provides a reusable header (title, description, search, view‑mode toggle, "Add X") and three synchronized view modes. The MCP manager reads and writes the real MCP server definitions — global servers in `~/.claude.json` `mcpServers` and project servers in `.mcp.json` — supporting add / edit / remove, an enable/disable toggle (implemented safely via a Clavis‑managed disabled stash so toggling off never loses a definition), and a read‑only `.mcp.json`/config preview. It wires the enabled‑MCP count into the status bar. All writes are atomic and preserve unknown keys.

## Alignment with Product Vision

Realizes `product.md` Feature 4 (MCP servers manager) and design checklist items **45–51** (the unified collection + MCP). The collection is the reusable engine for S9 (Agents/Commands/Skills), so getting it right here pays off four screens. It honors safe writes (atomic, preserve keys) and machine‑truth (verbatim command/url/json preview).

## Requirements

### Requirement 1 — Shared collection component

**User Story:** As a user, I want MCP/Agents/Commands/Skills to look and behave consistently, so I learn one interface.

#### Acceptance Criteria
1. A reusable `Collection` SHALL render: a header (title + description + a "Search…" input + a view‑mode toggle [Card / Table / Master‑detail] + a primary "Add X" button) and a body in the selected view mode, driven by a generic item shape + per‑collection column/field config.
2. **Card view** SHALL show a grid of cards (icon + name + optional toggle + description + footer meta + tag), dimming disabled items.
3. **Table view** SHALL show columns (Name | Description | (type/model/source column) | (tools/lines column) | optional toggle), uppercase mono header.
4. **Master‑detail** SHALL show a selectable left list + a right detail pane (icon, name, tag, optional toggle, description, a properties table, and a read‑only file/config preview).
5. The search SHALL filter items by name/description; the view‑mode choice MAY persist (UI pref). The component SHALL be generic enough for items with or without a toggle and with different tag/meta columns.

### Requirement 2 — Read MCP servers (global + project)

**User Story:** As a user, I want to see all my MCP servers, so I can manage them in one place.

#### Acceptance Criteria
1. The backend SHALL read global MCP servers from `~/.claude.json` `mcpServers` (each: `type` stdio/http/sse, `command`+`args`+`env` for stdio, `url` for http/sse), returning a normalized list with a derived `scope: "user"`.
2. The backend SHALL also read project MCP servers from a given project's `.mcp.json` (`mcpServers`) with `scope: "project"` (project listing may be added when Projects lands; S8 focuses on global + the read shape for project).
3. Each server's enabled state SHALL be derived: a global server present in `~/.claude.json` is enabled; one held only in the Clavis disabled stash is disabled (Req 4).
4. The MCP screen SHALL show the real servers via the collection (Card/Table/Master‑detail), with a tools/type badge and a read‑only JSON preview of the server's definition.

### Requirement 3 — Add / edit / remove MCP servers

**User Story:** As a user, I want to add, edit, and remove MCP servers without hand‑editing JSON.

#### Acceptance Criteria
1. WHEN adding a server THEN the user SHALL provide name + type (stdio/http/sse) + the type‑specific fields (command/args/env or url + headers), and the backend SHALL write it into `~/.claude.json` `mcpServers` atomically, preserving all other keys.
2. WHEN editing THEN the same form SHALL prefill and update the server in place; WHEN removing THEN the server SHALL be deleted from `~/.claude.json` (after confirm).
3. Writes SHALL validate (name required/unique, valid command or URL) before persisting and SHALL never corrupt `~/.claude.json` (atomic + preserve keys).

### Requirement 4 — Enable/disable toggle (safe)

**User Story:** As a user, I want to toggle a server off without losing its config, so I can re‑enable it later.

#### Acceptance Criteria
1. WHEN a server is toggled **off** THEN its definition SHALL be moved from `~/.claude.json` `mcpServers` into a Clavis‑managed disabled stash (store), so Claude Code stops loading it but the definition is preserved.
2. WHEN toggled **on** THEN the definition SHALL be restored from the stash back into `~/.claude.json` `mcpServers`.
3. The toggle SHALL update the enabled‑MCP count surfaced in the status bar.
4. Toggling SHALL be atomic and reversible; a server can never be lost by toggling.

### Requirement 5 — MCP screen + count wiring

**User Story:** As a user, I want the MCP screen from the design and an accurate count, so the chrome reflects reality.

#### Acceptance Criteria
1. The MCP screen SHALL use the collection with title/description per the design, an "Add server" primary, the three view modes, and the per‑server toggle (Req 4) + `.mcp.json` preview.
2. The enabled count SHALL feed the status bar (replacing the placeholder) and be available for the Overview tile later, via the queries layer.
3. Off‑Tauri (gallery) SHALL show a labelled demo set so the collection renders.

## Non-Functional Requirements

### Code Architecture and Modularity
- Backend: `core/mcp.rs` (read/normalize/add/edit/remove/toggle over `~/.claude.json` + the disabled stash) reusing `atomic_fs`/`claude_json`; `commands/mcp.rs`; DTOs in `model.rs`. Frontend: a generic `src/screens/_collection/Collection.tsx` (+ Card/Table/Detail subviews), the MCP screen under `src/screens/mcp/`, and `useMcpServers`/mutations in `queries.ts`.
- The collection SHALL be generic (no MCP‑specific logic) so S9 reuses it unchanged.

### Performance
- Reading/writing `~/.claude.json` is a single parse/mutate/atomic‑write; the screen stays responsive.

### Security
- MCP server `env` may contain secrets the user typed; Clavis writes them to `~/.claude.json` as Claude Code expects (that file already holds them) but does not surface them in plaintext beyond the edit form. No credential files are touched. `mcpOAuth` tokens are never affected.

### Reliability
- Atomic writes + preserve unknown keys in `~/.claude.json`; toggle uses the stash so no definition is lost; malformed/missing `mcpServers` degrades to an empty list, not a crash.

### Usability
- Mono for commands/urls/json; verbatim previews; sentence case; destructive remove confirms; the three views stay in sync with the same data + search.
