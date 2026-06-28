# Tasks Document — configurations-keyring (S4)

> Wire the S3 engine into the real Configurations keyring. All backend access via `src/lib/queries.ts` -> `src/lib/ipc.ts` (never call invoke from components). Secrets stay in Rust; the webview shows labels/metadata only. Tokens never in React state beyond a single form submit. Tokens-only styling, no hardcoded hex. Identity `app.clavis`, no predecessor fingerprints. Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. TanStack Query data layer + provider
  - Files: `src/lib/queries.ts`, `src/App.tsx` (modify), `package.json` (modify)
  - Purpose: typed query/mutation hooks over the S3 IPC commands, with a non-Tauri demo fallback
  - _Leverage: src/lib/ipc.ts, src/lib/types.ts (S3), @tanstack/react-query_
  - _Requirements: 1.1, 1.2, 3.x, 4.x, 5.x, 6.x, 8.1_
  - _Prompt: Implement the task for spec configurations-keyring, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React data-layer engineer | Task: pnpm add @tanstack/react-query. Add a QueryClient + QueryClientProvider in src/App.tsx (wrapping the shell, inside ThemeProvider/ToastProvider). Create src/lib/queries.ts with query hooks (useAccounts, useProviders, useActiveIdentity, useEnvOverrides, useSettingsSummary) and mutation hooks (useSwitchAccount, useApplyProvider, useClearProvider, useAddCurrentAccount, useRemoveAccount, useCreateProvider) wrapping src/lib/ipc.ts; each mutation invalidates the relevant queries on success and exposes the CoreError message on failure. When not running under Tauri (isTauri false), queries resolve to a clearly-labelled DEMO seed (so the gallery works) and mutations are no-ops that surface "desktop app only". | Restrictions: components must use these hooks, never invoke directly; no secret cached in query state; demo fallback must be obviously labelled. | Success: tsc clean; hooks typed against S3 DTOs; provider mounted._

- [x] 2. Refactor shell store to real active identity
  - Files: `src/lib/store.ts` (modify)
  - Purpose: store keeps only UI state + a thin active-identity cache fed by queries; drop the mock seed
  - _Leverage: src/lib/queries.ts, src/lib/types.ts_
  - _Requirements: 1.1, 1.3_
  - _Prompt: Implement the task for spec configurations-keyring, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React state engineer | Task: Refactor src/lib/store.ts to keep activeScreen/paletteOpen/switcherOpen (+ setters) and a thin activeIdentity cache (label/email/tier/model) plus mcp/skills/tokens display values, but REMOVE the hardcoded mock accounts/providers seed (real data now comes from queries). Add a setActiveIdentity used by the queries layer to hydrate the cache so Sidebar/StatusBar render instantly. Keep go/togglePalette/toggleSwitcher. Ensure existing store tests still pass (update them for the new shape). | Restrictions: do not duplicate the query cache; no secrets; keep the store the only UI-state holder. | Success: tsc clean; store tests updated + green._

- [x] 3. Configurations screen + account/provider rows + footer/empty state
  - Files: `src/screens/configurations/index.tsx`, `src/screens/configurations/AccountRow.tsx`, `src/screens/configurations/ProviderRow.tsx`
  - Purpose: the real keyring screen (replaces the S2 placeholder)
  - _Leverage: @/ui (Card, Badge/ProviderChip, Button, IconButton, Radio), src/app/AccountSwitcher AccountAvatar, src/lib/queries.ts, research/design-inventory.md §3_
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.4, 5.1, 5.2_
  - _Prompt: Implement the task for spec configurations-keyring, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Replace the Configurations placeholder with the real screen: ScreenHeader + EnvOverrideBanner slot; "Claude accounts" section (eyebrow + "Add current account" primary opening AddAccountModal) listing useAccounts() rows via AccountRow (avatar, name/email mono, tier Badge, Active badge on the live one from useActiveIdentity, radio select -> useSwitchAccount, sign-out IconButton -> confirm -> useRemoveAccount); "API providers" section (eyebrow + NewProviderMenu) listing useProviders() rows via ProviderRow (ProviderChip, title, base URL mono, model meta, Active badge, select -> useApplyProvider, edit -> go('editor')); a verbatim/mono footer note about writing ~/.claude files + restart; an empty state inviting "Add current account" when no accounts. Active row gets the --accent-tint wash. | Restrictions: switches update UI only on mutation success (no optimistic corruption); errors toast; tokens never shown; tokens-only styling. | Success: screen renders real accounts/providers; selecting a row triggers the right mutation; matches the design §3 layout._

- [x] 4. Add-current-account modal (capture flow)
  - Files: `src/screens/configurations/AddAccountModal.tsx`
  - Purpose: capture the currently-logged-in Claude account into the vault
  - _Leverage: @/ui/Modal, @/ui/Button, src/lib/queries.ts (useAddCurrentAccount), research/design-inventory.md §15_
  - _Requirements: 4.1, 4.2, 4.3_
  - _Prompt: Implement the task for spec configurations-keyring, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Build AddAccountModal reusing @/ui/Modal (~380px, the design's sign-in card reworked): clay logo tile, title "Add this account", body explaining it captures the account currently logged into Claude Code (and that to add a DIFFERENT account you log into it in Claude Code first, then capture again). Primary "Capture current account" -> useAddCurrentAccount (on success toast the captured email+tier and close; if already captured (same email), inform "updated"); secondary "Cancel". Controlled open state (store or local) shared with the Configurations "Add current account" button and the sidebar switcher "Sign in" row. | Restrictions: no full browser OAuth (out of scope); no secret displayed; honest copy. | Success: capture adds/refreshes the account in the list; dedupe message on existing email._

- [x] 5. New-provider menu + create-provider form
  - Files: `src/screens/configurations/NewProviderMenu.tsx`, `src/screens/configurations/CreateProviderForm.tsx`
  - Purpose: preset-driven provider creation
  - _Leverage: @/ui/Popover, @/ui/Modal, @/ui/Input, @/ui/Button, src/lib/queries.ts (useCreateProvider), research/design-inventory.md §3_
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - _Prompt: Implement the task for spec configurations-keyring, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: NewProviderMenu (@/ui/Popover split button): "Blank provider" + presets Z.ai (https://api.z.ai/api/anthropic, glm-4.6), Kimi K2 (https://api.moonshot.cn/anthropic, kimi-k2-turbo), DeepSeek (https://api.deepseek.com/anthropic, deepseek-v4). Selecting a preset opens CreateProviderForm (a @/ui/Modal) prefilled with name/baseUrl/model + a secret key Input (masked); submit -> useCreateProvider (metadata to store, secret to vault) then make it switchable; "Blank provider" -> create empty + go('editor'). Validate that a key + base URL are present before submit; clear the secret from state after submit. | Restrictions: secret never persisted in component state after submit, never displayed; tokens-only styling. | Success: a preset provider can be created with a pasted key and then selected/applied._

- [x] 6. Env-override banner
  - Files: `src/screens/configurations/EnvOverrideBanner.tsx`
  - Purpose: warn when CLAUDE_CODE_OAUTH_TOKEN overrides switching
  - _Leverage: @/ui/Card, src/lib/queries.ts (useEnvOverrides), research/modern-impl.md §6 (G5)_
  - _Requirements: 8.1_
  - _Prompt: Implement the task for spec configurations-keyring, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Build EnvOverrideBanner: when useEnvOverrides() reports CLAUDE_CODE_OAUTH_TOKEN set, render a non-blocking warning (amber/warning tint) explaining file/keychain switching is overridden and to unset the var; dismissible for the session. Render it at the top of the Configurations screen (and optionally near the sidebar switcher). | Restrictions: non-blocking; tokens-only styling (warning semantic). | Success: banner appears only when the override is present and reads clearly._

- [x] 7. Rewire sidebar switcher + sidebar card + status bar to real data
  - Files: `src/app/AccountSwitcher.tsx` (modify), `src/app/Sidebar.tsx` (modify), `src/app/StatusBar.tsx` (modify)
  - Purpose: the shell chrome reflects + drives real switching
  - _Leverage: src/lib/queries.ts, src/screens/configurations/AddAccountModal_
  - _Requirements: 1.3, 3.1, 7.1, 7.2_
  - _Prompt: Implement the task for spec configurations-keyring, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Rewire AccountSwitcher to list real useAccounts()/useProviders() with the live active one checked (useActiveIdentity), selecting -> the real switch mutation (close on success), and "Sign in with Claude" -> open AddAccountModal. Update Sidebar's active-config card + StatusBar to read the real active identity/model/counts from the queries/store cache instead of the mock. Preserve the demo fallback so the gallery still renders. | Restrictions: no invoke in components (use queries); tokens-only; no optimistic corruption. | Success: switching from the sidebar performs a real switch and updates the card + status bar._

- [x] 8. Tests for queries, configurations screen, modal
  - Files: `src/lib/queries.test.ts`, `src/screens/configurations/Configurations.test.tsx`, `src/screens/configurations/AddAccountModal.test.tsx`
  - Purpose: lock the data layer + screen behavior (IPC mocked)
  - _Leverage: Vitest + Testing Library, mocked @tauri-apps/api/core_
  - _Requirements: 1.1, 3.1, 4.1, 5.1, 8.1_
  - _Prompt: Implement the task for spec configurations-keyring, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend QA engineer | Task: With @tauri-apps/api/core mocked: queries.test.ts — each hook calls the right ipc command; a mutation invalidates and surfaces an error on failure. Configurations.test.tsx — renders accounts/providers from mocked queries; selecting an account row calls switch; sign-out asks confirm then calls remove; empty state when no accounts; env banner shows when override present. AddAccountModal.test.tsx — capture calls addCurrentAccount; existing-email shows the updated/dedupe message. | Restrictions: behavior not implementation; headless; mock the backend. | Success: pnpm test green including the new suites._

- [x] 9. Verify, desktop screenshot, fingerprint + token-leak audit
  - Files: (verify) whole repo
  - Purpose: prove S4 builds, tests pass, renders in the real window, and leaks no secrets
  - _Leverage: tech.md de-fingerprint rules, spectacle/grim_
  - _Requirements: all_
  - _Prompt: Implement the task for spec configurations-keyring, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Release engineer | Task: Run pnpm exec tsc --noEmit (0), pnpm test (green), cargo build (clean), pnpm exec vite build (clean). Fingerprint grep over src + src-tauri/src + configs -> zero. Token-leak grep: assert no accessToken/refreshToken value is rendered or stored in any component/query (only labels/metadata). Report exact pass/fail. (The orchestrator will launch the real Tauri window and screenshot the Configurations screen + commit.) | Restrictions: fix don't suppress; do not commit. | Success: all gates green and reported; zero fingerprints; no token leak._
