# cchive — Architecture & Security

cchive is a calm, cross‑platform desktop tool for managing your coding agents:
switch between Claude Code accounts (e.g. two Max plans — flip the moment one runs
out) **and** Codex accounts, manage API providers, MCP servers,
agents/commands/skills, memory, and read local usage.
This document captures the durable design that isn't obvious from the code alone.

## Stack

- **Shell:** Tauri v2 (Rust backend + system WebView). App identity `app.cchive`.
- **Frontend:** React 19 + TypeScript + Vite, Tailwind v4 (`@theme` tokens), an
  in‑repo component library (no UI framework). TanStack Query (server state) +
  Zustand (UI shell state). i18next (en / zh‑Hans / zh‑Hant / ja / fr). Recharts,
  CodeMirror 6, lucide‑react.
- **Backend:** Rust, organized as `core/*` (logic) + `commands/*` (thin Tauri
  command wrappers registered in `lib.rs`). Secrets in the OS keyring (`keyring`
  crate). Non‑secret prefs in `tauri-plugin-store`; cchive‑managed JSON via an
  atomic filesystem helper.

## Module map (`src-tauri/src/`)

- `core/paths` — resolve `~/.claude.json`, `~/.claude/.credentials.json`,
  `~/.claude/settings.json`, and the cchive config dir.
- `core/atomic_fs` — temp‑write + fsync + rename, mode 0600 (dirs 0700),
  backup‑first; the single safe‑write primitive everything else uses.
- `core/credentials`, `core/claude_json`, `core/settings` — read/merge the three
  Claude files **preserving all unknown keys**.
- `core/keyring_store` — the secret vault (Claude account tokens, provider API
  keys, and Codex `auth.json` payloads — three isolated namespaces:
  `app.cchive.accounts`, `app.cchive.providers`, `app.cchive.codex.accounts`).
- `core/switch` — the account‑switch engine (below).
- `core/codex` — the **Codex** account‑switch engine: capture / switch / identity
  against `~/.codex/auth.json` (the single‑file Codex twin of `core/switch`).
  Identity (email + plan, e.g. ChatGPT Pro) is read from the `id_token` claims;
  the whole auth payload stays in the keyring — never a token across IPC.
- `core/providers` — third‑party provider configs + `apply` (merge `env` into
  settings); the index is store‑backed.
- `core/usage` — parse local Claude usage JSONL → token totals + a documented
  cost estimate (cache‑read ≈ 0.1× input, cache‑write ≈ 1.25× input).
- `core/mcp`, `core/resources`, `core/memory`, `core/projects` — the manager
  backends for those screens.
- `core/notify_hook` — install/remove a `cchive-notify`‑marked command hook in
  `settings.json` (Stop/Notification/PreToolUse) **surgically**, preserving the
  user's existing hooks.
- `core/activity` — a capped recent‑activity log (labels only).
- `core/portable` — secret‑free export/import (providers minus keys + prefs).
- `core/backups` — rotating timestamped snapshots of the Claude files
  (auto‑snapshot before every switch) + restore.
- `core/latency` — bounded endpoint round‑trip test (no auth header).
- `tray.rs` — the system‑tray quick‑switch (reuses `core::switch`).

## The account‑switch mechanism (the core value)

A switch is performed entirely by `core/switch` (the in‑app switcher and the tray
both call it — no duplicated logic):

1. **Snapshot** the current Claude files (rotating backup) first.
2. Swap the `claudeAiOauth` block in `~/.claude/.credentials.json` — **preserving
   `mcpOAuth`** and every other key.
3. Swap `oauthAccount` / `userID` in `~/.claude.json`.
4. (Provider switch instead: shallow‑merge the provider's `env` into
   `~/.claude/settings.json`.)

Every write is **atomic** (temp + fsync + rename, 0600), **backup‑first**, with
**rollback on failure**, and **preserves unknown keys**. The active identity is
derived from these files (account vs provider variant), including the org name.

## Security model

- **Secrets live only in the OS keyring** and **never cross IPC to the WebView.**
  Rust commands return labels/metadata/booleans/counts — e.g. `has_token: bool`,
  `oauth_token_set: bool`, usage token *counts* — never a token/key value. This
  is enforced by tests and a repo‑wide secret‑leak audit.
- **Export never contains secrets** (a deliberate contrast to plaintext‑dumping
  tools): `core/portable` strips keys/tokens; a unit test asserts none appear.
- All file writes are atomic, backed up, and preserve keys the user set by hand.
- Capabilities are narrow (notification, opener scoped to the issue host, dialog,
  autostart self‑launch only).

## Build / test / release

- Dev: `pnpm install` then `pnpm tauri dev`.
- Tests: `pnpm test` (web) and `cargo test` (in `src-tauri`).
- Typecheck/build: `pnpm exec tsc --noEmit`, `pnpm exec vite build`,
  `cargo build`.
- Bundle: `pnpm tauri build` (a Linux `.deb` is produced here; AppImage/mac/win
  are CI targets). Auto‑update is a documented release‑time step (a signing key +
  a hosted `latest.json`) — no keys/endpoints are committed.

## Spec history

Built spec‑first via `.spec-workflow/` — 16 specs (design system → shell → data
core → screens → system layer → enhancements → polish), each with
requirements/design/tasks and an implementation log. The living re‑planning
record is `.spec-workflow/steering/roadmap.md`.
