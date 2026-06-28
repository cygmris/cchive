# Requirements Document — configurations-keyring (S4)

## Introduction

S4 delivers the **headline feature**: the real **Configurations** "keyring" screen and the live account/provider switching it drives, wired to the S3 Rust core. It replaces the S2 mock shell state with real data from the IPC layer, renders the Claude‑accounts and API‑providers sections, switches the active configuration safely (subscription swap or provider env merge), captures the currently‑logged‑in Claude account into the OS‑keyring vault, signs accounts out, creates providers from presets, and surfaces an env‑override warning. After S4, a user with two captured Claude accounts can flip between them from the window, and the sidebar switcher + status bar reflect the true active identity. (Full per‑field Config Editor = S5; system tray / autostart / updater = S14; in‑app browser OAuth = future — S4 captures the active login, which is the robust MVP.)

## Alignment with Product Vision

This is `product.md`'s central use case — "switch between Claude Code setups instantly," especially two subscription accounts when one is exhausted. It realizes design checklist items **24–31** (Configurations screen) and **8–10** (sidebar switcher), built on S3's safe switch. It makes Clavis actually *useful*, not just navigable.

## Requirements

### Requirement 1 — Real data source (replace mock)

**User Story:** As a user, I want the app to show my real accounts and active identity, so what I see reflects my actual Claude Code state.

#### Acceptance Criteria
1. `useShellStore` SHALL source accounts, providers, active identity, and status values from `src/lib/ipc.ts` (S3 commands) instead of the S2 mock seed, loaded via TanStack Query on startup and refetched after any mutation.
2. WHEN the IPC layer is unavailable (plain browser / dev gallery) THEN the store SHALL fall back to a clearly‑labelled demo seed so the gallery still works, without crashing.
3. The sidebar active‑config card and the status bar SHALL display the **real** active identity (email/label, tier, model) from `get_active_identity`.

### Requirement 2 — Configurations screen (accounts + providers)

**User Story:** As a user, I want my keyring on one screen, so I can see and switch every Claude account and provider.

#### Acceptance Criteria
1. The Configurations screen SHALL render the "Claude accounts" section (eyebrow + "Add current account" primary) listing vault accounts: radio/active state, avatar, name/email, tier badge, "Active" badge on the live one, and a sign‑out icon button.
2. It SHALL render the "API providers" section (eyebrow + "New provider" split button) listing saved providers: radio/active state, brand chip, title, base URL (mono), model meta, "Active" badge, and an edit affordance.
3. The footer note SHALL state the real persistence consequence ("Switching writes ~/.claude/… — restart your Claude Code session to apply"), shown verbatim/mono for paths.
4. WHEN there are no saved accounts THEN an empty state SHALL invite "Add current account".

### Requirement 3 — Switch active configuration (safe)

**User Story:** As a user whose plan ran out, I want one click to switch, so I keep working without corrupting anything.

#### Acceptance Criteria
1. WHEN a Claude account row is selected THEN the app SHALL call `switch_account(id)` (S3) and, on success, update the active identity everywhere (row, sidebar, status bar) and toast the result + the per‑OS apply note.
2. WHEN an API provider row is selected THEN the app SHALL call `apply_provider` (merge env) and reflect the new active provider; selecting "back to subscription" / an account SHALL behave correctly relative to `clear_provider` semantics.
3. IF a switch fails THEN the app SHALL surface the `CoreError` message (e.g. rolled‑back) and leave the UI on the previously‑active config (no optimistic corruption).
4. The active row SHALL show the `--accent-tint` wash + active styling; only one config is active at a time.

### Requirement 4 — Capture / add the current account

**User Story:** As a user, I want to save my currently‑logged‑in account, so Clavis can switch back to it later.

#### Acceptance Criteria
1. WHEN "Add current account" is used THEN the app SHALL call `add_account_from_active` (S3) to capture the live `claudeAiOauth` + identity into the vault, labelled by email + tier, and the new account SHALL appear in the list.
2. IF the current account is already captured (same email) THEN the app SHALL not duplicate it (update in place) and inform the user.
3. The capture flow SHALL reuse the design's "Sign in with Claude" modal affordance, reworded to reflect capture‑of‑current (with a short explanation that to add a *different* account the user logs into it in Claude Code first, then captures). Full in‑app browser OAuth is explicitly out of scope for S4.

### Requirement 5 — Sign out / remove account (safely)

**User Story:** As a user, I want to remove an account from Clavis, so my keyring stays tidy — without ever stranding me.

#### Acceptance Criteria
1. WHEN sign‑out is used on a non‑active account THEN the app SHALL `remove_account(id)` (vault + metadata) after a confirm, and the row SHALL disappear.
2. IF the account is the currently‑active one THEN the app SHALL warn that removing it only forgets Clavis's saved copy (it does not log Claude Code out) and require explicit confirmation.
3. Removing an account SHALL never delete or alter the live `~/.claude/.credentials.json` (Clavis only forgets its vault copy).

### Requirement 6 — Provider presets & creation

**User Story:** As a user, I want quick provider setup, so I can route to a third‑party endpoint by pasting a key.

#### Acceptance Criteria
1. The "New provider" menu SHALL offer "Blank provider" and presets (Z.ai · GLM‑4.6, Kimi K2, DeepSeek) with prefilled base URL + model.
2. WHEN a preset is chosen and a key entered THEN the app SHALL persist the provider (metadata via store; secret via the vault namespace) and make it switchable.
3. "Blank provider" SHALL create an empty provider and navigate to the Config Editor (full field editing lands in S5); S4 SHALL at least allow naming + key + base URL + model so it is usable.
4. Provider secrets SHALL be handled like account secrets — never surfaced to the webview after entry.

### Requirement 7 — Sidebar switcher reflects & drives real switching

**User Story:** As a user, I want the sidebar switcher to do the real thing, so I can flip identity without opening the screen.

#### Acceptance Criteria
1. The switcher popover SHALL list the real vault accounts + providers with the live active one checked, and selecting one SHALL perform the real switch (Req 3) and close.
2. The "Sign in with Claude" row SHALL trigger the capture flow (Req 4).

### Requirement 8 — Env‑override awareness

**User Story:** As a user, I want to be warned when an env var overrides switching, so I'm not confused when a switch "doesn't take".

#### Acceptance Criteria
1. On load and before a subscription switch, the app SHALL call `detect_env_overrides`; if `CLAUDE_CODE_OAUTH_TOKEN` is set, it SHALL show a clear, non‑blocking warning that file/keychain switching is overridden, with guidance to unset it.

## Non-Functional Requirements

### Code Architecture and Modularity
- The Configurations screen replaces the S2 placeholder under `src/screens/configurations/`; switching logic goes through `src/lib/ipc.ts` + TanStack Query mutations/queries in `src/lib/queries.ts`; the store keeps only ephemeral UI + a thin cache of the active identity.
- No secret ever enters React state beyond a single create/key‑entry form submit; the webview displays labels/metadata only.

### Performance
- A switch reflects in the UI in well under a second; queries are cached and invalidated narrowly after mutations.

### Security
- All secret movement is in Rust (S3). The provider key‑entry form clears the secret from memory after submit. Capabilities stay narrow.

### Reliability
- Optimistic UI is avoided for switches: the UI updates only on the command's success; on failure it stays on the prior config and shows the error. The "add current account" path is the only writer of the vault from the UI, via S3.

### Usability
- Sentence case; mono for emails/paths/URLs/model ids; honest copy about what each action does to disk and that a Claude Code session restart may be needed. Destructive actions (sign‑out) confirm first.
