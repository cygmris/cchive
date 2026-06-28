# Requirements Document — tray-autostart-packaging (S14)

## Introduction

S14 adds the system‑integration layer: a **system tray** with a quick‑switch menu (the fastest path for "one account ran out — flip to the other" without opening the window), **launch‑at‑login** (autostart), confirmation that **single‑instance** focuses the existing window, and **cross‑platform packaging** (app icons from the C‑Key mark, bundle targets for Linux/macOS/Windows, an updated README). The real auto‑updater (signing + a hosted `latest.json`) is documented as a release‑time step (it needs deployment keys/hosting), so the Settings "Check for updates" remains the guarded stub until then.

## Alignment with Product Vision

Realizes `product.md` Feature 13 (system tray quick‑switch) — the headline convenience for the multi‑account workflow — plus launch‑at‑login and the cross‑platform binary goal. It makes Clavis a real, installable, always‑available desktop app.

## Requirements

### Requirement 1 — System tray quick‑switch

**User Story:** As a user whose plan just ran out, I want to switch accounts from the tray, so I don't even open the window.

#### Acceptance Criteria
1. The app SHALL show a tray icon (the C‑Key mark). Left‑click SHALL toggle the main window (show/focus or hide).
2. The tray SHALL have a context menu listing the saved **Claude accounts** and **API providers** (from the vault/index), with a check on the currently‑active one; selecting one SHALL perform the **real switch** (the S3 `switch_account` / `apply_provider`), then update the tray check, emit a UI‑refresh event, and fire a desktop notification ("Now: (label)").
3. The menu SHALL also have "Add current account", "Open Clavis", and "Quit".
4. The menu SHALL rebuild from current data when opened (so newly captured accounts appear) and reflect switch results; a failed switch SHALL notify the error and not change the check.
5. The tray switch SHALL reuse the exact same safe core path as the in‑app switch (no duplicate logic) — capture/atomic/rollback all apply.

### Requirement 2 — Autostart (launch at login)

**User Story:** As a user, I want Clavis to start with my session, so it's always in the tray.

#### Acceptance Criteria
1. A **Launch at login** toggle (in Settings) SHALL enable/disable autostart via `tauri-plugin-autostart`, reflecting the real OS state.
2. The setting SHALL persist across restarts (the OS autostart entry is the source of truth; the toggle reads it).

### Requirement 3 — Single‑instance

**User Story:** As a user, I want one Clavis, so launching it again focuses the existing window.

#### Acceptance Criteria
1. WHEN a second instance launches THEN the existing window SHALL be shown/focused and the second SHALL exit (the S1 single‑instance plugin wired to a focus handler).

### Requirement 4 — Packaging (icons + bundle + README)

**User Story:** As a user, I want a proper installable app with the Clavis icon, so it looks finished.

#### Acceptance Criteria
1. The app icon set SHALL be generated from the C‑Key logo tile (the gradient squircle) for all platforms (the `tauri icon` set), used by the window, tray, and installers.
2. `tauri.conf.json` `bundle` SHALL target Linux (AppImage + deb), macOS (.app/.dmg), and Windows (NSIS/MSI), with correct identifier `app.clavis`, productName, version, category, and a short description — no predecessor identifiers/strings.
3. `pnpm tauri build` SHALL produce a Linux bundle on this machine (the primary verified target); mac/win targets are configured for their CI.
4. The README SHALL document what Clavis is, build/run/test, the tray/autostart features, and the (de‑fingerprinted) identity + the release‑time updater step.

### Requirement 5 — Updater (configured, release‑gated)

**User Story:** As a user, I want updates eventually, with the plumbing in place.

#### Acceptance Criteria
1. The updater SHALL be documented as a release‑time step (add `tauri-plugin-updater` + a signing keypair + a hosted `latest.json` endpoint); the Settings "Check for updates" SHALL remain the guarded stub ("updates not configured yet") until that channel exists.
2. No fake/placeholder update endpoint or key SHALL be committed; the README SHALL describe the steps to enable updates.

## Non-Functional Requirements

### Code Architecture and Modularity
- Backend: `src-tauri/src/tray.rs` (build the tray + menu, handlers calling `core::switch`), wired in `main.rs`/`lib.rs`; `tauri-plugin-autostart` + an `autostart` command pair; reuse `core::keyring_store`/`accounts`/`switch`. Frontend: a "Launch at login" toggle hook in Settings. The tray emits a Tauri event the frontend listens to (invalidate the relevant queries) so the in‑app UI stays in sync after a tray switch.
- No switch logic duplicated — the tray calls the same core functions.

### Performance
- Tray menu builds from cached/quick reads; switching is the same sub‑second operation.

### Security
- The tray switch uses the same safe core (capture/atomic/rollback, preserve `mcpOAuth`); secrets stay in Rust. Autostart only registers the app's own launch. No new broad capabilities.

### Reliability
- A tray switch failure rolls back (core guarantees) and notifies; the menu reflects the true active config; single‑instance never leaves orphan windows.

### Usability
- The tray is the fast path; notifications confirm the switch; the icon is the Clavis C‑Key; the installable bundle is correctly branded.
