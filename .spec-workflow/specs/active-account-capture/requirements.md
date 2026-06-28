# Requirements Document — active-account-capture (S17)

## Introduction

Closes a real first‑run UX gap. The active account shown in the hero is read
**live** from the Claude files (`get_active_identity`), while the "Claude
accounts" count reads Clavis's **vault** (`list_accounts`) — so a brand‑new user
sees a real signed‑in account up top but "Claude accounts: 0" below, with no
guidance, and switching needs at least two captured accounts. S17 keeps the
deliberate "secrets are only copied into the keyring on explicit consent" model
(no silent capture) but makes the prompt **concrete and proactive**: when the
currently‑active account isn't in the vault, Clavis names it and offers a
one‑click capture.

## Alignment with Product Vision

Realizes the onboarding the design implies (`product.md` account management) and
removes the "why is it 0 when I'm clearly logged in?" confusion, without weakening
the keyring‑only / explicit‑consent security model.

## Requirements

### Requirement 1 — Detect the uncaptured active account

**User Story:** As a user, I want Clavis to notice the account I'm signed into but
haven't saved, so it can offer to add it.

#### Acceptance Criteria
1. The app SHALL compute `needsCapture` = the active identity is an **account**
   (`kind === "account"`) AND no saved account in the vault matches it (matched by
   email, reusing the existing active‑match logic).
2. The detection SHALL use the existing hooks (`useActiveIdentity` + `useAccounts`)
   — no new backend; it SHALL be a small shared hook so multiple surfaces reuse it.
3. WHEN the active session is a provider or "none", or the active account is
   already captured, THEN `needsCapture` SHALL be false (no prompt).

### Requirement 2 — Concrete, proactive capture prompt on Configurations

**User Story:** As a first‑run user, I want the empty/uncaptured state to name my
signed‑in account and add it in one click.

#### Acceptance Criteria
1. WHEN `needsCapture` AND no accounts are saved THEN the accounts empty state
   SHALL name the detected account (e.g. "You're signed in as (email) — add it to
   your vault") with a one‑click **Add current account**, instead of the current
   generic copy.
2. WHEN `needsCapture` AND some accounts already exist (but not the active one)
   THEN a prompt row/banner SHALL appear in the accounts section offering to
   capture the current account, naming it.
3. The capture SHALL reuse the existing `add_account_from_active` flow (explicit,
   one click); on success the prompt SHALL disappear, the count + list SHALL
   update, and an activity entry SHALL be recorded. A failure SHALL toast and
   leave state unchanged.
4. WHEN the active account is already captured THEN neither prompt SHALL show
   (the normal account rows render, the active one badged).

### Requirement 3 — Overview nudge (light)

**User Story:** As a user on the dashboard, I want a gentle hint that my account
isn't saved yet.

#### Acceptance Criteria
1. WHEN `needsCapture` THEN the Overview "Claude accounts" stat tile (or hero)
   SHALL show a subtle affordance ("Add this account") that deep‑links to the
   Configurations capture (or triggers it). It SHALL be unobtrusive and absent
   once captured.

## Non-Functional Requirements

### Code Architecture and Modularity
- A single `useActiveAccountCapture()` hook (needsCapture + the active email + the
  capture mutation) reused by Configurations and Overview. UI changes are
  presentation‑only; the backend (`get_active_identity` / `add_account_from_active`
  / `list_accounts`) is unchanged. i18n keys for all new copy (5 locales,
  zh‑Hans complete).

### Security
- **No silent capture** — the prompt always requires an explicit click; secrets
  stay in Rust (the capture writes the keyring in the core, returns metadata only).

### Reliability / Usability
- The prompt reflects live state and disappears immediately after capture (query
  invalidation). Copy is calm and names the real account. No regression to the
  existing add/switch/remove flows; existing tests stay green.
