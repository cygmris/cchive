# Tasks Document — collection-and-mcp (S8)

> Generic Collection (Card/Table/Master-detail) + MCP manager over ~/.claude.json mcpServers. Safe writes (atomic, preserve keys); toggle uses a disabled stash so a definition is never lost. Never touch mcpOAuth or credential files. The Collection is domain-agnostic so S9 reuses it. Tokens-only styling, no hardcoded hex. Identity app.clavis, no predecessor fingerprints. Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. MCP backend (core/mcp.rs + model + commands) + Rust tests
  - Files: `src-tauri/src/core/mcp.rs` (new), `src-tauri/src/core/mod.rs` (modify), `src-tauri/src/model.rs` (modify), `src-tauri/src/commands/mcp.rs` (new), `src-tauri/src/commands/mod.rs` (modify), `src-tauri/src/lib.rs` (modify)
  - Purpose: read/normalize/add/edit/remove/toggle MCP servers safely
  - _Leverage: src-tauri/src/core/(claude_json,atomic_fs).rs, research/modern-impl.md §2.2_
  - _Requirements: 2.1, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.4_
  - _Prompt: Implement the task for spec collection-and-mcp, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Rust engineer | Task: Add McpServer (name, transport stdio/http/sse, command?, args?, env?, url?, scope user/project, enabled, tools_hint?) + McpServerInput to model.rs. Create core/mcp.rs reading global mcpServers from ~/.claude.json (normalize stdio command/args/env + http/sse url; type defaults stdio), plus a Clavis disabled stash (a providers.json-style clavis-managed mcp_disabled.json in the config dir via atomic_fs, OR reuse the store path): list() merges enabled(from json)+disabled(from stash); upsert(input) writes into ~/.claude.json mcpServers preserving all other keys (via claude_json/atomic_fs write_json_preserving); remove(name); set_enabled(name,on) moves the definition between mcpServers and the stash atomically (write stash first then remove from json on disable; add to json then clear stash on enable); enabled_count(). Declare in core/mod.rs. commands/mcp.rs: list_mcp_servers, save_mcp_server(input), delete_mcp_server(name), set_mcp_enabled(name,on) -> Result(_, CoreError); declare in commands/mod.rs; register in lib.rs. Rust tests (temp fixture): list normalizes stdio+http; upsert preserves other ~/.claude.json keys; remove; set_enabled(false) stashes+removes (definition preserved), set_enabled(true) restores; enabled_count; malformed mcpServers -> empty. | Restrictions: never touch mcpOAuth/credentials; atomic + preserve keys; toggle never loses a definition. | Success: cargo test (mcp green) + cargo build clean._

- [x] 2. IPC + types + useMcpServers + count wiring
  - Files: `src/lib/ipc.ts` (modify), `src/lib/types.ts` (modify), `src/lib/queries.ts` (modify)
  - Purpose: typed MCP hooks + status-bar count
  - _Leverage: src/lib/ipc.ts, model.rs DTOs_
  - _Requirements: 5.2, 2.1, 4.3_
  - _Prompt: Implement the task for spec collection-and-mcp, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React data engineer | Task: Mirror McpServer + McpServerInput in types.ts; add listMcpServers/saveMcpServer/deleteMcpServer/setMcpEnabled to ipc.ts; add useMcpServers() + useSaveMcpServer/useDeleteMcpServer/useToggleMcpServer to queries.ts (invalidate mcp). Hydrate the store mcpEnabledCount (count of enabled) via setActiveIdentity so the status bar shows the real MCP count. Off-Tauri labelled demo set. | Restrictions: components use hooks not invoke; demo fallback. | Success: tsc clean; status bar MCP count reflects enabled servers under Tauri._

- [x] 3. Generic Collection component (Card/Table/Master-detail)
  - Files: `src/screens/_collection/Collection.tsx`, `src/screens/_collection/CardView.tsx`, `src/screens/_collection/TableView.tsx`, `src/screens/_collection/DetailView.tsx`, `src/screens/_collection/types.ts`
  - Purpose: the reusable, domain-agnostic collection used by MCP + (later) agents/commands/skills
  - _Leverage: @/ui (Card, Switch, Badge, Input, SegmentedControl, IconButton), research/design-inventory.md §6 (collection)_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - _Prompt: Implement the task for spec collection-and-mcp, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Build a generic Collection(T) in src/screens/_collection/: types.ts defines CollectionConfig(T) (icon/name/description/tag?/meta?/toggle?(item)->(on,onChange)/columns(label+render)/detail(item)->(props[], preview)) + addLabel. Collection.tsx renders the shared header (title, description, a "Search…" Input bound to query, a SegmentedControl view toggle Card/Table/Detail (icon-only), a primary "Add X" Button) + the selected view, filtering items by name/description. CardView: 2-col grid of cards (icon, name, optional Switch top-right, description, footer meta + tag), dim disabled. TableView: columns from config (uppercase mono header) + optional trailing toggle. DetailView: selectable left list + right pane (icon, name, tag, optional toggle, description, properties table, read-only mono preview). All token-only, keyboard accessible. | Restrictions: NO domain (MCP/agents) logic inside; generic over T; tokens only. | Success: Collection renders all 3 views from a generic config + search/view toggle work; ready for S9 reuse._

- [x] 4. MCP screen + server form
  - Files: `src/screens/mcp/index.tsx`, `src/screens/mcp/McpServerForm.tsx`
  - Purpose: the MCP manager screen using the collection
  - _Leverage: src/screens/_collection/Collection.tsx, src/lib/queries.ts (useMcpServers), @/ui (Modal, Input, Select), research/design-inventory.md §6_
  - _Requirements: 2.4, 3.1, 3.2, 4.1, 4.2, 5.1, 5.3_
  - _Prompt: Implement the task for spec collection-and-mcp, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Replace the mcp placeholder (src/screens/mcp/index.tsx) with the MCP manager: build a CollectionConfig(McpServer) (icon by transport, type Badge, tools_hint meta, toggle -> useToggleMcpServer, detail properties Type/Tools/Scope/Status + a read-only JSON preview of the server definition) and render Collection with title "MCP" + the design one-liner + "Add server" primary (opens McpServerForm). McpServerForm (Modal): name + transport Select (stdio/http/sse) + conditional fields (command + args + env for stdio; url for http/sse) -> useSaveMcpServer; edit prefills; remove via the detail/row action -> confirm -> useDeleteMcpServer. Uses useMcpServers(). | Restrictions: mono for command/url/json; validate name unique + command-or-url present; tokens only; secret env not displayed back beyond the form. | Success: MCP screen lists real servers in all 3 views, add/edit/remove/toggle work, count updates._

- [x] 5. Tests (collection + MCP)
  - Files: `src/screens/_collection/Collection.test.tsx`, `src/screens/mcp/Mcp.test.tsx`, `src/lib/queries.test.ts` (modify)
  - Purpose: lock the generic collection + MCP behavior
  - _Leverage: Vitest + Testing Library, mocked ipc_
  - _Requirements: 1.1, 1.5, 2.4, 4.1_
  - _Prompt: Implement the task for spec collection-and-mcp, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend QA engineer | Task: Collection.test.tsx: renders Card/Table/Detail from a generic config; view toggle switches; search filters; toggle invokes the callback; renders fine without a toggle column. Mcp.test.tsx (ipc mocked): lists servers; Add opens the form and calls saveMcpServer; toggle calls setMcpEnabled; remove confirms then calls deleteMcpServer. Extend queries.test.ts for useMcpServers. | Restrictions: behavior not implementation; headless; mock backend. | Success: pnpm test green incl. new suites._

- [x] 6. Verify, fingerprint audit
  - Files: (verify) whole repo
  - Purpose: prove S8 builds, tests pass, no fingerprints, no credential touch
  - _Leverage: tech.md de-fingerprint rules_
  - _Requirements: all_
  - _Prompt: Implement the task for spec collection-and-mcp, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Release engineer | Task: Run pnpm exec tsc --noEmit (0), pnpm test (green), cd src-tauri && cargo test (mcp green) + cargo build (clean), pnpm exec vite build (clean). Fingerprint grep over src + src-tauri/src + configs -> zero. Assert core/mcp never reads/writes .credentials.json or mcpOAuth (grep). Report exact pass/fail. (The orchestrator launches the window, screenshots the MCP screen with the real servers, and commits.) | Restrictions: fix don't suppress; do not commit. | Success: all gates green and reported; zero fingerprints; mcpOAuth/credentials untouched._
