# Technology Stack

## Project Type

Cross‑platform **desktop application** (Linux, macOS, Windows) built with **Tauri v2** — a Rust backend hosting a system WebView that renders a React UI. Clavis is a local‑only tool that reads and writes the real Claude Code files on disk; it has no server, no account, and no telemetry.

## Core Technologies

### Primary Languages
- **Rust** (backend / `src-tauri`), edition 2021, toolchain ≥ 1.77.2 (Tauri v2 MSRV). All privileged work — file I/O, OS keychain, atomic writes, path resolution, usage parsing — lives here so secrets never reach the WebView.
- **TypeScript** (frontend), strict mode, targeting the Tauri WebView. **React 19**.
- Build tooling: **Vite 7** (frontend), **Cargo** (backend), **pnpm** (Node package manager), `@tauri-apps/cli` as a dev dependency.

### Key Dependencies / Libraries

**Backend (Rust, `src-tauri/Cargo.toml`):**
- `tauri = "2.10"` (features: `tray-icon`, `image-png`) — shell, IPC, tray.
- `tauri-plugin-single-instance = "2.4.2"` — registered **first**; focuses the existing window on second launch.
- `tauri-plugin-store = "2.4.3"` — JSON KV for **non‑secret** account metadata, ordering, UI prefs.
- `tauri-plugin-autostart = "2.5.1"` — launch‑at‑login toggle.
- `tauri-plugin-notification = "2"` — desktop notifications (switch result, near‑expiry, rate‑limit reset).
- `tauri-plugin-updater = "2.10.1"` (desktop‑only target gate) — signed updates (minisign), our own `latest.json` host.
- `keyring = "3"` — OS credential store for secrets at rest (macOS Keychain / Windows Credential Manager / Linux Secret Service via the **dbus‑secret‑service** backend, `vendored`). **Not Stronghold** (Stronghold only relocates the "where's the vault password" problem).
- `serde` / `serde_json` (with `preserve_order`) — parse/mutate/re‑serialize Claude JSON without dropping unknown keys.
- `dirs` (or Tauri path API) — home/`$HOME` resolution; never hardcode paths.
- `notify` (optional, later) — watch `~/.claude/**` so the UI reflects external edits.
- `chrono` — timestamps for backups and usage bucketing.

**Frontend (`package.json`):**
- **React 19** + **TypeScript** + **Vite 7**.
- **Tailwind CSS v4** with a custom `@theme` wired to the Clavis design tokens — **no Mantine/UI kit**; we build our own component library (Button, Switch, Badge, Card, StatTile, Input, Select, SegmentedControl, IconButton, Tooltip, Popover, Modal, Toast, …) to match the design exactly.
- **@tanstack/react-query v5** — server/data state (account list, active‑credential summary, usage aggregation, expiry countdown) with polling.
- **zustand v5** — ephemeral UI state (active screen, open modal, selected list item, view mode).
- **@uiw/react-codemirror** (CodeMirror 6) + `@codemirror/lang-json` + `@codemirror/lang-markdown` + `@codemirror/lint` — JSON (`settings.json`, `.mcp.json`) and markdown (`CLAUDE.md`, agents, commands) editing with validation.
- **recharts v2** — output‑tokens bar chart, tokens‑by‑model bars, usage charts; a custom canvas/SVG **contribution heatmap** for the yearly Activity grid.
- **lucide-react** — the line‑icon set (Lucide language, ~1.7 stroke) the design specifies.
- **i18next** + **react-i18next** + language detector — `en`, `zh-Hans`, `zh-Hant`, `ja`, `fr` (the five the design exposes).
- **Geist** + **Geist Mono** self‑hosted variable `.woff2` (copied from the `geist` npm package into `src/assets/fonts/`); wired via `@font-face` to `--font-sans` / `--font-mono`. (Do **not** use `geist/font/sans` — Next.js‑only.)

### Application Architecture

**Two‑layer, command‑oriented:**
- **Rust core (privileged):** a thin set of `#[tauri::command]`s over well‑isolated services — `claude_paths` (cross‑platform path resolution incl. `CLAUDE_CONFIG_DIR`), `atomic_fs` (temp + fsync + rename, mode 0600 re‑apply), `credentials` (read/write active credential per OS; Keychain on mac), `accounts` (capture/store/switch subscription accounts via keyring), `providers` (settings.json `env` shallow‑merge), `settings`/`mcp`/`agents`/`commands`/`skills`/`memory`/`projects` (config‑surface editors), `usage` (parse `projects/**/*.jsonl`, dedup, cost), `notify_hook` (install/remove our notification hook), `tray`. The WebView only ever receives **labels and metadata — never raw tokens**.
- **React UI (unprivileged):** the 13‑screen app shell over the design system, calling commands through a typed IPC client; TanStack Query for data, Zustand for UI.

**Patterns:** parse → mutate known keys → atomic write (never full‑string overwrite of files with unknown future keys); capture‑before‑write with timestamped backups + rollback; OS keychain as source of truth for secrets; file‑system as source of truth for Claude config.

### Data Storage
- **Claude Code files (the real targets, read/written in place):** `~/.claude/.credentials.json` (`claudeAiOauth` + `mcpOAuth`), `~/.claude.json` (`oauthAccount`, `userID`, `mcpServers`, `projects`), `~/.claude/settings.json`, `~/.claude/CLAUDE.md`, `~/.claude/{agents,commands,skills}/…`, `~/.claude/projects/**/*.jsonl`, project `.claude/settings.local.json` + `.mcp.json`. macOS subscription credential lives in **Keychain** (`service "Claude Code-credentials"`, account `$USER`).
- **Clavis's own store (separate namespace):** secrets (each saved account's `claudeAiOauth` blob) → **OS keyring** under our bundle id (`app.clavis.accounts`); non‑secret metadata (email label, plan/`rateLimitTier`, ordering, last‑used, UI prefs, accent, density, language) → `tauri-plugin-store` JSON in the platform app‑config dir.
- **Backups:** timestamped copies (`*.clavis.bak.<epoch>`) written before any destructive change; auto‑rotating (keep N).
- **Data formats:** JSON everywhere; JSONL for usage; markdown + YAML frontmatter for agents/commands/skills/memory.

### External Integrations
- **None required at runtime.** No backend, no analytics. Optional, user‑controllable network calls only: the **update check** (our `latest.json`) and an optional **endpoint latency probe** (provider reachability test). The OAuth "Sign in with Claude" flow hands off to `claude.ai` in the browser; Clavis captures the resulting local credential — it does not proxy or store Anthropic traffic.
- **Auth model:** Claude **OAuth subscription** credentials (the swap target) and Anthropic‑compatible **provider** keys (env injection). No proxying/format conversion (explicitly out of scope).

### Monitoring & Dashboard Technologies
- The product *is* the dashboard. **State management:** TanStack Query (data) + Zustand (UI), with the file system as source of truth. Optional `notify` fs‑watch for live refresh.

## Development Environment

### Build & Development Tools
- **Build:** `cargo` (Rust) + `vite` (frontend), orchestrated by `@tauri-apps/cli` (`tauri dev`, `tauri build`).
- **Package management:** `pnpm` (Node) + `cargo` (Rust).
- **Dev workflow:** `tauri dev` with Vite HMR for the WebView; Rust recompiles on change.
- **Verified on this machine:** Rust 1.96, Node 24, pnpm 11, and all Tauri Linux system deps (`webkit2gtk-4.1`, `gtk3`, `libappindicator-gtk3`, `librsvg`, `base-devel`, `openssl`).

### Code Quality Tools
- **Frontend:** Biome (lint + format, tab indentation) **or** ESLint + Prettier — pick one and pin; TypeScript `strict`.
- **Rust:** `cargo fmt` + `cargo clippy` (deny warnings in CI).
- **Testing:** Vitest (+ Testing Library) for React units; Rust `#[cfg(test)]` unit tests for the privileged core — **especially the switch/atomic‑write/rollback paths** (the data‑loss‑critical code). A small set of integration tests over temp `$HOME` fixtures.

### Version Control & Collaboration
- **VCS:** Git. **Branching:** trunk‑based on `main` for this solo build; feature work may use short‑lived branches.
- **Commit hygiene & de‑fingerprinting (hard rule):** the repository is an **original product**. Nothing in code, comments, identifiers, or git history attributes Clavis to any predecessor tool. No predecessor names, no copied marker strings, no telemetry keys, no affiliate params. Commits are authored by the project owner with neutral, product‑focused messages.

## Deployment & Distribution
- **Targets:** Linux (AppImage + deb), macOS (.app/.dmg, universal), Windows (per‑user MSI/NSIS — no admin).
- **Distribution:** GitHub Releases (or equivalent) + Homebrew cask (later). 
- **Install requirements:** none beyond the OS WebView (WebKitGTK on Linux, WebView2 on Windows, WKWebView on macOS).
- **Update mechanism:** `tauri-plugin-updater` with minisign‑signed artifacts and our own `latest.json`.

## Technical Requirements & Constraints

### Performance
- Cold start < 1.5 s; config switch perceived < 300 ms; idle RAM modest for a WebView app. Usage parsing of `projects/**/*.jsonl` must be incremental/streamed (don't load all into memory).

### Compatibility
- **Platforms:** macOS 12+, Windows 10+, modern Linux (glibc). **Rust** ≥ 1.77.2.
- **Claude Code:** tolerate schema evolution — model only the keys we edit, preserve all unknown keys on write.

### Security & Compliance
- **Secrets:** never in the WebView, never logged, never in git. Stored in the OS keyring; backups of credential files are mode `0600`. 
- **Threat model:** the main risk is **data loss / credential clobber**, not network attack (the app is local). Mitigations: capture‑before‑write, atomic rename, timestamped backups, rollback, preserve `mcpOAuth`, never full‑overwrite unknown keys.
- **Privacy:** no telemetry, no phone‑home, no third‑party analytics — by design and as a differentiator.

### Scalability & Reliability
- Single‑user desktop scope. Reliability bar is **zero known credential‑clobber paths**, enforced by tests.

## Technical Decisions & Rationale

### Decision Log
1. **Tauri v2 over Electron** — far smaller binary, native Rust for atomic FS + OS keychain, matches the design's "calm native" intent.
2. **Own component library on Tailwind v4 over Mantine** — the design ships its own token system and core components; a bespoke library matches the "paper & clay" identity exactly and avoids the predecessor's look. (The predecessor used Mantine; we deliberately diverge.)
3. **OS keyring (keyring crate) over Stronghold** — Stronghold needs a master password we'd have to prompt for or stash; the OS login keychain already owns trust and stays unlocked.
4. **Two switch modes, two code paths** — subscription (swap `claudeAiOauth`, preserve everything else) vs. provider (shallow‑merge `settings.json` `env`). Never conflate them.
5. **All token I/O in Rust commands** — the WebView receives only labels/metadata; Tauri capabilities stay narrow (no broad `fs`/`shell`).
6. **Recharts for charts, custom SVG for the heatmap** — declarative and sufficient; visx only if a future viz needs it.
7. **No local proxy / no format conversion / no multi‑tool targets on day one** — explicitly out of scope (that is the predecessor‑switcher's largest, most fragile surface and not needed for config/account switching). Clavis is Claude‑Code‑focused; multi‑tool fan‑out is a future option behind the same `{env, config}` model.
8. **No telemetry** — removed entirely versus the predecessor.

## Known Limitations
- **macOS parallel accounts:** current Claude Code effectively supports only *sequential* account switching (copied tokens 401 in parallel; `CLAUDE_CONFIG_DIR` isolation is unreliable on Linux/WSL). Clavis targets fast sequential swap, not concurrent multi‑account.
- **`CLAUDE_CODE_OAUTH_TOKEN` override:** if set, it overrides the file/keychain and (mac bug) can delete the Keychain entry on exit. Clavis detects and warns rather than fighting it.
- **Cost is computed, not stored** — `.jsonl` has no `costUSD`; a per‑model pricing table must be maintained.
- **Restart semantics differ by OS** — Linux/Windows re‑read on next message (no restart); macOS caches ~30 s. The UI states this accurately per platform.
