# Tasks Document — usage-analytics (S7)

> Token usage from the local session logs. Streaming parse, requestId+messageId dedup, per-day/model/cost aggregation. Numbers only (no credentials, no secrets). Heatmap recolors via color-mix off --accent. Tokens-only styling, no hardcoded hex. Identity app.clavis, no predecessor fingerprints. Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. Usage parser + aggregation + pricing (core/usage.rs) + Rust tests
  - Files: `src-tauri/src/core/usage.rs` (new), `src-tauri/src/core/mod.rs` (modify), `src-tauri/src/model.rs` (modify)
  - Purpose: stream-parse the jsonl logs into totals/per-day/per-model/cost/heatmap
  - _Leverage: src-tauri/src/core/paths.rs (projects_dir), research/modern-impl.md §2.5_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.4_
  - _Prompt: Implement the task for spec usage-analytics, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Rust engineer | Task: Add UsageSummary + TokenTotals + DayPoint + ModelTotal + HeatCell to model.rs (all numeric/string, no secrets). Create core/usage.rs: aggregate(projects_dir, range_days, today_local) that recursively walks *.jsonl, STREAMS lines (BufRead), parses only assistant lines with message.usage, extracts input/output/cache_creation_input/cache_read_input tokens + message.model + timestamp (ISO8601 -> local date), DEDUPS by (requestId, message.id), buckets by local date; builds totals over range, per_day series (last N days), per_model ranked totals, past-year heatmap (per-day -> level 0..4 by quantile/threshold), and est_cost via a pricing() table (per-model input/output/cache rates for known Claude + common third-party models; unknown -> 0 and pushed to unknown_models). Skip malformed lines + unreadable files without failing. Inject today for deterministic tests. Declare in core/mod.rs. Rust tests over a temp fixture: duplicate requestId counted once; cache line; two models/two dates; malformed line skipped; cost known vs unknown=0+flagged; heatmap levels. | Restrictions: streaming (no whole-file load); no panics; numbers only. | Success: cargo test (usage) green + cargo build clean._

- [x] 2. read_usage command
  - Files: `src-tauri/src/commands/usage.rs` (new), `src-tauri/src/commands/mod.rs` (modify), `src-tauri/src/lib.rs` (modify)
  - Purpose: expose the aggregate to the UI
  - _Leverage: src-tauri/src/core/usage.rs, src-tauri/src/core/paths.rs_
  - _Requirements: 2.3_
  - _Prompt: Implement the task for spec usage-analytics, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Tauri engineer | Task: Add commands/usage.rs with read_usage(range_days: u32) -> Result(UsageSummary, CoreError) (default 30 if 0), resolving projects_dir via core::paths and today via the system clock; declare in commands/mod.rs; register in lib.rs generate_handler!. | Restrictions: returns numbers only; no secret access. | Success: cargo build clean; command registered._

- [x] 3. IPC + types + useUsage + status-bar tokens-today
  - Files: `src/lib/ipc.ts` (modify), `src/lib/types.ts` (modify), `src/lib/queries.ts` (modify), `src/lib/store.ts` (modify)
  - Purpose: typed usage hook + real tokens-today in the status bar
  - _Leverage: src/lib/ipc.ts, model.rs DTOs_
  - _Requirements: 3.5, 4.1, 4.2_
  - _Prompt: Implement the task for spec usage-analytics, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React data engineer | Task: Mirror UsageSummary + nested types in types.ts; add readUsage(rangeDays) to ipc.ts; add useUsage(range) query to queries.ts (expose refetch for the refresh button; off-Tauri -> a labelled demo summary). Wire the status-bar tokens-today: source today's output tokens from the usage aggregate into the store activeIdentity cache (or a dedicated selector) so StatusBar shows the real value instead of 0. | Restrictions: numbers only; components use the hook not invoke. | Success: tsc clean; status bar reads real tokens-today under Tauri._

- [x] 4. Heatmap + output-bars chart components
  - Files: `src/ui/charts/Heatmap.tsx`, `src/ui/charts/OutputBars.tsx`
  - Purpose: the contribution heatmap + the daily bar chart
  - _Leverage: recharts, @/theme tokens, research/design-inventory.md §11_
  - _Requirements: 3.3, 3.4_
  - _Prompt: Implement the task for spec usage-analytics, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Data-viz frontend developer | Task: Heatmap.tsx — a 53-weeks x 7-days SVG grid taking HeatCell[] (date, level 0..4), cells colored by color-mix off --accent in 5 steps, weekday labels (Mon/Wed/Fri), a "Less .. More" legend, per-cell tooltip (date + tokens), recolors with accent + theme. OutputBars.tsx — a Recharts bar chart of per-day output tokens (last bar solid --accent, others accent@~62%, per-bar tooltip formatted). Both token-only, responsive width. | Restrictions: tokens only (no hardcoded hex); accent-driven colors via CSS vars; no layout shift. | Success: heatmap + bar chart render from sample data and recolor with the accent._

- [x] 5. Usage screen
  - Files: `src/screens/usage/index.tsx`
  - Purpose: the real Usage screen
  - _Leverage: @/ui (StatTile, SegmentedControl, IconButton, Card), src/ui/charts/*, src/lib/queries.ts (useUsage), research/design-inventory.md §11_
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  - _Prompt: Implement the task for spec usage-analytics, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Replace the usage placeholder with the real screen: ScreenHeader + a 30/7 range SegmentedControl + a refresh IconButton (useUsage().refetch); four StatTiles with colored dots (Input tokens blue, Output green, Cache read amber, Est. cost $ accent) showing formatted Geist-Mono numerals (e.g. 84.2M, $128.40); an "Output tokens per day" OutputBars chart for the range; an "Activity" Heatmap (past year, "Daily token usage · past year") with Less..More legend; loading + empty (zeros) states. Range toggle re-queries 30/7; refresh re-parses. | Restrictions: mono numerals; "estimated" wording on cost; tokens-only styling. | Success: screen matches design §11; tiles/bars/heatmap reflect useUsage; range + refresh work._

- [x] 6. Tests (frontend)
  - Files: `src/screens/usage/Usage.test.tsx`, `src/lib/queries.test.ts` (modify)
  - Purpose: lock the screen + hook behavior
  - _Leverage: Vitest + Testing Library, mocked ipc_
  - _Requirements: 3.1, 3.5, 4.1_
  - _Prompt: Implement the task for spec usage-analytics, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend QA engineer | Task: Usage.test.tsx (ipc mocked): renders 4 tiles from a mocked UsageSummary; range toggle calls useUsage with 7 then 30; refresh triggers refetch; heatmap renders cells; empty summary -> zeros. Extend queries.test.ts for useUsage (right ipc cmd). | Restrictions: behavior not implementation; headless; mock backend. | Success: pnpm test green incl. new suites._

- [x] 7. Verify, fingerprint audit
  - Files: (verify) whole repo
  - Purpose: prove S7 builds, tests pass, no fingerprints
  - _Leverage: tech.md de-fingerprint rules_
  - _Requirements: all_
  - _Prompt: Implement the task for spec usage-analytics, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Release engineer | Task: Run pnpm exec tsc --noEmit (0), pnpm test (green), cd src-tauri && cargo test (usage tests green) + cargo build (clean), pnpm exec vite build (clean). Fingerprint grep over src + src-tauri/src + configs -> zero. Report exact pass/fail. (The orchestrator launches the window, screenshots Usage with the machine's real data, and commits.) | Restrictions: fix don't suppress; do not commit. | Success: all gates green and reported; zero fingerprints._
