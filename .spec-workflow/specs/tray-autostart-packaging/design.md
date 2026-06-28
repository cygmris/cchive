# Design Document — tray-autostart-packaging (S14)

## Overview

`src-tauri/src/tray.rs` builds a tray icon (C‑Key) + a context menu listing the vault accounts + providers (active one checked) whose item handlers call the same `core::switch` functions as the in‑app UI, then emit a `clavis://switched` Tauri event (frontend invalidates queries) and fire a notification. Left‑click toggles the window. `tauri-plugin-autostart` powers a "Launch at login" toggle in Settings. The S1 single‑instance plugin gets a focus callback. `tauri.conf.json` `bundle` is configured for Linux/macOS/Windows from the C‑Key icon. The real updater is documented as a release step (no fake keys committed).

## Steering Document Alignment

### Technical Standards (tech.md)
- Tray via core `TrayIcon` (no extra plugin). `tauri-plugin-autostart` 2.5.1. Reuse `core::{keyring_store, accounts, switch}` (no duplicated switch logic). The notification plugin (S12) for the tray switch toast. Narrow capabilities.

### Project Structure (structure.md)
- `src-tauri/src/tray.rs` (+ wired in `lib.rs`); `commands/app_prefs.rs` (or extend) for `get_autostart`/`set_autostart`; `src/screens/settings/` adds the toggle; a frontend tray‑event listener in `App.tsx`/`queries`. `tauri.conf.json` bundle + icons; `README.md`.

## Code Reuse Analysis

### Existing Components to Leverage
- **S3** `core::accounts`/`core::switch` (`switch_account`, `add_account_from_active`), `core::providers` (`apply`), `keyring_store` (vault list). **S4** `get_active_identity` for the check. **S12** notification plugin. **S1** single‑instance plugin + the C‑Key `logo-tile` (already generates icons).

### Integration Points
- Tray menu ↔ `core::switch` (same path as in‑app) ↔ a `switched` event ↔ frontend query invalidation. Autostart ↔ `tauri-plugin-autostart` ↔ Settings toggle. Bundle/icons ↔ `tauri.conf.json`.

## Architecture

```mermaid
graph TD
    Tray[tray.rs: icon + dynamic menu] -->|account/provider click| SW[core::switch / providers::apply]
    Tray -->|left-click| Win[show/hide window]
    SW --> EV[emit "switched" event] --> FE[frontend: invalidate queries]
    SW --> NOTE[notification: Now: label]
    Settings[Settings: Launch at login] --> AUTO[tauri-plugin-autostart]
    SI[single-instance] --> Win
    CONF[tauri.conf.json bundle + C-Key icons] --> Pkg[(installers)]
```

### Modular Design Principles
- The tray is a thin adapter over `core::switch` — zero duplicated logic. Autostart is a command pair over the plugin. The frontend reacts to one `switched` event. Packaging is configuration only.

## Components and Interfaces

### src-tauri/src/tray.rs
- `build_tray(app)` — create the `TrayIcon` with the app icon, a menu, and handlers. `rebuild_menu(app)` (on menu open) — list accounts (`core::accounts`/vault) + providers + the active id; build checkable items + "Add current account" / "Open Clavis" / "Quit". Item handlers: account → `core::switch::switch_account(id)`; provider → `core::providers::apply(id)`; then `app.emit("clavis-switched", identity)` + a notification; "Add current account" → `add_account_from_active`; "Open Clavis" → show/focus; "Quit" → exit. Left‑click → toggle window visibility.

### commands (autostart)
- `get_autostart() -> bool` / `set_autostart(on)` over `tauri-plugin-autostart` (`enable`/`disable`/`is_enabled`) → `Result<_, CoreError>`; registered.

### single‑instance (lib.rs)
- The single‑instance callback shows + focuses the main window (and could consume a deep‑link arg later).

### Frontend
- `Settings`: a "Launch at login" `Switch` row bound to `useAutostart()`/`useSetAutostart()`. `App.tsx`: listen for `clavis-switched` (via `@tauri-apps/api/event`) → invalidate `activeIdentity` + accounts/providers/activity queries so the in‑app UI matches a tray switch.

### Packaging
- `tauri.conf.json` `bundle`: `active: true`, `targets: ["deb","appimage","app","dmg","nsis"]` (built per‑OS), `icon` from the generated C‑Key set, `identifier: app.clavis`, `category`, `shortDescription`, `longDescription`. `README.md`: what/build/run/test/features/identity/updater‑step.

## Data Models
- No new persisted models. The tray reads the same account/provider/identity data. Autostart state lives in the OS.

## Error Handling
1. **Tray switch fails:** `core::switch` rolls back; notify the error; the menu check stays on the prior active (rebuilt from truth).
2. **Autostart toggle fails (unsupported env):** toast/log; the toggle reflects the real `is_enabled`.
3. **Icon/build missing:** `tauri icon` regenerates; build fails loudly if misconfigured.
4. **Window already shown on left‑click:** hide (toggle), don't error.

## Testing Strategy

### Backend (Rust)
- The switch path is already covered by S3 tests; the tray reuses it. Add a unit test for the menu‑model builder (given accounts/providers/active id → the expected checkable item list + labels), pure and injectable.

### Frontend (Vitest)
- The `clavis-switched` listener invalidates the right queries (mock the event API). The "Launch at login" toggle calls `setAutostart`.

### Manual (desktop, Linux)
- The tray icon appears; its menu lists the captured account(s) + providers with the active checked; selecting one switches (real) + notifies + the window updates; left‑click toggles the window; Launch‑at‑login registers the autostart entry; `pnpm tauri build` produces an AppImage/deb with the C‑Key icon.
