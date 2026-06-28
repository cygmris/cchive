# Tasks Document — tray-autostart-packaging (S14)

> System tray quick-switch (reusing core::switch — NO duplicated logic) + autostart + single-instance focus + cross-platform packaging. The tray switch keeps all the safety guarantees (capture/atomic/rollback/preserve mcpOAuth). De-fingerprinted. No fake updater keys committed. Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. System tray + quick-switch menu + Rust test
  - Files: `src-tauri/src/tray.rs` (new), `src-tauri/src/lib.rs` (modify), `src-tauri/capabilities/default.json` (modify if needed)
  - Purpose: the tray icon + dynamic switch menu reusing the safe core
  - _Leverage: src-tauri/src/core/(accounts,switch,providers,keyring_store).rs, S4 get_active_identity, S12 notification plugin_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1_
  - _Prompt: Implement the task for spec tray-autostart-packaging, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Tauri/Rust engineer | Task: Create src-tauri/src/tray.rs: build_tray(app) creates a core TrayIcon with the app icon + a Menu; a build_menu(app) helper lists the vault accounts (core::accounts/keyring_store list) + saved providers (core::providers list) as CHECKABLE items (check on the active id from get_active_identity), plus "Add current account", "Open Clavis", "Quit". A pure menu-model fn (given accounts+providers+active_id -> Vec of (id, label, checked, kind)) is unit-testable. Menu item handler: account -> core::switch::switch_account(id); provider -> core::providers::apply(id) (resolve dirs via app.path()); then app.emit("clavis-switched", identity) + fire a notification ("Now: LABEL") via the plugin; rebuild the menu; "Add current account" -> add_account_from_active; "Open Clavis" -> show+focus the main window; "Quit" -> app.exit(0). Left-click on the tray toggles the main window visibility. Rebuild the menu on each open (menu-on-left-click or a fresh build) so new accounts appear. Wire build_tray + a single-instance callback that shows+focuses the window in lib.rs. Add a Rust unit test for the pure menu-model fn (accounts/providers/active -> expected checkable list). | Restrictions: REUSE core::switch (no duplicated switch logic); same safety guarantees; a failed switch notifies the error + leaves the check on truth; tokens N/A (native menu). | Success: cargo test (menu-model green) + cargo build clean; tray builds._

- [x] 2. Autostart plugin + commands
  - Files: `src-tauri/Cargo.toml` (modify), `src-tauri/src/lib.rs` (modify), `src-tauri/src/commands/app_prefs.rs` (new), `src-tauri/src/commands/mod.rs` (modify), `src-tauri/capabilities/default.json` (modify)
  - Purpose: launch-at-login
  - _Leverage: tauri-plugin-autostart_
  - _Requirements: 2.1, 2.2_
  - _Prompt: Implement the task for spec tray-autostart-packaging, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Tauri engineer | Task: Add tauri-plugin-autostart (2.5.1) to Cargo.toml + register it in lib.rs (with the launch args + MacosLauncher default). Add commands/app_prefs.rs: get_autostart() -> bool (is_enabled) and set_autostart(on: bool) (enable/disable) -> Result(_, CoreError); declare in commands/mod.rs; register in lib.rs; grant the autostart permissions in capabilities/default.json. | Restrictions: autostart registers only the app's own launch; narrow capability. | Success: cargo build clean; get/set_autostart callable._

- [x] 3. Frontend: Launch-at-login toggle + tray switch event listener
  - Files: `src/lib/ipc.ts` (modify), `src/lib/queries.ts` (modify), `src/screens/settings/index.tsx` (modify), `src/App.tsx` (modify)
  - Purpose: the Settings autostart toggle + keep the UI in sync after a tray switch
  - _Leverage: src/lib/ipc.ts, @tauri-apps/api/event, src/i18n_
  - _Requirements: 2.1, 1.2_
  - _Prompt: Implement the task for spec tray-autostart-packaging, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React engineer | Task: Add getAutostart/setAutostart to src/lib/ipc.ts; add useAutostart() + useSetAutostart() to queries.ts (off-Tauri demo). Add a "Launch at login" Switch row to the Settings screen (under Appearance or a new General row) bound to those hooks + an i18n label (add the key to en + the 4 locales). In src/App.tsx, listen for the "clavis-switched" Tauri event (@tauri-apps/api/event listen, isTauri-guarded) and on fire invalidate the activeIdentity + accounts + providers + activity queries (via the query client) so the in-app UI matches a tray switch. | Restrictions: components use hooks; demo fallback; clean up the event listener on unmount. | Success: tsc clean; the toggle reflects/sets autostart; a tray switch refreshes the UI._

- [x] 4. Packaging: bundle config + C-Key icons + README
  - Files: `src-tauri/tauri.conf.json` (modify), `src-tauri/icons/*` (regenerate), `README.md` (modify)
  - Purpose: a properly-branded installable app
  - _Leverage: .design-bundles/assets/logo-tile.svg (C-Key tile), tauri icon_
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2_
  - _Prompt: Implement the task for spec tray-autostart-packaging, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Release engineer | Task: Regenerate the app icon set from the C-Key gradient tile (rsvg-convert .design-bundles/assets/logo-tile.svg to a 1024px PNG, then pnpm tauri icon) so the window/tray/installers use the Clavis mark. Configure tauri.conf.json bundle: active true; targets ["deb","appimage","app","dmg","nsis"]; identifier app.clavis; productName Clavis; a category (e.g. DeveloperTool/Utility) + shortDescription + longDescription (no predecessor strings); copyright the project owner. Update README.md: what Clavis is, build/run/test commands, the tray + launch-at-login features, the de-fingerprinted identity, and a "Enabling updates" section describing the release-time updater step (tauri-plugin-updater + minisign keypair + a hosted latest.json) — do NOT commit any real/placeholder key or endpoint. | Restrictions: no predecessor identifiers/strings; no fake updater key/endpoint; icons from the C-Key tile. | Success: tauri.conf.json valid + branded; icons regenerated; README updated._

- [x] 5. Verify + Linux bundle build + fingerprint audit
  - Files: (verify) whole repo
  - Purpose: prove S14 builds, tests pass, no fingerprints, and a Linux bundle is produced
  - _Leverage: tech.md de-fingerprint rules_
  - _Requirements: all (esp. 4.3)_
  - _Prompt: Implement the task for spec tray-autostart-packaging, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Release engineer | Task: Run pnpm exec tsc --noEmit (0), pnpm test (green), cd src-tauri && cargo test (green) + cargo build (clean), pnpm exec vite build (clean). Then attempt pnpm tauri build (Linux) and report whether an AppImage/deb was produced (this is slow + may need network/system tools — if it fails, capture the exact reason; cargo build + bundle config validity is the minimum gate). Fingerprint grep over src + src-tauri/src + tauri.conf.json + README -> assert ZERO (incl. no fake updater key/endpoint, no predecessor identifiers). Report exact pass/fail of each. Do NOT git commit (orchestrator commits). | Restrictions: fix don't suppress; do not commit. | Success: tsc/test/cargo/vite green, bundle config valid, fingerprints zero; report the tauri build result._
