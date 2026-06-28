# Design Document — polish-and-release (S16)

## Overview

Four bounded tasks: (1) mount the existing count queries at the shell so the status bar / Overview are live from any entry screen, plus minimal‑diff correctness cleanups (recharts `Cell`, dead `useCreateProvider`, window title/favicon); (2) fix the cost‑estimate pricing (cache‑read/write at their real low rates) with a documented rate table + test, and enrich `get_active_identity` with the org name for the Overview hero; (3) localize the app shell (nav, headers, status bar, command palette, common actions) across the five locales with zh‑Hans complete; (4) the final release audit (tests + builds + whole‑repo & git‑log fingerprint sweep + secret‑leak sweep + a desktop smoke screenshot). No new product surface — refinement + proof.

## Steering Document Alignment

### Technical Standards (tech.md)
- Reuses TanStack Query (shared cache for the app‑wide counts), the S1 i18n + theme, the S7 usage pipeline (pricing). The org name is a non‑secret label only. The audit is scripted greps + the existing gates.

### Project Structure (structure.md)
- A small `useGlobalData()` mounted in `App`/`Shell`; pricing in the usage cost path (`core/usage.rs` or the frontend cost util — wherever it lives); locale JSON extensions + `t()` wiring in `app/*` (Sidebar, StatusBar, CommandPalette, ScreenHeader) and screen headers; `get_active_identity` + its DTO; `index.html`/`tauri.conf.json` title.

## Code Reuse Analysis

### Existing Components to Leverage
- **S2** `Sidebar`/`StatusBar`/`CommandPalette`, `ScreenHeader`. **S4/S7/S8/S9** the count hooks (`useAccounts`/`useMcpServers`/`useResources`/`useUsage`). **S13** i18n (`t`, locales). **S7** the usage cost calc. **S4** `get_active_identity` + `oauthAccount` (org).

### Integration Points
- `useGlobalData` ↔ the count hooks ↔ the status‑bar store/cache. Pricing ↔ the cost estimate + a test. i18n keys ↔ the shell components. `get_active_identity` ↔ the Overview hero.

## Architecture

```mermaid
graph TD
    App[App/Shell] --> GD[useGlobalData: mount count queries once]
    GD --> SB[StatusBar + Overview tiles: live from cache]
    Usage[usage cost calc] --> PR[corrected cache-read/write rates + test]
    Ident[get_active_identity + org] --> Hero[Overview hero: email · org]
    Shell[Sidebar/StatusBar/CommandPalette/Headers] --> I18N[t() keys, 5 locales, zh-Hans complete]
    Audit[scripted: tests + builds + fingerprint + git-log + secret sweep + smoke]
```

### Modular Design Principles
- One shell‑level data hook (no prop drilling, no new backend). Pricing is one rate table + one test. i18n is additive keys + `t()` swaps. Each cleanup is a minimal, test‑green diff. The audit changes no product code.

## Components and Interfaces

### useGlobalData (App/Shell)
- Calls the existing count hooks once at mount so their queries populate the shared cache; the `StatusBar` (and Overview) read the same cache. Idempotent — TanStack dedups; no refetch storm.

### Pricing (usage cost)
- Locate the rate table; price cache‑read (and cache‑write) tokens at their real fraction of input rate (e.g. cache‑read ≈ 0.1× input, cache‑write ≈ 1.25× input per current public Claude pricing — apply the correct per‑model values), documented inline; a unit test asserts a known `{input, output, cacheRead, cacheWrite}` mix yields a sane total (and that cache‑read is far below input‑priced).

### get_active_identity (+ org)
- Extend the DTO + the resolver to include `org` (organization name from `~/.claude.json` `oauthAccount`) when present; the Overview account hero renders "email · org" when set, else email. Non‑secret only.

### i18n shell
- Add `nav.*`, `header.*` (per screen title+subtitle), `status.*`, `palette.*`, `common.*` keys to all five locales (zh‑Hans complete; others accurate for these surfaces). Replace the hardcoded strings in `Sidebar`/`StatusBar`/`CommandPalette`/`ScreenHeader` usages with `t()`.

### Cleanups
- `recharts` `Cell`: migrate off the deprecated usage to the current API; charts unchanged. Remove the unused `useCreateProvider` (verify no references). Window title/document title = "Clavis".

### Audit (scripted, no product change)
- Run the gate commands; grep the whole repo + `git log --format=%B` for the fingerprint set; grep Rust commands for any token/key return; launch + screenshot the desktop.

## Data Models
- `ActiveIdentity` gains an optional `org` (non‑secret). No other model changes.

## Error Handling
1. **A count query errors:** the status bar shows its last/again‑0 gracefully (unchanged behavior), no crash.
2. **Pricing for an unknown model:** fall back to a default rate (documented), never panic.
3. **Org absent:** hero shows email only.
4. **i18n key missing in a locale:** en fallback (existing behavior).

## Testing Strategy

### Backend (Rust)
- A pricing unit test (known mix → expected sane total, cache‑read ≪ input). `get_active_identity` includes org when `oauthAccount` has it (fixture).

### Frontend (Vitest)
- The shell renders count values from a mocked cache regardless of active screen; the Overview hero shows org when present; a localized nav label changes with language. Existing suites stay green.

### Manual (desktop)
- Boot to a non‑Overview screen → the status bar still shows real counts; switch language → nav/headers localize; Overview hero shows org; the cost estimate is believable. Screenshot the smoke.

## Release Audit (the gate)
- `tsc` + web tests + `cargo test` + `cargo build` + `vite build` all green; whole‑repo + git‑log fingerprint sweep ZERO; no token over IPC; desktop smoke OK. Only then is the goal met.
