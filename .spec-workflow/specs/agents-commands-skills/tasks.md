# Tasks Document — agents-commands-skills (S9)

> Agents/Commands/Skills over ~/.claude/(agents,commands,skills), reusing the S8 generic Collection + a shared CodeMirror MarkdownEditor. Atomic writes; skill toggle moves the folder to a Clavis stash (never delete). Only ~/.claude/(agents,commands,skills) + the stash are touched — never credentials/mcpOAuth. Tokens-only styling. Identity app.clavis, no predecessor fingerprints. Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. Resources backend (core/resources.rs + model + commands) + Rust tests
  - Files: `src-tauri/src/core/resources.rs` (new), `src-tauri/src/core/mod.rs` (modify), `src-tauri/src/model.rs` (modify), `src-tauri/src/commands/resources.rs` (new), `src-tauri/src/commands/mod.rs` (modify), `src-tauri/src/lib.rs` (modify)
  - Purpose: list/get/save/delete the markdown resources + safe skill toggle
  - _Leverage: src-tauri/src/core/(paths,atomic_fs).rs, research/modern-impl.md §2.3, §2.4_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3_
  - _Prompt: Implement the task for spec agents-commands-skills, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Rust engineer | Task: Add ResourceKind (Agent/Command/Skill), Resource (kind,name,description,body_lines,model?,source?,enabled?,path,args_hint?,tools?) + ResourceDetail (Resource + raw) to model.rs. Create core/resources.rs with a tolerant frontmatter splitter (--- fences; absence -> whole file is body): list(kind) reads the dir (agents/commands *.md; skills */SKILL.md) parsing frontmatter (agents: name/description/model/tools; commands: description/argument-hint; skills: name/description), deriving body_lines, model badge (sonnet/opus/haiku), command leading-slash name, skill source (Personal/Project/Plugin) + enabled (present in ~/.claude/skills vs the Clavis disabled-skills stash); get(kind,name)->ResourceDetail (raw + meta); save(kind,name,raw) atomic write to the right path (skills -> skills/(name)/SKILL.md); delete(kind,name) (file; skill -> remove folder); set_skill_enabled(name,on) moves the folder ~/.claude/skills/(name) ↔ (clavis-config)/disabled-skills/(name). Declare in core/mod.rs. commands/resources.rs: list_resources(kind)/get_resource(kind,name)/save_resource(kind,name,raw)/delete_resource(kind,name)/set_skill_enabled(name,on) -> Result(_, CoreError); declare + register in lib.rs. Rust tests (temp fixture): parse agent/command/skill frontmatter + line count; save writes the right path atomically; delete; set_skill_enabled(false) stashes (files preserved) + (true) restores; malformed frontmatter -> body only; missing dir -> empty. | Restrictions: only touch agents/commands/skills + stash; atomic; never lose a skill on toggle. | Success: cargo test (resources green) + cargo build clean._

- [x] 2. IPC + types + useResources + skills count
  - Files: `src/lib/ipc.ts` (modify), `src/lib/types.ts` (modify), `src/lib/queries.ts` (modify)
  - Purpose: typed resource hooks + skills count
  - _Leverage: src/lib/ipc.ts, model.rs DTOs_
  - _Requirements: 4.2_
  - _Prompt: Implement the task for spec agents-commands-skills, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React data engineer | Task: Mirror Resource + ResourceDetail + ResourceKind in types.ts; add listResources/getResource/saveResource/deleteResource/setSkillEnabled to ipc.ts; add useResources(kind) + useSaveResource/useDeleteResource/useSkillEnabled to queries.ts (invalidate resources:kind). The skills hook hydrates store skillsEnabledCount via setActiveIdentity so the status bar shows the real Skills count. Off-Tauri labelled demo sets per kind. | Restrictions: components use hooks not invoke; demo fallback. | Success: tsc clean; status bar Skills count reflects enabled skills under Tauri._

- [x] 3. Shared MarkdownEditor (CodeMirror)
  - Files: `src/ui/MarkdownEditor.tsx`, `package.json` (modify)
  - Purpose: the shared raw-.md editor modal
  - _Leverage: @uiw/react-codemirror, @codemirror/lang-markdown, @/ui/Modal, @/theme_
  - _Requirements: 3.1_
  - _Prompt: Implement the task for spec agents-commands-skills, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: pnpm add @uiw/react-codemirror @codemirror/lang-markdown @codemirror/view @codemirror/state. Build src/ui/MarkdownEditor.tsx: a @/ui/Modal hosting react-codemirror with the markdown() extension + a theme matching the Clavis tokens (light/dark from useTheme), full-height mono editor, props title/value/onSave/onCancel, Save + Cancel buttons. | Restrictions: tokens only; mono; no secret handling. | Success: editor renders + edits markdown; Save returns the text._

- [x] 4. Agents + Commands + Skills screens
  - Files: `src/screens/agents/index.tsx`, `src/screens/commands/index.tsx`, `src/screens/skills/index.tsx`
  - Purpose: the three collection screens
  - _Leverage: src/screens/_collection/Collection.tsx, src/ui/MarkdownEditor.tsx, src/lib/queries.ts (useResources), research/design-inventory.md §7-§9_
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.2, 4.1_
  - _Prompt: Implement the task for spec agents-commands-skills, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Replace the three placeholders. Agents (src/screens/agents/index.tsx): CollectionConfig(Resource) with model Badge tag (sonnet=clay/opus=violet/haiku=green), line meta, NO toggle, detail Model/Tools/Path + body preview; title/desc per design §7; "Add agent". Commands (src/screens/commands/index.tsx): leading "/" name, NO tag/toggle, line meta, detail Argument-hint/Path + body preview; "Add command". Skills (src/screens/skills/index.tsx): source Badge tag (Personal=clay/Project=blue/Plugin=violet), toggle -> useSkillEnabled, detail Source/Path/Status + SKILL.md preview; "Add skill". Each: useResources(kind); "Add X" + row/detail edit open MarkdownEditor (loads via getResource for edit, a starter template for add) -> useSaveResource; delete confirms -> useDeleteResource. | Restrictions: reuse Collection unchanged; mono markdown; tokens only; validate name on add. | Success: all three screens list real resources in all 3 views, edit/add via the markdown editor, skills toggle works, count updates._

- [x] 5. Tests (frontend)
  - Files: `src/screens/skills/Skills.test.tsx`, `src/screens/agents/Agents.test.tsx`, `src/lib/queries.test.ts` (modify)
  - Purpose: lock the screens + hooks
  - _Leverage: Vitest + Testing Library, mocked ipc_
  - _Requirements: 2.1, 2.3, 3.2, 4.1_
  - _Prompt: Implement the task for spec agents-commands-skills, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend QA engineer | Task: Agents.test.tsx: lists agents from a mocked useResources with model badges; edit opens MarkdownEditor and Save calls saveResource. Skills.test.tsx: lists skills with source badges + toggle; toggle calls setSkillEnabled; delete confirms then calls deleteResource. Extend queries.test.ts for useResources(kind). | Restrictions: behavior not implementation; headless; mock backend (mock CodeMirror if needed). | Success: pnpm test green incl. new suites._

- [x] 6. Verify, fingerprint + safety audit
  - Files: (verify) whole repo
  - Purpose: prove S9 builds, tests pass, no fingerprints, no credential touch
  - _Leverage: tech.md de-fingerprint rules_
  - _Requirements: all_
  - _Prompt: Implement the task for spec agents-commands-skills, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Release engineer | Task: Run pnpm exec tsc --noEmit (0), pnpm test (green), cd src-tauri && cargo test (resources green) + cargo build (clean), pnpm exec vite build (clean). Fingerprint grep over src + src-tauri/src + configs -> zero. Assert core/resources.rs only touches agents/commands/skills + the stash (no credentials/mcpOAuth). Report exact pass/fail. (The orchestrator launches the window, screenshots a screen with real data, commits.) | Restrictions: fix don't suppress; do not commit. | Success: all gates green and reported; zero fingerprints; safety holds._
