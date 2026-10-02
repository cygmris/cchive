# cchive — Architecture & Security

cchive is a calm, cross‑platform desktop tool for managing your coding agents:
switch between Claude Code accounts (e.g. two Max plans — flip the moment one runs
out), Codex accounts, **and** Grok accounts, manage API providers, MCP servers,
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
  keys, Codex `auth.json` payloads, and Grok `auth.json` payloads — isolated
  namespaces: `app.cchive.accounts`, `app.cchive.providers`,
  `app.cchive.codex.accounts`, `app.cchive.grok.accounts`).
- `core/switch` — the account‑switch engine (below).
- `core/oauth` — token freshness: expiry judgement (5‑minute buffer), the
  credential‑lineage fingerprint (`sha256(refreshToken)`), the refresh exchange
  behind a `TokenEndpoint` trait (so tests never reach the network), and the
  permanent / deterministic / transient classification of a failure.
- `core/claude_locks` — Claude Code's own advisory locks (`proper-lockfile`
  protocol: directory locks, 60s stale for credentials, 10s for the config,
  touched every 5s), so a swap never lands inside its refresh window.
- `core/sessions` — read‑only detection of running Claude Code processes
  (`~/.claude/sessions/<pid>.json` + `procStart` vs `/proc/<pid>/stat`, guarding
  against pid reuse). Reported to the user; never gates a switch.
- `core/codex` — the **Codex** account‑switch engine: capture / switch / identity
  against `~/.codex/auth.json` (the single‑file Codex twin of `core/switch`).
  Identity (email + plan, e.g. ChatGPT Pro) is read from the `id_token` claims;
  the whole auth payload stays in the keyring — never a token across IPC.
- `core/grok` — the **Grok** account‑switch engine: capture / switch / identity
  against `$GROK_HOME/auth.json` (default `~/.grok/auth.json`). The whole file is
  the secret; identity is plaintext `email` / `first_name` / `user_id`; plan is
  the last `ctx.subscriptionTier` from `logs/unified.jsonl` (never a JWT `tier`).
  Namespace `app.cchive.grok.accounts`. Does not touch `config.toml` or sessions.
- `core/codex_provider` — the **Codex provider (gateway)** engine, the Codex twin of
  `core/providers`: surgically edits `~/.codex/config.toml` (via `toml_edit`, preserving
  the user's MCP servers / projects / comments) to set `model_provider` + a
  `[model_providers.<id>]` table (`base_url`, `wire_api`, `experimental_bearer_token`).
  The key lives in the `app.cchive.codex.providers` keyring namespace and is written inline
  only on apply; `auth.json` (the ChatGPT OAuth login) is never touched, so clearing the
  provider returns Codex to the account.
- `core/providers` — third‑party provider configs + `apply` (merge `env` into
  settings); the index is store‑backed.
- `core/usage` — parse local Claude usage JSONL → token totals + a documented
  cost estimate (cache‑read ≈ 0.1× input, cache‑write ≈ 1.25× input). This scan is
  O(all history) and can take seconds on a large `~/.claude/projects` (thousands of
  files), so the frontend caches each computed summary to disk
  (`cchive-usage-cache.json`) and paints it **instantly** on open while the fresh
  recompute runs in the background (`lib/usageCache` + `useUsage` + `useGlobalData`;
  a 60 s stale window skips re‑parsing on quick revisits).
- `core/grok_usage` — Grok local usage: weekly `creditUsagePercent` from the
  `unified.jsonl` tail, plus incremental spend from `sessions/**/updates.jsonl`
  (`costUsdTicks / 10^10`). Cache file `grok-usage-parse-cache.json`. Command
  `read_grok_usage`. **`read_usage` remains Claude-only.**
- `core/codex_usage` — Codex local usage from `sessions/**/rollout-*.jsonl`.
  Sums `token_usage_record.payload.usage`, or `token_count.last_token_usage`
  when a file has no tur (never the cumulative thread/total fields). Cache
  `codex-usage-parse-cache.json`. Command `read_codex_usage`. Est. cost uses
  OpenAI list rates (standard, short context); no ChatGPT HTTP. Usage All pane
  folds Claude+Codex+Grok with a By-agent breakdown; daily bars are output
  tokens (same metric as the Output tile), not Claude input or Codex/Grok
  `tokens` totals.
- `core/usage_cache` — the **incremental** parse cache behind that background recompute:
  each file's parsed events are cached by (size, byte offset) in `usage-parse-cache.json`.
  A grown jsonl is suffix-scanned from the stored offset (not re-parsed from byte 0);
  truncation rescans from 0; unchanged files skip the cache rewrite. Cold cache = one
  full pass. The three `read_*_usage` commands run on `spawn_blocking` so a parse
  cannot freeze the GTK thread. The summary is byte‑identical to `usage::aggregate` —
  the walk is sorted and the cost is summed in sorted model order, so the output is
  deterministic (which is also what lets the two paths match). Cross‑file retry dedup
  is preserved (measured: 443 keys span >1 file).
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

### Token freshness (why a switch is more than a file copy)

A stored account snapshot goes stale on its own. Claude Code **rotates the
refresh token on every refresh** and the grant is **single‑use**, so a snapshot
captured hours ago holds a spent grant plus an expired access token. Activating
it hands Claude Code a dead credential — which surfaces as a 403 on the first
first‑party MCP handshake, long before anything says "sign in again".

So a switch (`core/switch`, `core/oauth`, `core/claude_locks`, `core/sessions`):

1. runs inside **Claude Code's own advisory locks** — `.oauth_refresh.lock` then
   the legacy `~/.claude.lock` (directory locks; `mkdir` is the mutex; 60s stale,
   touched every 5s). Its refresh reads, refreshes and saves inside that lock, so
   an unlocked swap landing in the window is overwritten by the refreshed *old*
   account's token. Contended → `LOCK_BUSY`, a zero‑change outcome;
2. **captures the live credential under the lock**, so the vault gets the
   generation on disk right now;
3. **freshens the target before activating it**: near expiry (5‑minute buffer) →
   refresh at `platform.claude.com/v1/oauth/token`, then persist the successor to
   the vault too, under a **compare‑and‑swap on `sha256(refreshToken)`** (that
   hash survives access‑token rotation and changes exactly when the lineage
   advances). Never for the **active** account — Claude Code owns that one.
   A server‑rejected grant is `CREDENTIAL_DEAD` and is *not* activated; a
   transient failure activates the stored token and lets Claude Code retry;
4. keeps its rollback copy of the credential in a **private temp directory for
   the length of the transaction only**. Credential backups are not restore
   points: each holds a grant the server has already replaced, so restoring one
   signs the user out. Settings offers a one‑time cleanup of the legacy ones.

Running Claude Code sessions are **reported, not gated**: they keep the
credential they already read, so they stay on the previous account.

> The lock protocol, the freshen‑before‑activate shape and the fingerprint CAS
> follow [claude‑swap](https://github.com/realiti4/claude-swap) (MIT,
> © 2026 Onur Cetinkol), which solved this class first. The **design** was
> ported, not its code, and every premise was re‑verified against the Claude
> Code bundle installed here (2.1.263). One premise does **not** transfer:
> claude‑swap can attribute a live session to one account because `cswap run`
> gives each its own config dir; cchive has no per‑account session, so its
> ownership gate reduces to "the target is not the active account".

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
- **Screenshots / smoke test**: the `get_initial_screen` command reads a dev‑only
  `CCHIVE_INITIAL_SCREEN` env (e.g. `configs`) that the shell honours at boot, so a
  headless harness opens the app directly on a screen — no flaky WebKitGTK synthetic
  navigation. See the `tauri-app-smoke-test` skill (Xvfb‑isolated capture).
- **NVIDIA + Wayland render path** (`src-tauri/src/gpu_probe.rs`): on some
  driver/card/compositor combinations WebKitGTK's DMA‑BUF renderer trips
  `Error 71 (Protocol error) dispatching to Wayland display` and the app exits
  before a window shows. The first launch on a new NVIDIA driver version + card
  probes the fast path in a child process and records the verdict in
  `~/.config/app.cchive/gpu-probe.json`; later launches follow the record with
  no probe. "Fast path works" is written only after the child's page loaded and
  it stayed up 2 s; "needs `WEBKIT_DISABLE_DMABUF_RENDERER=1`" is written only
  by the re‑launch that had the switch on, once its own page loaded. Locked
  session, `--autostart`, or a user‑set switch → no probe. A KWin upgrade alone
  does not re‑probe (the key is driver + card); delete the record to force one.
  ⚠️ The Xvfb recipe above forces X11 with DMA‑BUF off, so it **cannot**
  reproduce this — verify on a real, unlocked Wayland session (a locked session
  paints nothing and every capture comes out blank).

## Spec history

Built spec‑first via `.spec-workflow/` — 16 specs (design system → shell → data
core → screens → system layer → enhancements → polish), each with
requirements/design/tasks and an implementation log. The living re‑planning
record is `.spec-workflow/steering/roadmap.md`.
