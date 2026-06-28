# Tasks Document — polish-and-release (S16)

> Closing pass: live counts everywhere, believable pricing, localized shell, correctness cleanups, final release audit. No new product surface — refinement + proof. Keep every existing test green. De-fingerprinted; identity app.clavis; secrets stay in Rust. Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. App-wide live counts + correctness cleanups
  - Files: `src/App.tsx` (modify), `src/app/Window.tsx` (or Shell — modify), `src/screens/usage/*` (recharts Cell — modify), `src/lib/queries.ts` (remove dead useCreateProvider if unused), `index.html` (modify), `src-tauri/tauri.conf.json` (title — verify)
  - Purpose: status bar/Overview live from any entry screen + small cleanups
  - _Leverage: existing count hooks (useAccounts/useMcpServers/useResources/useUsage), src/app/StatusBar_
  - _Requirements: 1.1, 1.2, 1.3, 4.1, 4.2, 4.4_
  - _Prompt: Implement the task for spec polish-and-release, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Add a useGlobalData() hook (or inline in the Shell/App root) that calls the existing count hooks (useAccounts, useMcpServers, useResources("skill"), useUsage(30)) ONCE at the shell level so the status bar + Overview tiles populate from the shared TanStack cache regardless of the entry screen (rely on query dedup — no refetch storm). Confirm the StatusBar reads those values. Cleanups: resolve the recharts Cell deprecation in the usage charts (current API; visuals unchanged); remove the unused useCreateProvider IF it has zero references (grep first; only if truly dead); ensure index.html title + tauri.conf.json window title are "Clavis" (no framework default), no predecessor strings. VERIFY: pnpm exec tsc --noEmit clean + pnpm test green; booting to a non-Overview screen shows real counts. Report._

- [x] 2. Pricing-tune + Overview hero org enrichment
  - Files: `src-tauri/src/core/usage.rs` (or the cost path — modify), `src-tauri/src/core/claude_json.rs` + `src-tauri/src/commands/*` + `src-tauri/src/model.rs` (active identity org — modify), `src/lib/types.ts` (modify), `src/screens/overview/index.tsx` (hero org — modify)
  - Purpose: a realistic cost estimate + the hero org line
  - _Leverage: S7 usage cost calc, S4 get_active_identity + oauthAccount_
  - _Requirements: 2.1, 2.2, 2.3, 4.3_
  - _Prompt: Implement the task for spec polish-and-release, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Rust + frontend engineer | Task: PRICING: find the cost-estimate rate table (the one that over-charged cache-read tokens, ~$54k earlier). Price cache-read at its real low fraction of input (~0.1x input) and cache-write (~1.25x input) per current public Claude per-model pricing; document the rates inline; add a Rust (or frontend) unit test asserting a known (input, output, cacheRead, cacheWrite) mix yields a sane total with cache-read priced far below input. Keep the estimate labelled an estimate. ORG: extend ActiveIdentity (model.rs + types.ts) with an optional org (organization name from ~/.claude.json oauthAccount); include it in get_active_identity when present (non-secret only); render the Overview account hero sub as "email · org" when org is set, else email. VERIFY: cargo test (pricing green) + cargo build clean + pnpm exec tsc --noEmit clean. Report the corrected total vs the old inflated one._

- [x] 3. App-shell localization (5 locales, zh-Hans complete)
  - Files: `src/i18n/locales/*.json` (modify), `src/app/Sidebar.tsx` + `src/app/StatusBar.tsx` + `src/app/CommandPalette.tsx` (modify), `src/ui/*ScreenHeader*` + the screen headers (modify)
  - Purpose: the shell speaks the user's language
  - _Leverage: S13 i18n (t, locales), src/app/*_
  - _Requirements: 3.1, 3.2, 3.3_
  - _Prompt: Implement the task for spec polish-and-release, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend i18n engineer | Task: Add namespaced keys nav.* (the sidebar nav labels), header.* (each screen title + subtitle), status.* (status bar), palette.* (command palette), common.* (Save/Cancel/Switch/Test/Add/Delete/Restore/etc.) to en.json and translate them in zh-Hans (COMPLETE + accurate), zh-Hant, ja, fr. Replace the hardcoded strings in Sidebar/StatusBar/CommandPalette and the screen headers with t() lookups. Switching language must visibly localize the shell (nav + headers + common actions). Deep per-field body strings may remain en-fallback (documented). VERIFY: pnpm exec tsc --noEmit clean + pnpm test green; switching to zh-Hans localizes the nav + headers. Report which surfaces are localized._

- [x] 4. Tests + final release audit
  - Files: `src/**/*.test.tsx` (add a couple), (verify) whole repo
  - Purpose: lock the changes + prove release-ready
  - _Leverage: Vitest, tech.md de-fingerprint rules_
  - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - _Prompt: Implement the task for spec polish-and-release, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Release engineer | Task: Add focused tests: the shell shows count values from a mocked cache regardless of active screen; the Overview hero shows org when present; a nav label localizes with language. Then run the FULL release gate: pnpm exec tsc --noEmit (0), pnpm test (green), cd src-tauri && cargo test (green) + cargo build (clean), pnpm exec vite build (clean). AUDIT: fingerprint grep over the whole repo source + configs AND git log messages (git log --format=%B | grep -iE ...) for ccmate|cc-mate|ccconfig|randynamic|__ccmate__|posthog|phc_|cc-switch|ccswitch|59948|unlock_cc_ext|ic= -> assert ZERO. SECRET-LEAK: grep the Rust commands/ for any handler returning a token/key field (assert commands return labels/metadata only). Report exact pass/fail of every gate + the audit. Do NOT git commit (the orchestrator runs the desktop smoke screenshot + commits). | Restrictions: fix don't suppress; do not commit._
