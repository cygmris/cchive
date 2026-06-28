# Clavis — Living Roadmap

> This is a **living document**. It is re‑planned continuously as the build progresses, as
> lessons accumulate, and as new feature ideas surface. It is NOT a fixed plan executed to the
> end — every milestone appends a checkpoint and may reorder/insert/add specs.
>
> Contract: when all specs (including ones added mid‑flight) are done, Clavis covers **100% of
> the design feature‑coverage checklist** (92 items, `research/design-inventory.md §19`) plus the
> predecessor feature parity (`research/ccmate-features.md`) and the adopted cc‑switch features
> (`research/ccswitch-features.md §6`).

## Status legend
`[ ]` planned · `[~]` in progress · `[x]` done · `[+]` added mid‑flight · `[»]` deferred/reordered

## Spec sequence (initial plan — will evolve)

### Foundation
- `[x]` **S1 design-system-foundation** ✅ (done 2026-06-28; tsc+16 tests+cargo+vite all green, fingerprint audit clean, gallery visually verified light/dark/accent) — Tauri v2 + React 19 + TS + Vite + Tailwind v4 scaffold; all design tokens (light/dark) + accent (Clay/Blue/Green/Violet/Ember) + density; self‑hosted Geist/Geist Mono; Lucide icons + C‑Key logo; the Clavis component library (Button, Switch, Badge, Card, StatTile, Input, Select, SegmentedControl, IconButton, Tooltip, Popover, Modal, Toast, Radio). Deliverable: themed empty app that builds & runs on Linux. Covers checklist 81–92 (+ scaffolds 14–16).
- `[x]` **S2 app-shell-navigation** ✅ (done 2026-06-28; 38 tests, tsc/cargo/vite clean, fingerprint clean; verified in the REAL Tauri desktop window via spectacle) — window chrome (1300×840, traffic lights), 248px sidebar (logo, ⌘K search button, 3 nav groups, active‑config card, theme switch), status bar, 13‑screen router with placeholder screens, command palette (⌘K + real ↑↓/↵ nav), global shortcuts, light/dark + accent/density wired & persisted. Covers checklist 1–16, 76–80, 17 (sticky header pattern).

### Privileged core (Rust)
- `[x]` **S3 claude-data-core** ✅ (done 2026-06-28; 36 Rust tests + 49 TS tests green; switch happy/rollback/not-found + no-token-leak all verified; fingerprint clean) — `core/paths`, `core/atomic_fs` (temp+fsync+rename, 0600, backup, rollback), `core/credentials` (per‑OS active credential incl. mac Keychain), `core/keyring_store` (account vault), `core/claude_json`, `core/settings`; the typed IPC layer + `model.rs`. Heavy unit tests on switch/atomic/rollback. No new screen — backbone for S4+. (Gotchas G1–G12.)

### Core feature — the keyring (headline)
- `[~]` **S4 configurations-keyring** (next) — Configurations screen + sidebar switcher + tray quick‑switch. Real subscription‑account switch (swap `claudeAiOauth`, preserve `mcpOAuth`, write `oauthAccount`/`userID`, atomic + rollback), account capture/store (keyring), sign‑out, list real accounts with plan/tier labels & expiry. API‑provider list + switch (env shallow‑merge), new‑provider menu + presets (Z.ai/Kimi/DeepSeek/blank), footer microcopy. Covers checklist 24–31, 8–10, 73–75 (OAuth capture).
- `[ ]` **S5 config-editor** — Config Editor screen: structured settings.json editor (Common/General/Auth/MCP/Environment sections + search), control types (text/secret/number/bool→select/enum), validation, Save (atomic merge), Delete. Covers 32–40.

### Visibility
- `[ ]` **S6 overview-dashboard** — Overview: hero (account/provider variants), 4 stat tiles (deep‑links), output‑tokens 30‑day chart, tokens‑by‑model bars, recent‑activity feed (real activity log). Covers 17–23.
- `[ ]` **S7 usage-analytics** — Usage: stream‑parse `projects/**/*.jsonl` (dedup by requestId), 4 stat tiles (input/output/cache/est‑cost), per‑day bar chart, yearly contribution heatmap, 30/7 range toggle, refresh, per‑model pricing/cost. Covers 59–63.

### Config surfaces (unified collection)
- `[ ]` **S8 collection-and-mcp** — the shared Card/Table/Master‑detail collection component + MCP manager: read/write `mcpServers` (global `~/.claude.json` + project `.mcp.json`), enable/disable, add/edit/remove, `.mcp.json` preview. Covers 45–51.
- `[ ]` **S9 agents-commands-skills** — Agents, Commands, Skills via the collection: read/write the `.md` files (frontmatter + body via CodeMirror), model/source badges, skill toggles, add/delete, file previews. Covers 52–55.
- `[ ]` **S10 memory-editor** — Memory: global + project `CLAUDE.md` markdown editor, Save + ⌘S autosave. Covers 56–58.
- `[ ]` **S11 projects-view** — Projects: discover from `~/.claude.json` `projects`, master‑detail, per‑project `.claude/settings.local.json` editor + Save. Covers 41–44.

### System
- `[ ]` **S12 notifications-hook** — Notifications screen + install/remove our own notification hook in settings.json (Completion/General/Tool‑use), per‑row Test, desktop notifications via plugin (de‑fingerprinted: our marker, our port). Covers 64–65.
- `[ ]` **S13 experimental-and-settings** — Experimental (warning banner, Agent Teams toggle + Teammate display mode) + Settings (language/i18n select wired across 5 locales, appearance toggle, version + update check, Report an issue) + Tweaks persistence. Covers 66–72, 69.
- `[ ]` **S14 tray-autostart-updater-packaging** — system tray (dynamic account menu + active check), autostart, single‑instance, auto‑updater, app icons (C‑Key), cross‑platform bundle config, de‑fingerprinted identity (`app.clavis`), README. Covers tray/updater/autostart parity.

### Adopted enhancements (cc‑switch §6)
- `[ ]` **S15 import-export-backups-latency** — export/import configs as JSON, deep link `clavis://` import, auto‑rotating backups (keep N) + restore, endpoint latency speed test (warm‑up + timed concurrent), live "active‑config drift" detection. (Tier‑1/2 adopts.)

### Cross‑cutting (continuous)
- `[ ]` **S16 i18n-localization-pass** — complete translations for en/zh‑Hans/zh‑Hant/ja/fr across all screens (may fold into S13).
- `[ ]` **design parity verification** — at each feature milestone, run the design‑handoff‑parity check (browser/screenshot diff vs `.design-bundles` renders) before marking the screen done.

## Candidate future specs (not yet committed — re‑evaluate as we go)
- Quota/exhaustion awareness + optional auto‑rotate on throttle (manual‑confirm first).
- Config history/diff + one‑click rollback timeline.
- Cloud sync (config‑dir‑on‑Dropbox first; WebDAV later).
- Workspace profiles (config + MCP set + agents switch together).
- Multi‑tool targets (Codex/Gemini/Claude Desktop) via the `{env, config}` fan‑out.
- Per‑provider balance/quota query templates.

## Decisions locked (from research)
- Scope = Claude Code only (multi‑tool = future); subscription OAuth swap is the headline; **no proxy/format‑conversion**; **no telemetry**.
- Secrets in OS keyring (keyring crate, Rust‑side); metadata in `tauri-plugin-store`.
- Two switch modes, two code paths (account vs provider).
- De‑fingerprint: drop `org.randynamic.ccconfig`, `~/.ccconfig`, `__ccmate__`, port 59948, PostHog, `unlock_cc_ext`, affiliate params, predecessor crate names.

## Re‑planning log
- **2026‑06‑28 — Kickoff.** Steering (product/tech/structure) written + approved. Research complete (5 reports in `research/`). Initial 16‑spec roadmap drafted from the 92‑item design checklist + ccmate parity + cc‑switch adopt list. Confirmed 13 screens (Skills is a real peer; Config Editor is action‑reached). Next: implement S1.
- **2026‑06‑28 — S1 complete (checkpoint).** design-system-foundation shipped: Tauri v2 + React 19 + Vite 7 + Tailwind v4 scaffold (identity `app.clavis`), full token system (light/dark + 5 accents + density), self-hosted Geist/Geist Mono, theme engine, Lucide icons + C‑Key logo, **14-component library** (Button/IconButton/Switch/Radio/SegmentedControl/Badge/Card/StatTile/Input/Select/Tooltip/Popover/Modal/Toast), dev gallery, 16 unit tests. All gates green + visually verified; zero fingerprints.
  - **Build lessons (relevant to all later specs):** resolved Tauri = 2.11.3 (not 2.10), `@vitejs/plugin-react@5` (v6 needs Vite 8), TypeScript = 6.x so tsconfig uses `paths` relative to itself (no `baseUrl`), `@tauri-apps/plugin-store` `load()` needs `defaults:{}`, and `generate_context!` requires generated `src-tauri/icons/*` (already produced from the C‑Key tile). The component library is the composition base for S2 — import from `@/ui/*` (logged in Implementation Logs task 7); don't re-implement primitives.
  - **Minor follow-ups (deferred, non-blocking):** add a dev favicon (browser logs a /favicon.ico 404 in `vite dev`; harmless — Tauri uses the real app icon); density var is wired in components but exercise it across real screens in S2+.
  - **Plan unchanged otherwise.** Next: S2 app-shell-navigation (window chrome, sidebar, status bar, 13-screen router with placeholders, command palette, global shortcuts), composing the S1 library.
- **2026‑06‑28 — S2 complete (checkpoint).** app-shell-navigation shipped: frameless window with functional macOS traffic-light controls, 248px sidebar (logo, ⌘K launcher, 3 nav groups, active-config switcher popover, theme switch), status bar, typed router + registry mounting all 13 screens as placeholders, ⌘K command palette with real ↑/↓/Enter/Esc nav, global shortcuts. 38 tests green; **verified in the real Tauri desktop window** (spectacle screenshot — faithful to the design chrome). Shell state isolated in `useShellStore` (mock seed shaped like real domain → S3/S4 swap the source without touching shell components).
  - **Process note:** user asked why a "gallery" exists — clarified it's a dev-only `#/gallery` component preview, excluded from user nav. Going forward, **verify in the native desktop window** (`tauri dev` + spectacle/grim on Wayland/KDE), not a browser.
  - **Minor follow-ups (deferred):** dev favicon (cosmetic /favicon.ico 404); S1 Badge uppercases tier text (e.g. "MAX 5×") — revisit if the design wants mixed case on the switcher tier badge.
  - **Plan unchanged otherwise.** Next: S3 claude-data-core — the privileged Rust backbone (paths, atomic_fs, credentials per-OS, keyring account vault, claude_json/settings) + typed IPC, the foundation for real account/provider switching. Heavy unit tests on the switch/atomic/rollback paths.
- **2026‑06‑28 — S3 complete (checkpoint).** claude-data-core shipped: the privileged Rust backbone — `core/{paths,atomic_fs,keyring_store,claude_json,settings,credentials,switch}` + 10 Tauri commands + typed TS IPC (`src/lib/ipc.ts`). **36 Rust tests + 49 TS tests** green. Safety proven by name: switch happy path, **write-failure rolls back BOTH files byte-for-byte**, AccountNotFound = zero changes, provider env-only, `active_identity_is_non_secret` (no token reaches the webview). keyring v3 with persistent Secret Service (sync-secret-service + crypto-rust + vendored, no runtime libdbus). An agent **scrubbed a leftover "CC-Mate" fingerprint** in a doc comment.
  - **Design extension (logged):** `atomic_fs::write_json_preserving` carries an explicit `mode` param (0600 enforcement) — small, safe extension of the design sketch. macOS `KeychainBackend` is `cfg`-gated, compiles in-tree, must be exercised on macOS CI (can't cross-compile from Linux).
  - **Plan unchanged otherwise.** Next: S4 configurations-keyring — wire the real switching into the Configurations screen + sidebar switcher + tray; source `useShellStore` from `ipc.ts` instead of the mock; account capture / sign-out / provider presets. This is where a real 5×/20× swap becomes demonstrable in the desktop app.
