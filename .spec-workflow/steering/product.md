# Product Overview

## Product Purpose

**Clavis** is a calm, cross-platform desktop app for managing Claude Code — *"your keyring for Claude Code."*

The central problem it solves: a power user runs more than one Claude Code identity — e.g. a **Max 5×** subscription account and a **Max 20×** subscription account, plus assorted third‑party API providers (Z.ai, Kimi, DeepSeek, an AWS Bedrock endpoint) — and needs to **switch between them instantly the moment one is exhausted or rate‑limited**, without hand‑editing `~/.claude/settings.json`, copying credential files around, or losing their place.

Beyond switching, Clavis is a single quiet instrument panel for everything Claude Code keeps on disk but offers no GUI for: MCP servers, sub‑agents, slash commands, project memory (`CLAUDE.md`), usage/cost analytics, desktop notifications, and the experimental/unstable flags. It reads and writes the real Claude Code files in place, shows exactly what it will change in plain language, and never invents prettified versions of machine text (keys, URLs, model names, paths are shown verbatim).

## Target Users

- **Multi‑plan Claude Code users** (the primary persona): people who hold two or more Claude subscription accounts and/or API providers and flip between them throughout the day as quotas reset. They want a one‑click swap and an at‑a‑glance "which identity am I on right now."
- **Power users & tinkerers**: people who configure MCP servers, write sub‑agents and slash commands, and curate `CLAUDE.md`, but find raw JSON/markdown editing tedious and error‑prone.
- **Cost‑ and usage‑conscious users**: people who want to see token consumption and spend trends per project/day/model without piping `jsonl` through scripts.

Pain points today: editing `settings.json` by hand is risky (a typo breaks the session); subscription‑account switching means manually swapping OAuth credential files / keychain entries; there is no native view of MCP/agents/commands/memory; usage data is locked inside `~/.claude/projects/**/*.jsonl`.

## Key Features

1. **Configuration keyring (the heart)**: create, name, and instantly switch between multiple Claude Code "configs." A config can capture a **subscription account** (its OAuth login credentials) or an **API provider** (base URL + auth token + model env). Switching writes the right files atomically, snapshots what was there before, and tells you to restart your Claude Code session to apply. The active config is always visible in the sidebar.
2. **One‑click provider presets**: guided setup for common third‑party Anthropic‑compatible endpoints (Z.ai, Kimi, DeepSeek, and custom), turning a pasted key into a ready config.
3. **Config editor**: a structured + raw editor for a config's `settings.json` surface (env, model, permissions, status line, hooks) with validation, so you never save broken JSON.
4. **MCP servers manager**: list, add, edit, enable/disable, and remove MCP server definitions (stdio/SSE/HTTP) across global and project scopes.
5. **Sub‑agents manager**: browse and edit `~/.claude/agents/*.md` (frontmatter + body): name, description, tools, model.
6. **Slash commands manager**: browse and edit `~/.claude/commands/*.md`.
7. **Memory editor**: edit global and project `CLAUDE.md` with a comfortable markdown editor.
8. **Projects view**: see the Claude Code projects on disk, their recent activity, and jump to per‑project config/memory.
9. **Usage analytics**: parse `~/.claude/projects/**/*.jsonl` into token‑ and cost‑oriented charts (by day, project, and model) — an instrument‑readout, not a marketing dashboard.
10. **Notifications**: optional desktop notifications for Claude Code lifecycle events (e.g. task finished / awaiting input / permission prompt), wired through a local hook the app installs and cleanly removes.
11. **Experimental flags**: a clearly‑labelled home for unstable/advanced toggles, with honest warnings.
12. **Settings & personalization**: light/dark theme, swappable accent (Clay / Blue / Green / Violet / Ember), density (compact/cozy), language (i18n), launch‑at‑login, system tray, and update preferences.
13. **System tray quick‑switch**: change the active config from the tray without opening the window — the fastest path for "one ran out, flip to the other."

## Business Objectives

- Deliver a **100% functional superset** of the predecessor config‑manager's capabilities, rebuilt on a modern, maintainable stack and a distinctive, calm visual identity — as an original product with no derivative fingerprints in code or history.
- Make **multi‑account / multi‑provider switching** genuinely instant and safe (atomic writes, never lose a credential), which is the differentiating use case.
- Be **trustworthy with secrets and private data**: secrets at rest are handled via the OS secure store where available; there is **no telemetry, no analytics phone‑home, no account** — the app is fully local.
- Ship a **cross‑platform** binary (Linux, macOS, Windows) that nonetheless honors the macOS‑first design language.

## Success Metrics

- **Switch time**: changing the active config (window or tray) completes in well under one second and is reflected on disk atomically. Target: < 300 ms perceived.
- **Design parity**: every screen and interaction in the canonical design build is implemented. Target: 100% of the design feature‑coverage checklist.
- **Feature parity**: every capability of the predecessor manager is present (or deliberately superseded). Target: 100% of the parity checklist, telemetry excluded by design.
- **Safety**: zero data‑loss paths — any write that could clobber the user's only credential first snapshots it; all writes are atomic (temp + rename). Target: 0 known clobber paths, covered by tests.
- **Footprint**: small install, fast cold start. Target: cold start < 1.5 s; idle RAM modest for a webview app.

## Product Principles

1. **Calm instrument, not a mascot.** Plain, precise voice; sentence case; warm "paper & clay" palette; one confident accent. It explains what a thing does and what will happen — it never hypes. No emoji.
2. **Show the machine truth verbatim.** Keys, URLs, model names, token counts, and file paths are rendered in mono and never prettified. The user always sees the real `~/.claude/...` paths and the exact bytes that will change.
3. **Safe by construction.** Read real files, write atomically, snapshot before overwrite, validate before save. A switch must never leave Claude Code unloginable.
4. **Local & private.** No telemetry, no remote account, no background network calls except those the user explicitly configures (e.g. an update check they can disable). Secrets use the OS secure store when possible.
5. **Original and self‑contained.** Clavis is its own product with its own names, paths, and identity — not a reskin. Nothing in the code or git history attributes it to any predecessor tool.
6. **Faithful to the design system.** Tokens, components, spacing, motion, and copy follow the Clavis design language exactly; the implemented UI is verified against the canonical design build.

## Monitoring & Visibility

- **Dashboard Type**: Desktop application (Tauri webview) — the product *is* the dashboard.
- **Real‑time Updates**: file‑system watching of `~/.claude/**` so the UI reflects external edits; in‑app reactive state.
- **Key Metrics Displayed**: active config identity, per‑config readiness, token usage (by day/project/model) and estimated cost, MCP/agent/command counts, notification status.
- **Sharing Capabilities**: local export/import of configs (secrets handled deliberately) for backup or moving between machines; no cloud sharing.

## Future Vision

Clavis grows into the definitive local control surface for Claude Code: deeper config diffing and history, richer usage/cost forecasting (e.g. "at this rate the 5× resets before you exhaust the 20×"), and quality‑of‑life automation around the multi‑account workflow.

### Potential Enhancements
- **Quota awareness**: surface plan limits/reset windows and suggest the optimal account to switch to.
- **Profiles & bundles**: group a config + MCP set + agents into a named workspace profile that switches together.
- **Config history & rollback**: timeline of what Clavis wrote, with one‑click revert.
- **Editor/CLI targets**: optionally apply a config to other Claude Code surfaces (e.g. project‑scoped settings) beyond the global one.
- **Latency/health checks**: ping a provider's endpoint to confirm it's reachable before switching.
