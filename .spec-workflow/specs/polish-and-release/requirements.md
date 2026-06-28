# Requirements Document — polish-and-release (S16)

## Introduction

S16 is the closing pass: fix the known refinements surfaced during S1–S15, localize the app shell, correct the cost‑estimate pricing, and run a final whole‑repo release audit (tests + builds + fingerprint sweep + git‑log sweep + a desktop smoke). After S16 the goal's bar — 100% design coverage, zero predecessor fingerprints, production‑ready — is fully met.

## Alignment with Product Vision

Realizes the "calm, correct, trustworthy" finish: numbers are right (pricing), the shell speaks the user's language (i18n), the dashboard is live from any entry point (counts), and the codebase is provably clean of predecessor traces (audit).

## Requirements

### Requirement 1 — App‑wide live counts

**User Story:** As a user, I want the status bar and Overview to show real counts no matter which screen I open first.

#### Acceptance Criteria
1. The MCP / Skills / tokens‑today counts in the status bar SHALL be populated app‑wide (the relevant queries mounted once at the shell level), not only after visiting their screens.
2. WHEN the app boots directly to any screen THEN the status bar SHALL show the real counts (not 0) once data loads.
3. This SHALL reuse the existing hooks (no new backend) and not cause redundant refetching.

### Requirement 2 — Pricing‑tune (cost estimate correctness)

**User Story:** As a user, I want the estimated cost to be realistic, so the number means something.

#### Acceptance Criteria
1. The cost estimate SHALL price cache‑read and cache‑write tokens at their correct (much lower) rates rather than full input rate, so the total is not wildly inflated.
2. The pricing table SHALL be documented (rates per model, with cache multipliers) and unit‑tested against a known token mix.
3. The Usage screen's estimate SHALL clearly remain labelled an estimate.

### Requirement 3 — App‑shell localization

**User Story:** As a non‑English user, I want the app shell in my language, so the tool feels native.

#### Acceptance Criteria
1. The navigation labels, screen headers/subtitles, status bar, command palette, and common actions (Save/Cancel/Switch/Test/…) SHALL render via i18n keys across all five locales, with **zh‑Hans complete** for these shell surfaces.
2. Switching language SHALL visibly localize the shell (nav + headers + common actions), not only the Settings/Experimental screens.
3. Deep per‑field body strings MAY remain English‑fallback for now; this is documented as an ongoing localization effort (not a regression).

### Requirement 4 — Correctness cleanups

**User Story:** As a maintainer, I want the small known issues fixed, so the code is clean.

#### Acceptance Criteria
1. The `recharts` `Cell` deprecation (flagged in S7) SHALL be resolved (current API) with the charts rendering unchanged.
2. Dead/unused code flagged earlier (e.g. an unused `useCreateProvider`) SHALL be removed (only genuinely unused — verified).
3. The Overview hero SHALL show the organization line (email · org) when the active identity exposes an org name (enrich `get_active_identity` to include it from `oauthAccount`), falling back to email‑only otherwise.
4. The window title + favicon/dev document title SHALL be "Clavis" (no framework default), with no predecessor strings.

### Requirement 5 — Final release audit

**User Story:** As the owner, I want proof the app is clean and green before release.

#### Acceptance Criteria
1. `tsc --noEmit`, the full web test suite, `cargo test`, `cargo build`, and `vite build` SHALL all pass.
2. A fingerprint sweep over the whole repo (source + configs + **git log messages**) SHALL find ZERO predecessor traces (ccmate, cc‑switch, ccconfig, `__ccmate__`, PostHog/`phc_`, port 59948, `unlock_cc_ext`, affiliate `ic=`, predecessor crate names/URLs).
3. A secret‑leak sweep SHALL confirm no Rust command returns a token/key to the webview (labels/metadata only), consistent with the model.
4. A desktop smoke SHALL confirm the app launches, the Overview shows real data, and a screen switch works — captured as a screenshot.

## Non-Functional Requirements

### Code Architecture and Modularity
- Counts: mount the existing count queries at the `Shell`/`App` level (or a small `useGlobalData` hook) — no new backend. Pricing: a single documented rate table + a unit test. i18n: extend the locale JSONs + replace hardcoded shell strings with `t()` keys. Cleanups are localized, minimal‑diff edits. The audit is scripted (greps + the test/build commands).

### Performance
- The app‑wide count queries reuse TanStack Query caching (one fetch, shared) — no extra load.

### Security
- The org‑name enrichment exposes only the non‑secret org label (no token). The audit explicitly re‑checks the no‑secret‑over‑IPC guarantee.

### Reliability
- Pricing change is covered by a test so it can't silently regress. Cleanups must keep every existing test green. The audit is the release gate.

### Usability
- Real counts everywhere; a believable cost number; the shell in the user's language; a correctly‑branded window. No functional regressions.
