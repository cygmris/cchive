# Tasks Document — notifications-hook (S12)

> Notifications screen + a Clavis-marked desktop-notification hook in ~/.claude/settings.json (Stop/Notification/PreToolUse). Surgical: preserve the user's existing hooks + all other keys; add/remove only the clavis-notify-marked entry. De-fingerprinted: clavis-notify marker, per-OS command, no server, no fixed port. Atomic writes. Tokens-only styling. Identity app.clavis. Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. Notify-hook backend + notification plugin + Rust tests
  - Files: `src-tauri/src/core/notify_hook.rs` (new), `src-tauri/src/core/mod.rs` (modify), `src-tauri/src/model.rs` (modify), `src-tauri/src/commands/notifications.rs` (new), `src-tauri/src/commands/mod.rs` (modify), `src-tauri/src/lib.rs` (modify), `src-tauri/Cargo.toml` (modify), `src-tauri/capabilities/default.json` (modify)
  - Purpose: install/remove the marked hook surgically + enable the Test notification
  - _Leverage: src-tauri/src/core/(claude_json,atomic_fs,settings).rs, research/modern-impl.md §2.1, ccmate-features.md (drop-fingerprint list)_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - _Prompt: Implement the task for spec notifications-hook, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Rust + Tauri engineer | Task: Add tauri-plugin-notification to Cargo.toml + register it in lib.rs (the builder) + grant notification:default in capabilities/default.json. Add NotificationState (completion, general, tool_use bools) to model.rs. Create core/notify_hook.rs: MARKER = "clavis-notify"; event_for(kind) -> "Stop"|"Notification"|"PreToolUse"; notify_command(kind) -> a per-OS command string embedding the marker (Linux notify-send "Clavis" "MESSAGE" then a "# clavis-notify:KIND" marker; macOS osascript; Windows powershell toast); derive_state(settings_value) -> NotificationState by scanning each event array for a hooks[].command containing the marker; set_enabled(kind, on): read ~/.claude/settings.json, for the mapped event add a marked element ( hooks: [ ( type:"command", command: notify_command ) ] ) if absent OR remove array elements whose command contains the marker, via write_json_preserving + backup (preserve ALL other keys + the user's existing hook elements). Declare in core/mod.rs. commands/notifications.rs: read_notification_state() / set_notification(kind, on) / test_notification(kind) -> Result(_, CoreError) (test_notification uses the notification plugin to fire a toast); declare + register in lib.rs. Rust tests (temp fixture, settings.json seeded with a USER Stop hook + USER PreToolUse hook): set_enabled(Completion,true) adds the marked Stop element WITHOUT removing the user's Stop element; derive_state reports it; set_enabled(Completion,false) removes ONLY the marked element (user's intact); enable twice = single element; three kinds independent; other settings keys preserved. | Restrictions: NEVER use predecessor markers/port; preserve the user's hooks + unknown keys; atomic; idempotent. | Success: cargo test (notify_hook green) + cargo build clean._

- [x] 2. IPC + types + queries
  - Files: `src/lib/ipc.ts` (modify), `src/lib/types.ts` (modify), `src/lib/queries.ts` (modify), `package.json` (modify)
  - Purpose: typed notification hooks
  - _Leverage: src/lib/ipc.ts, @tauri-apps/plugin-notification_
  - _Requirements: 2.2, 2.3, 2.4_
  - _Prompt: Implement the task for spec notifications-hook, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React data engineer | Task: pnpm add @tauri-apps/plugin-notification. Mirror NotificationState + a NotificationKind type ("completion"|"general"|"toolUse") in types.ts; add readNotificationState/setNotification(kind,on) to ipc.ts and a testNotification(kind) that uses @tauri-apps/plugin-notification (request permission then send). Add useNotifications() + useSetNotification() to queries.ts (invalidate notifications; off-Tauri demo state). | Restrictions: components use hooks not invoke; demo fallback; Test requests permission first. | Success: tsc clean; hooks typed._

- [x] 3. Notifications screen
  - Files: `src/screens/notifications/index.tsx`
  - Purpose: the real Notifications screen
  - _Leverage: @/ui (Card, Switch, Button), src/lib/queries.ts (useNotifications), research/design-inventory.md §12_
  - _Requirements: 2.1, 2.2, 2.3_
  - _Prompt: Implement the task for spec notifications-hook, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Replace the notifications placeholder with a Card of three rows, each = label + description + a "Test" Button + a Switch, from useNotifications(): Completion notifications ("Notify when Claude Code finishes a task"), General notifications ("Notify when Claude Code sends a message"), Tool-use notifications ("Notify when Claude Code runs a tool"). Toggle -> useSetNotification(kind) (toast on error, no optimistic corruption); Test -> testNotification(kind) (fires a live desktop notification, request permission first). Tokens only. | Restrictions: toggles reflect the real installed state; honest description that this writes a settings.json hook; tokens only. | Success: screen matches design §12; toggles install/remove hooks; Test fires a notification._

- [x] 4. Tests (frontend)
  - Files: `src/screens/notifications/Notifications.test.tsx`, `src/lib/queries.test.ts` (modify)
  - Purpose: lock the screen + hooks
  - _Leverage: Vitest + Testing Library, mocked ipc + notification plugin_
  - _Requirements: 2.1, 2.2, 2.3_
  - _Prompt: Implement the task for spec notifications-hook, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend QA engineer | Task: Notifications.test.tsx (ipc + plugin mocked): renders the three rows from a mocked useNotifications; toggling a row calls setNotification(kind, on); Test calls testNotification(kind). Extend queries.test.ts for useNotifications. | Restrictions: behavior not implementation; headless; mock backend + plugin. | Success: pnpm test green incl. new suites._

- [x] 5. Verify, fingerprint + hook-safety audit
  - Files: (verify) whole repo
  - Purpose: prove S12 builds, tests pass, no fingerprints, hooks surgical
  - _Leverage: tech.md de-fingerprint rules, ccmate-features.md §9_
  - _Requirements: all_
  - _Prompt: Implement the task for spec notifications-hook, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Release engineer | Task: Run pnpm exec tsc --noEmit (0), pnpm test (green), cd src-tauri && cargo test (notify_hook green) + cargo build (clean), pnpm exec vite build (clean). Fingerprint grep over src + src-tauri/src + configs for ccmate|cc-mate|ccconfig|randynamic|__ccmate__|posthog|phc_|cc-switch|ccswitch|59948|unlock_cc_ext|ic= -> assert ZERO (the marker must be clavis-notify, no predecessor strings, no fixed port). Confirm core/notify_hook only edits settings.json hooks (no credentials/mcpOAuth). Report exact pass/fail. (The orchestrator launches the window, screenshots Notifications, commits.) | Restrictions: fix don't suppress; do not commit. | Success: all gates green and reported; zero fingerprints; hooks surgical._
