# Tasks Document — config-editor (S5)

> Two halves: provider persistence backend (store index + vault token, fixes the S4 gap) and the schema-driven Config Editor. Secrets stay in Rust; the editor shows the token only as "set/not set", never the value. Safe writes (atomic, preserve unknown keys). Tokens-only styling, no hardcoded hex. Identity app.clavis, no predecessor fingerprints. Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. Provider model + persistence core
  - Files: `src-tauri/src/model.rs` (modify), `src-tauri/src/core/providers.rs` (new), `src-tauri/src/core/mod.rs` (modify)
  - Purpose: persist providers (store index + vault token) with a full settings payload
  - _Leverage: src-tauri/src/core/(atomic_fs,settings,keyring_store).rs, research/design-inventory.md §4_
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _Prompt: Implement the task for spec config-editor, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Rust engineer | Task: Extend model.rs with ProviderConfig (id,title,brand,env,config), ProviderEnv (baseUrl,model,defaultSonnet,defaultHaiku,maxThinkingTokens?,maxOutputTokens?,httpsProxy?,disableTelemetry? — NO token), ProviderSettings (cleanupPeriodDays?,includeCoAuthoredBy?,outputStyle?,forceLoginMethod?,forceLoginOrgUuid?,enableAllProjectMcpServers?,enabledMcpServers?), ProviderConfigView (payload + hasToken: bool, NO token value), and an input mirror for upsert. Create core/providers.rs: a store-backed index persisted as JSON (path under the app config dir, OR a providers.json next to the Clavis store — reuse the same mechanism tauri-plugin-store uses; you may persist via a plain JSON file written with atomic_fs since the Rust side cannot easily call the JS store plugin — use a clavis-managed providers.json in the config dir) holding metadata+payload; the auth token in keyring service "app.clavis.providers" key=id. Functions: list()-> Vec(ProviderMeta), get(id)->ProviderConfigView, upsert(input, new_token: Option(String)), delete(id) (index+token), apply(id) (compose env incl. vaulted token + config keys, merge into settings.json via settings::merge + atomic_fs, preserving other keys). Declare the module in core/mod.rs. | Restrictions: NO token in any returned view; reuse atomic_fs/settings/keyring_store; preserve unknown settings keys. | Success: cargo build clean; module compiles and is unit-testable._

- [x] 2. Provider commands (CRUD + apply) + Rust tests
  - Files: `src-tauri/src/commands/providers.rs` (modify), `src-tauri/src/lib.rs` (modify)
  - Purpose: expose the persisted provider surface to the UI
  - _Leverage: src-tauri/src/core/providers.rs, src-tauri/src/model.rs_
  - _Requirements: 1.2, 1.3, 1.4, 4.1, 4.4_
  - _Prompt: Implement the task for spec config-editor, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Tauri + Rust engineer | Task: Update commands/providers.rs: list_providers (now from core::providers index), get_provider(id)->ProviderConfigView, save_provider(input, token: Option(String)) (upsert), delete_provider(id), apply_provider(id) (id-based, core::providers::apply), keep clear_provider. Register new commands in lib.rs generate_handler!. Add Rust unit tests (temp fixture + mock vault/store path): upsert then list/get returns the provider with hasToken correct and NO token value in the view JSON; delete removes index+token; apply merges the full payload into settings.json preserving other keys; token round-trips only through the vault. | Restrictions: every command returns Result(_, CoreError) with no token field; preserve unknown keys on apply. | Success: cargo test green (new provider tests) + cargo build clean._

- [x] 3. Editor field schema
  - Files: `src/screens/config-editor/schema.ts`
  - Purpose: the declarative section/field/control definition
  - _Leverage: research/design-inventory.md §4 (exact fields)_
  - _Requirements: 3.1, 3.2_
  - _Prompt: Implement the task for spec config-editor, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Create src/screens/config-editor/schema.ts exporting the sections (Common/General/Auth & Login/MCP/Environment) and, for each, the exact fields from design-inventory §4 with: key, label, description, control ('text'|'secret'|'number'|'bool'|'enum'), options (for enum/bool), default, placeholder, and which provider env/config path it maps to. Include all fields listed in requirements 3.2 verbatim. | Restrictions: data only (no markup); map each field to its ProviderEnv/ProviderSettings key. | Success: schema typed; one array drives the whole editor._

- [x] 4. Provider queries + editor routing state
  - Files: `src/lib/queries.ts` (modify), `src/lib/store.ts` (modify), `src/lib/ipc.ts` (modify), `src/lib/types.ts` (modify)
  - Purpose: typed hooks for the editor + the editingProviderId routing
  - _Leverage: src/lib/ipc.ts, model.rs DTOs (mirror in types.ts)_
  - _Requirements: 1.2, 2.1, 4.1, 4.4_
  - _Prompt: Implement the task for spec config-editor, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React data engineer | Task: Mirror the new DTOs (ProviderConfigView, ProviderConfigInput, ProviderEnv, ProviderSettings — no token) in src/lib/types.ts; add ipc wrappers getProvider/saveProvider/deleteProvider in ipc.ts. Add queries useProvider(id)/useSaveProvider()/useDeleteProvider() to queries.ts (invalidate providers + provider:id; surface CoreError). Add editingProviderId + setEditingProvider to the store (set by Configurations edit/new; read by the editor). Keep the demo fallback. | Restrictions: no token in any type/hook; components use hooks not invoke. | Success: tsc clean; hooks typed._

- [x] 5. Config Editor screen (nav + search + field rows + Save/Delete)
  - Files: `src/screens/config-editor/index.tsx`, `src/screens/config-editor/FieldRow.tsx`, `src/screens/config-editor/SectionNav.tsx`
  - Purpose: the schema-driven editor UI
  - _Leverage: src/screens/config-editor/schema.ts, src/lib/queries.ts, @/ui (Input, Select, Button, IconButton, Card), src/app/ScreenHeader_
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2_
  - _Prompt: Implement the task for spec config-editor, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Replace the config-editor placeholder with the real screen: back link "‹ Configurations" (go('configs')) + editing title + right-aligned Delete (danger-on-hover, confirm -> useDeleteProvider -> go('configs')) and Save primary; two-column body = sticky SectionNav (All settings + the 5 sections) + a field area rendering FieldRow per schema entry filtered by selected section AND the "Search settings…" query. FieldRow renders the right control by schema.control: text/number Input, secret Input (masked, show/hide, "set/not set" from useProvider().hasToken, only sends a new value when typed), bool Select (Default/true/false), enum Select (options). Controlled form state seeded from useProvider(editingProviderId) (base URL/model/etc; secret as set/not-set). Save -> validate (URL when present, numeric numbers, UUID shape when present; inline errors) -> useSaveProvider(input, token?) -> toast + reflect. Blank/new provider (no editingProviderId or a new draft) -> empty fields + default name + "not configured yet" hint. | Restrictions: secret never displays the stored value; Save does not switch the active config; tokens-only styling; no optimistic corruption. | Success: editor renders all 5 sections' fields with correct controls; Save validates+persists; Delete confirms+removes; matches design §4._

- [x] 6. Wire Configurations + CreateProviderForm to real persistence
  - Files: `src/screens/configurations/ProviderRow.tsx` (modify), `src/screens/configurations/NewProviderMenu.tsx` (modify), `src/screens/configurations/CreateProviderForm.tsx` (modify), `src/screens/configurations/index.tsx` (modify)
  - Purpose: edit/new/preset now open the editor / persist via save_provider (fixes the S4 gap)
  - _Leverage: src/lib/store.ts (setEditingProvider), src/lib/queries.ts (useSaveProvider)_
  - _Requirements: 2.1, 5.1, 1.3_
  - _Prompt: Implement the task for spec config-editor, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: ProviderRow edit -> setEditingProvider(id) + go('editor'). NewProviderMenu "Blank provider" -> setEditingProvider(null/new-draft) + go('editor'); presets -> open CreateProviderForm which now calls save_provider (persist to the index + vault) instead of the S4 apply-only path, so created providers survive list_providers; after create, the provider appears in the list. Ensure the Configurations list (useProviders) now shows persisted providers. | Restrictions: secret cleared after submit; tokens-only styling. | Success: a preset/blank provider persists and is listed + editable; edit opens the editor with the provider loaded._

- [x] 7. Tests (backend providers + frontend editor)
  - Files: `src/screens/config-editor/ConfigEditor.test.tsx`, `src/lib/queries.test.ts` (modify)
  - Purpose: lock the editor behavior + provider hooks
  - _Leverage: Vitest + Testing Library, mocked @tauri-apps/api/core_
  - _Requirements: 3.1, 4.1, 4.2, 4.3, 4.4_
  - _Prompt: Implement the task for spec config-editor, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend QA engineer | Task: ConfigEditor.test.tsx (IPC mocked): renders all five sections' fields from the schema; section nav + search filter; editing updates state; Save validates (blocks on bad URL/number/UUID) then calls saveProvider with the right payload and only sends a token when entered; Delete confirms then calls deleteProvider + navigates; the secret control never shows a stored value and reflects set/not-set. Extend queries.test.ts for useProvider/useSaveProvider/useDeleteProvider (right ipc cmd + invalidation). (Rust provider tests are in task 2.) | Restrictions: behavior not implementation; headless; mock backend. | Success: pnpm test green incl. new suites._

- [x] 8. Verify, desktop screenshot, fingerprint + token-leak audit
  - Files: (verify) whole repo
  - Purpose: prove S5 builds, tests pass, renders, and leaks no secrets
  - _Leverage: tech.md de-fingerprint rules, spectacle/grim_
  - _Requirements: all_
  - _Prompt: Implement the task for spec config-editor, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Release engineer | Task: Run pnpm exec tsc --noEmit (0), pnpm test (green), cd src-tauri && cargo test (provider tests green) + cargo build (clean), pnpm exec vite build (clean). Fingerprint grep over src + src-tauri/src + configs -> zero. Token-leak: assert no provider command/view/type carries a token value, and the editor secret control never renders a stored token. Report exact pass/fail. (The orchestrator launches the real window, screenshots the Config Editor, and commits.) | Restrictions: fix don't suppress; do not commit. | Success: all gates green and reported; zero fingerprints; no token leak._
