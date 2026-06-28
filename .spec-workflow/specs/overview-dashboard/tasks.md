# Tasks Document — overview-dashboard (S11)

> The real Overview — composes existing hooks (accounts/MCP/skills/usage) + a tiny new activity log. Activity messages carry labels only (never tokens). Only the Clavis activity.json is added; no credential access. Tokens-only styling. Identity app.clavis, no predecessor fingerprints. Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. Activity log backend (core/activity.rs + model + commands) + Rust tests
  - Files: `src-tauri/src/core/activity.rs` (new), `src-tauri/src/core/mod.rs` (modify), `src-tauri/src/model.rs` (modify), `src-tauri/src/commands/activity.rs` (new), `src-tauri/src/commands/mod.rs` (modify), `src-tauri/src/lib.rs` (modify)
  - Purpose: a capped, atomic recent-activity log
  - _Leverage: src-tauri/src/core/atomic_fs.rs_
  - _Requirements: 4.1, 4.2_
  - _Prompt: Implement the task for spec overview-dashboard, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Rust engineer | Task: Add ActivityEntry (kind, message, timestamp) to model.rs. Create core/activity.rs: append(config_dir, kind, message) pushes (kind, message, timestamp_ms via std::time) to a capped (keep last 50) JSON array in CONFIG_DIR/activity.json (read existing, prepend/append, truncate, atomic_fs::atomic_write); read(config_dir, limit) returns newest-first up to limit; corrupt/missing file -> empty (never panic). Declare in core/mod.rs. commands/activity.rs: append_activity(kind, message) + read_activity(limit) -> Result(_, CoreError) (config dir via app_config_dir); declare in commands/mod.rs; register in lib.rs. Rust tests (temp dir): append caps at 50; read(limit) newest-first; corrupt/missing -> empty; atomic. | Restrictions: messages are labels only (no secrets); only activity.json touched. | Success: cargo test (activity green) + cargo build clean._

- [x] 2. IPC + types + useActivity + append-on-mutation wiring
  - Files: `src/lib/ipc.ts` (modify), `src/lib/types.ts` (modify), `src/lib/queries.ts` (modify)
  - Purpose: activity hook + append entries on key mutations
  - _Leverage: src/lib/queries.ts (existing mutations), model.rs DTO_
  - _Requirements: 4.2, 4.3_
  - _Prompt: Implement the task for spec overview-dashboard, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React data engineer | Task: Mirror ActivityEntry in types.ts; add appendActivity(kind,message)/readActivity(limit) to ipc.ts; add useActivity(limit) to queries.ts (off-Tauri demo entries). In the existing mutation hooks add an onSuccess appendActivity + invalidate the activity key: useSwitchAccount ("Switched account to NAME"), useApplyProvider ("Switched to PROVIDER"), useSaveMcpServer ("Added MCP server NAME") / useToggleMcpServer ("Enabled/Disabled MCP server NAME"), useSkillEnabled ("Enabled/Disabled skill NAME"), useSaveMemory ("Updated memory PATH"). Keep messages label-only. | Restrictions: append must be best-effort (never break the mutation); components use hooks not invoke; demo fallback. | Success: tsc clean; mutations append activity under Tauri._

- [x] 3. ModelBars chart (tokens by model)
  - Files: `src/ui/charts/ModelBars.tsx`
  - Purpose: the horizontal tokens-by-model bars
  - _Leverage: @/theme tokens, src/lib/types.ts (ModelTotal), research/design-inventory.md §2_
  - _Requirements: 3.2_
  - _Prompt: Implement the task for spec overview-dashboard, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Data-viz frontend developer | Task: Build src/ui/charts/ModelBars.tsx taking ModelTotal[] (model, tokens): each row = model name (mono, truncate) + a formatted token value + an accent fill bar whose width is the pct of the max; token-only colors (accent fill), responsive. | Restrictions: tokens only; mono model ids; no hardcoded hex. | Success: renders ranked model bars from sample data._

- [x] 4. Overview screen
  - Files: `src/screens/overview/index.tsx`
  - Purpose: the real Overview landing screen
  - _Leverage: @/ui (StatTile, Card, Badge, Button), src/app/AccountSwitcher (AccountAvatar), src/ui/charts/(OutputBars,ModelBars), src/lib/queries.ts, src/lib/store.ts (go), research/design-inventory.md §2_
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.3_
  - _Prompt: Implement the task for spec overview-dashboard, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Replace the overview placeholder with the real screen: ScreenHeader ("Overview" + one-liner); a hero Card (accent left bar) with account variant (eyebrow "Active account", AccountAvatar, name, email · org, tier Badge, primary "Manage account" -> go('configs')) OR provider variant (eyebrow "Active configuration", ProviderChip, title, baseUrl sub, model Badge, primary "Edit config" -> go('editor')) from useActiveIdentity, plus a secondary "Switch" -> go('configs'); four StatTiles (Claude accounts = useAccounts().length -> configs; MCP servers = enabled useMcpServers -> mcp; Skills = enabled useResources('skill') -> skills; Tokens today = useUsage today's output formatted -> usage), each clickable; a charts row (Output tokens card with OutputBars + Tokens by model card with ModelBars, both from useUsage); a "Recent activity" Card listing useActivity() (icon by kind + message + relative time, empty state). | Restrictions: real data via hooks; mono machine values + big mono numerals; tokens only; deep-links via go(). | Success: Overview matches design §2 with real account/counts/usage/activity._

- [x] 5. Tests (frontend)
  - Files: `src/screens/overview/Overview.test.tsx`, `src/lib/queries.test.ts` (modify)
  - Purpose: lock the Overview composition
  - _Leverage: Vitest + Testing Library, mocked ipc_
  - _Requirements: 1.1, 2.1, 2.3, 4.3_
  - _Prompt: Implement the task for spec overview-dashboard, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend QA engineer | Task: Overview.test.tsx (ipc mocked): renders the hero from a mocked active identity (account + provider variants); the 4 tiles show mocked counts and navigate on click (spy go); charts render from mocked usage; the activity feed lists mocked entries + empty state. Extend queries.test.ts for useActivity + assert a mocked switch mutation appends activity. | Restrictions: behavior not implementation; headless; mock backend. | Success: pnpm test green incl. new suites._

- [x] 6. Verify, fingerprint + safety audit
  - Files: (verify) whole repo
  - Purpose: prove S11 builds, tests pass, no fingerprints, no secret in activity
  - _Leverage: tech.md de-fingerprint rules_
  - _Requirements: all_
  - _Prompt: Implement the task for spec overview-dashboard, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Release engineer | Task: Run pnpm exec tsc --noEmit (0), pnpm test (green), cd src-tauri && cargo test (activity green) + cargo build (clean), pnpm exec vite build (clean). Fingerprint grep over src + src-tauri/src + configs -> zero. Assert activity messages never include a token (grep the append call sites). Report exact pass/fail. (The orchestrator launches the window, screenshots the Overview with real data, commits.) | Restrictions: fix don't suppress; do not commit. | Success: all gates green and reported; zero fingerprints; no token in activity._
