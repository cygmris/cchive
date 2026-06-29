# Requirements Document — sidebar-footer-display (S18)

## Introduction

A user‑requested UX restructure. Today the sidebar footer account card is an
inline **switcher** (a Popover listing accounts/providers + a "Sign in with
Claude" row) — which duplicates the Configurations switch surface and the tray
quick‑switch, and reads as a competing control. S18 makes the footer
**display‑forward**: it shows who's active and, on click, **navigates to
Configurations** (the single in‑window place to switch + add), instead of opening
an inline switcher. Switching from anywhere stays available via the system tray.
Adding accounts collapses to the one honest path — "Add current account" → the
existing capture modal (which already explains capture + how to add a second
account). No real OAuth login is added (capture‑based model, per the user's
choice).

## Alignment with Product Vision

Realizes the user's revised model: footer = "who am I" indicator + a doorway;
Configurations = the keyring control room (switch + add); tray = fast global
switch. Removes a redundant third switch surface and the confusing "Sign in with
Claude" affordance. Honors the calm‑instrument and explicit‑capture principles.

## Requirements

### Requirement 1 — Footer becomes display + a doorway

**User Story:** As a user, I want the bottom‑left account card to show who's
active and take me to where I manage accounts, not be a hidden switcher.

#### Acceptance Criteria
1. The footer account card SHALL show the active account (avatar + name + meta)
   exactly as today, reading the `activeIdentity` cache.
2. Clicking the card SHALL navigate to the Configurations screen
   (`go("configs")`); it SHALL NOT open an inline switch Popover.
3. The dropdown affordance (the up/down chevron) SHALL be replaced by a
   navigation affordance (a right chevron) or removed; the control's
   `aria-label` SHALL describe navigation (e.g. "View accounts in Configurations"),
   not "switch".
4. The inline switch Popover — the accounts/providers lists and the "Sign in with
   Claude" row — SHALL be removed from the footer.

### Requirement 2 — Switching + adding live in one place

**User Story:** As a user, I want a single, clear place to switch and add accounts.

#### Acceptance Criteria
1. Switching between saved accounts/providers in‑window SHALL be done on the
   Configurations screen (the existing clickable rows); the tray quick‑switch
   SHALL remain the from‑anywhere switch. No behavior change to either.
2. Adding an account SHALL have exactly one in‑window entry: "Add current account"
   (Configurations) → the existing `AddAccountModal`, whose copy already states it
   captures the currently‑logged‑in account and how to add a different one (log
   into it in Claude Code first, then capture again). No second, differently‑named
   add entry (no footer "Sign in with Claude").
3. No real in‑app OAuth login is introduced; the capture‑based model stands.

### Requirement 3 — Clean removal (no dead code / no regressions)

**User Story:** As a maintainer, I want the removed switcher to leave nothing dead.

#### Acceptance Criteria
1. Footer‑only helpers made unused by removing the Popover (e.g. the
   account/provider select handlers, `providerIsActive`, `RowText`,
   `PanelDivider`) and now‑unused imports SHALL be removed.
2. The store's switcher‑open flags (`switcherOpen` / `openSwitcher` /
   `closeSwitcher` / `toggleSwitcher`) SHALL be removed if and only if nothing
   else uses them (verified).
3. The exports other surfaces rely on — `AccountAvatar`, `initialsOf` — and the
   Configurations `AccountRow` switching SHALL be untouched. All existing tests
   SHALL pass (the footer/sidebar tests updated to assert navigation instead of a
   popover).

## Non-Functional Requirements

### Code Architecture and Modularity
- Presentation‑only; no backend/IPC/model change. The footer component stays in
  `src/app/AccountSwitcher.tsx` (its doc comment updated to "active‑account card →
  navigates to Configurations"); it consumes the store `go` action. The single
  add path is the existing `AddAccountModal`.

### Security / Reliability
- No change to the safe switch/capture core or secrets handling. Removing the
  footer switcher cannot affect switching (still in Configurations + tray).

### Usability
- The footer is calmer and unambiguous (status + a clear doorway). The trade‑off
  (in‑window switching is one extra step vs the old footer popover) is accepted by
  the user, mitigated by the tray's one‑click global switch.
