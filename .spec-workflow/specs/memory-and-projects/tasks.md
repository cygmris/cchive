# Tasks Document — memory-and-projects (S10)

> Memory (CLAUDE.md editor) + Projects (discover + per-project settings.local.json editor) over a shared inline CodeEditor. Atomic writes; JSON validated before save. Only CLAUDE.md, ~/.claude.json (read projects), and project .claude/settings.local.json are touched — never credentials/mcpOAuth. Tokens-only styling. Identity app.clavis, no predecessor fingerprints. Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. Memory + Projects backend (core + commands) + Rust tests
  - Files: `src-tauri/src/core/memory.rs` (new), `src-tauri/src/core/projects.rs` (new), `src-tauri/src/core/mod.rs` (modify), `src-tauri/src/model.rs` (modify), `src-tauri/src/commands/memory.rs` (new), `src-tauri/src/commands/projects.rs` (new), `src-tauri/src/commands/mod.rs` (modify), `src-tauri/src/lib.rs` (modify)
  - Purpose: read/write memory + list projects + read/write per-project settings
  - _Leverage: src-tauri/src/core/(paths,atomic_fs,claude_json).rs, research/modern-impl.md §2.4, §2.5_
  - _Requirements: 1.2, 2.1, 3.1, 3.2, 3.3_
  - _Prompt: Implement the task for spec memory-and-projects, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Rust engineer | Task: Add MemoryDoc (path, content), Project (path, name, has_local_settings, last_activity?), ProjectSettings (path, raw) to model.rs. core/memory.rs: read_memory(scope) where scope = Global | Project(path) -> resolves ~/.claude/CLAUDE.md or PROJECT/CLAUDE.md, returns (path, content) (empty if absent); write_memory(scope, content) atomic write (create if absent). core/projects.rs: list_projects() from ~/.claude.json projects keys (via claude_json) -> (path, name=last segment, has_local_settings = PROJECT/.claude/settings.local.json exists, last_activity? if available); read_project_settings(path) -> (path, raw of .claude/settings.local.json, "()" if absent); write_project_settings(path, raw) validate JSON (reject invalid) then atomic write creating .claude/. Declare in core/mod.rs. commands/memory.rs + commands/projects.rs: read_memory/write_memory/list_projects/read_project_settings/write_project_settings -> Result(_, CoreError); declare + register in lib.rs. Rust tests (temp fixture): read/write_memory round-trip + create-if-absent; list_projects from a seeded ~/.claude.json; read/write_project_settings round-trip + reject bad JSON + create .claude/; malformed projects -> empty. | Restrictions: only CLAUDE.md/~/.claude.json(read)/settings.local.json touched; atomic; validate JSON. | Success: cargo test (memory+projects green) + cargo build clean._

- [x] 2. IPC + types + queries
  - Files: `src/lib/ipc.ts` (modify), `src/lib/types.ts` (modify), `src/lib/queries.ts` (modify)
  - Purpose: typed memory/projects hooks
  - _Leverage: src/lib/ipc.ts, model.rs DTOs_
  - _Requirements: 1.1, 2.2, 3.1_
  - _Prompt: Implement the task for spec memory-and-projects, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React data engineer | Task: Mirror MemoryDoc/Project/ProjectSettings + a MemoryScope type (Global | a project path) in types.ts; add readMemory/writeMemory/listProjects/readProjectSettings/writeProjectSettings to ipc.ts; add useMemory(scope)/useSaveMemory + useProjects()/useProjectSettings(path)/useSaveProjectSettings to queries.ts (invalidate the right keys). Off-Tauri labelled demo content (a sample CLAUDE.md + 2-3 demo projects + sample settings.local.json). | Restrictions: components use hooks not invoke; demo fallback. | Success: tsc clean; hooks typed._

- [x] 3. Shared inline CodeEditor + refactor MarkdownEditor
  - Files: `src/ui/CodeEditor.tsx` (new), `src/ui/MarkdownEditor.tsx` (modify), `package.json` (modify)
  - Purpose: one inline CodeMirror editor (markdown|json) used everywhere
  - _Leverage: @uiw/react-codemirror, @codemirror/lang-markdown, @codemirror/lang-json, @/theme_
  - _Requirements: 4.1, 4.2_
  - _Prompt: Implement the task for spec memory-and-projects, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: pnpm add @codemirror/lang-json. Build src/ui/CodeEditor.tsx: an inline (non-modal) CodeMirror editor with props language ("markdown"|"json"), value, onChange, onSave (Mod-s keymap), themed to the Clavis tokens (light/dark from useTheme), full-height mono, lineWrapping for markdown. Refactor src/ui/MarkdownEditor.tsx (S9 modal) to host a CodeEditor language="markdown" inside the Modal (keep its title/value/onSave/onCancel API). | Restrictions: tokens only; mono; reuse not duplicate CodeMirror setup. | Success: CodeEditor renders md + json; ⌘S calls onSave; MarkdownEditor still works for the collection screens._

- [x] 4. Memory + Projects screens
  - Files: `src/screens/memory/index.tsx`, `src/screens/projects/index.tsx`
  - Purpose: the two real screens
  - _Leverage: src/ui/CodeEditor.tsx, src/lib/queries.ts, @/ui (Card, Button, IconButton, Select), src/lib/store.ts (go), research/design-inventory.md §10, §5_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_
  - _Prompt: Implement the task for spec memory-and-projects, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Memory (src/screens/memory/index.tsx): header "Memory" + mono path subtitle (the active CLAUDE.md path) + a scope selector (Global / a project from useProjects) + a full-height inline markdown CodeEditor seeded from useMemory(scope); Save Button + ⌘S -> useSaveMemory; "Auto-saves on ⌘S" hint; warn on scope switch with unsaved changes. Projects (src/screens/projects/index.tsx): master-detail — left list from useProjects() (name + mono path, selectable, active wash) + right pane = file header ".claude/settings.local.json" + Save + a JSON CodeEditor seeded from useProjectSettings(path), validate JSON before Save -> useSaveProjectSettings (inline error on invalid), + an "Edit CLAUDE.md" link (setEditingMemoryProject + go('memory')); empty state when no projects. | Restrictions: mono for paths/json/markdown; full-height editors; atomic save; tokens only. | Success: Memory edits real CLAUDE.md with ⌘S; Projects lists real projects + edits settings.local.json with validation._

- [x] 5. Tests (frontend)
  - Files: `src/screens/memory/Memory.test.tsx`, `src/screens/projects/Projects.test.tsx`, `src/lib/queries.test.ts` (modify)
  - Purpose: lock the screens + hooks
  - _Leverage: Vitest + Testing Library, mocked ipc + CodeMirror_
  - _Requirements: 1.2, 3.1, 3.2_
  - _Prompt: Implement the task for spec memory-and-projects, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend QA engineer | Task: Memory.test.tsx (ipc + CodeEditor mocked): renders the path + editor from a mocked useMemory; Save calls saveMemory. Projects.test.tsx: lists projects; selecting one loads useProjectSettings; invalid JSON blocks Save; valid Save calls saveProjectSettings. Extend queries.test.ts for useMemory/useProjects. | Restrictions: behavior not implementation; headless; mock backend + CodeMirror. | Success: pnpm test green incl. new suites._

- [x] 6. Verify, fingerprint + safety audit
  - Files: (verify) whole repo
  - Purpose: prove S10 builds, tests pass, no fingerprints, no credential touch
  - _Leverage: tech.md de-fingerprint rules_
  - _Requirements: all_
  - _Prompt: Implement the task for spec memory-and-projects, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Release engineer | Task: Run pnpm exec tsc --noEmit (0), pnpm test (green), cd src-tauri && cargo test (memory+projects green) + cargo build (clean), pnpm exec vite build (clean). Fingerprint grep over src + src-tauri/src + configs -> zero. Assert core/memory.rs + core/projects.rs only touch CLAUDE.md/~/.claude.json/settings.local.json (no .credentials.json/mcpOAuth). Report exact pass/fail. (The orchestrator launches the window, screenshots Memory/Projects with real data, commits.) | Restrictions: fix don't suppress; do not commit. | Success: all gates green and reported; zero fingerprints; safety holds._
