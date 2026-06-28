# Design Document — active-account-capture (S17)

## Overview

A small, presentation‑only change. One shared hook `useActiveAccountCapture()`
composes the existing `useActiveIdentity` + `useAccounts` to decide whether the
live active account is uncaptured, and exposes the email + the existing capture
trigger. Configurations uses it to (a) make the empty state concrete and (b) show
an "uncaptured active account" banner when other accounts exist; Overview's
"Claude accounts" tile shows a light nudge. No backend changes — capture still
goes through the existing explicit `openAddAccount` path (the keyring write stays
in Rust).

## Steering Document Alignment

### Technical Standards (tech.md)
- Reuses S4 `useActiveIdentity`/`useAccounts`/the add‑account flow + the existing
  `accountIsActive` matcher; S13 i18n; S1 `@/ui`. No new IPC or model.

### Project Structure (structure.md)
- `useActiveAccountCapture()` in `src/lib/queries.ts`; UI edits in
  `src/screens/configurations/index.tsx` + `src/screens/overview/index.tsx`; new
  i18n keys in `src/i18n/locales/*.json`.

## Code Reuse Analysis

### Existing Components to Leverage
- `useActiveIdentity` (live identity, `kind`/`email`), `useAccounts` (vault list),
  `accountIsActive(account, identity)` (the email matcher already used to badge the
  active row), `openAddAccount` (the existing explicit capture modal), the add
  mutation's `onSuccess` (already invalidates accounts + records activity). `@/ui`
  Button, Card; lucide `Plus`/`UserPlus`.

### Integration Points
- The hook ↔ both screens. The capture click ↔ the existing `openAddAccount`
  modal (no new write path).

## Architecture

```mermaid
graph TD
    H[useActiveAccountCapture] --> ID[useActiveIdentity]
    H --> ACC[useAccounts]
    H -->|needsCapture + email| CFG[Configurations: concrete empty-state + uncaptured banner]
    H -->|needsCapture| OV[Overview: Claude-accounts tile nudge]
    CFG -->|click| ADD[openAddAccount modal -> add_account_from_active]
    OV -->|click| GO[go('configs') + openAddAccount]
```

### Modular Design Principles
- `needsCapture` lives in exactly one hook (no duplicated logic across screens).
  The prompts are thin presentational pieces. The capture path is unchanged.

## Components and Interfaces

### useActiveAccountCapture() (queries.ts)
- Returns `{ needsCapture: boolean, email: string | null }`.
  `needsCapture = identity?.kind === "account" && !accounts.some(a => accountIsActive(a, identity))`.
  False while either query is loading, or for provider/none kinds. (`accountIsActive`
  is lifted/exported from the configurations module or re‑implemented as a tiny
  shared `emailEq` — single source.)

### Configurations
- **Empty state** (`AccountsEmptyState`): when `needsCapture` + email, the copy
  becomes "You're signed in as EMAIL — add it to your vault" (i18n) with the same
  `Add current account` button; otherwise the existing generic copy.
- **Uncaptured banner**: when `needsCapture` AND `accountList.length > 0`, render a
  `CaptureActiveRow` as the first item of the accounts `Card` (accent‑tinted, a
  `UserPlus` icon, "Add the account you're signed into — EMAIL", a capture button),
  above the saved rows. Hidden when captured.

### Overview
- The "Claude accounts" `StatTile`: when `needsCapture`, append a small, muted
  "Add this account" affordance (or a dot) whose click does `go('configs')` then
  `openAddAccount`. Unobtrusive; gone once captured.

### i18n
- `configs.capture.signedInAs` ("You're signed in as ((email))"),
  `configs.capture.addToVault`, `configs.capture.uncaptured` ("Add the account
  you're signed into"), `overview.addThisAccount` — en authoritative, zh‑Hans
  complete, plus zh‑Hant/ja/fr. Interpolate the email.

## Data Models
- None new. Reuses `ActiveIdentity` (`kind`/`email`) + `AccountMeta` (`email`).

## Error Handling
1. **Either query loading/errored:** `needsCapture` false → no prompt (no flash of
   a wrong prompt).
2. **Capture fails:** the existing modal/mutation toasts; state unchanged; the
   prompt remains (still uncaptured).
3. **No email on the active identity:** fall back to generic copy (still offer
   capture).
4. **Off‑Tauri (gallery/demo):** demo identity + demo accounts already drive the
   hooks; the prompt follows the demo state without special‑casing.

## Testing Strategy

### Frontend (Vitest, IPC mocked)
- `useActiveAccountCapture`: account identity + empty vault → `needsCapture` true
  with email; account identity already in vault → false; provider/none → false;
  loading → false.
- Configurations: uncaptured + empty → concrete empty state names the email +
  capture button calls `openAddAccount`; uncaptured + existing accounts → the
  banner shows and captures; captured → no banner, rows render.
- Overview: the tile shows the nudge when uncaptured, not when captured.

### Manual (desktop)
- Fresh vault while signed in: Configurations names the real account and one click
  captures it; the count goes 0→1 and the prompt disappears; the Overview tile
  nudge clears.
