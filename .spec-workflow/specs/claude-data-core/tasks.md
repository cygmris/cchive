# Tasks Document — claude-data-core (S3)

> Privileged Rust core. Safety first: capture-before-write, atomic temp+fsync+rename, 0600, rotating backups, rollback, preserve unknown keys + `mcpOAuth`. Secrets NEVER cross IPC to the webview. Identity `app.clavis`, no predecessor fingerprints. Authoritative reference: `.spec-workflow/research/modern-impl.md` (§1.7 algorithm, §3 keyring, §5 paths, §6 gotchas G1–G12). Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. Cargo deps + shared model + module skeleton
  - Files: `src-tauri/Cargo.toml` (modify), `src-tauri/src/model.rs`, `src-tauri/src/lib.rs` (modify), `src-tauri/src/core/mod.rs`, `src-tauri/src/commands/mod.rs`
  - Purpose: add deps, declare all modules, define shared serde DTOs + error type
  - _Leverage: tech.md (Rust deps), research/modern-impl.md §0_
  - _Requirements: 7.1, 7.2_
  - _Prompt: Implement the task for spec claude-data-core, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Rust engineer | Task: Add Cargo deps keyring="3" (Linux feature for the dbus-secret-service vendored backend), serde/serde_json with the preserve_order feature, dirs, thiserror, and tempfile as a dev-dependency. Create src/model.rs with serde-Serialize DTOs that carry NO token fields — AccountMeta, ProviderMeta, ActiveIdentity, SwitchResult, EnvOverrides, SettingsSummary — and a CoreError enum (thiserror) that serializes to a stable string/code for the frontend. Declare core and commands modules; create core/mod.rs (pub mod paths; atomic_fs; credentials; keyring_store; claude_json; settings; switch;) and commands/mod.rs (accounts; providers; settings;) with the referenced files as compiling stubs (empty pub fns or todo!-free no-ops) so the crate builds. Wire mod core; mod commands; mod model; into lib.rs. | Restrictions: stubs must compile; NO token field on any DTO; no predecessor strings. | Success: cargo build is clean with the skeleton in place._

- [x] 2. core/paths.rs — cross-platform path resolution + env override detection
  - Files: `src-tauri/src/core/paths.rs`
  - Purpose: resolve every Claude path per OS and detect overriding env vars
  - _Leverage: research/modern-impl.md §5, §1.6_
  - _Requirements: 1.1, 1.2, 1.3_
  - _Prompt: Implement the task for spec claude-data-core, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Rust engineer | Task: Implement core/paths.rs: claude_dir() honoring CLAUDE_CONFIG_DIR else home/.claude (home via dirs::home_dir); credentials_path/settings_path/claude_md/agents_dir/commands_dir/skills_dir/projects_dir/backups_dir; dot_claude_json() = HOME/.claude.json (sibling of .claude, NOT inside it); macos_keychain_service() returning the "Claude Code-credentials" + user account descriptor; detect_env_overrides() returning EnvOverrides flagging CLAUDE_CODE_OAUTH_TOKEN (and noting ANTHROPIC_* presence). Add unit tests that set CLAUDE_CONFIG_DIR to a temp dir and assert each path; assert dot_claude_json is at HOME not under the config dir. | Restrictions: never hardcode /home or C:\\Users; pure path logic (no writes). | Success: cargo test for paths passes on this Linux box._

- [x] 3. core/atomic_fs.rs — atomic write, backup/rollback, preserve-keys JSON
  - Files: `src-tauri/src/core/atomic_fs.rs`
  - Purpose: the safe write primitive used by every writer
  - _Leverage: research/modern-impl.md §6 (G2, G11), serde_json preserve_order_
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - _Prompt: Implement the task for spec claude-data-core, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Rust systems engineer | Task: Implement core/atomic_fs.rs: atomic_write(path, bytes, mode: Option) — write a temp file in the SAME directory, fsync, rename over target, then chmod to mode (0600) on unix; backup(path) -> Option(BackupHandle) writing path.clavis.bak.(epoch_millis) and rotating to keep up to 10 (prune oldest); restore(BackupHandle); read_json_value(path); and write_json_preserving(path, mutate) that reads serde_json::Value (preserve_order), applies a FnOnce mutation to targeted keys only, and atomic_writes it back — preserving all unknown keys and order. Pass epoch via a small now_millis() helper using std::time (NOT a workflow-forbidden API). Unit tests (tempfile): atomic_write sets 0600 and leaves no temp; backup+restore round-trips; rotation keeps up to 10; write_json_preserving keeps unknown keys + order. | Restrictions: never truncate-in-place; same-dir temp for atomic rename; no panics on IO error (return Result). | Success: cargo test for atomic_fs passes._

- [x] 4. core/keyring_store.rs — OS-keyring account vault
  - Files: `src-tauri/src/core/keyring_store.rs`
  - Purpose: store/retrieve each saved account's secret blob in the OS keyring
  - _Leverage: research/modern-impl.md §3.1, keyring crate_
  - _Requirements: 4.1, 4.3_
  - _Prompt: Implement the task for spec claude-data-core, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Rust security engineer | Task: Implement core/keyring_store.rs using the keyring crate: service "app.clavis.accounts", entry key = account id; vault_put(id, blob_json_string), vault_get(id) -> Result(String), vault_delete(id), vault_has(id). Keep this the ONLY place that touches the Clavis vault namespace; never log secret values. Add a cfg(test) path that can use a mock/in-memory backend if the CI keyring is unavailable (feature-gate or a trait) so tests do not require a live Secret Service. | Restrictions: secrets stay as opaque strings; do not expose blobs to commands except via the switch flow; no token logging. | Success: cargo test for keyring_store passes (mock backend acceptable in headless test)._

- [x] 5. core/claude_json.rs + core/settings.rs — JSON editors (preserve unknown keys)
  - Files: `src-tauri/src/core/claude_json.rs`, `src-tauri/src/core/settings.rs`
  - Purpose: edit ~/.claude.json identity + settings.json env without dropping keys
  - _Leverage: src/core/atomic_fs.rs (write_json_preserving), research/modern-impl.md §1.3, §1.5, §2.1_
  - _Requirements: 2.5, 3.4, 6.1, 6.2_
  - _Prompt: Implement the task for spec claude-data-core, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Rust engineer | Task: core/claude_json.rs: read_oauth_account() (oauthAccount + userID, non-secret), write_identity(oauth_account_value, user_id) via atomic_fs::write_json_preserving (keep mcpServers/projects/all other keys), and read_settings_summary helpers as needed. core/settings.rs: merge_env(map) shallow-merges into settings.json env preserving other keys; clear_env() removes only env; read_summary() returns SettingsSummary (model, has_env, top-level key names). All via write_json_preserving + backup. Unit tests (tempfile): merge_env adds env but keeps other keys; clear_env removes only env; write_identity preserves unknown keys. | Restrictions: never full-overwrite; backup before write. | Success: cargo test passes for both modules._

- [x] 6. core/credentials.rs — per-OS credential backend (preserve mcpOAuth)
  - Files: `src-tauri/src/core/credentials.rs`
  - Purpose: read/write the active subscription credential, file vs macOS Keychain
  - _Leverage: src/core/(atomic_fs,paths).rs, research/modern-impl.md §1.1, §1.2, §1.4, §6 (G3, G4)_
  - _Requirements: 3.1, 3.2, 3.3_
  - _Prompt: Implement the task for spec claude-data-core, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Rust cross-platform engineer | Task: Implement core/credentials.rs with a CredentialBackend trait (read_blob/write_blob) and two impls: FileBackend (Linux/Windows: read/write .credentials.json, on write REPLACE only claudeAiOauth and PRESERVE mcpOAuth + other keys via write_json_preserving, atomic 0600) and KeychainBackend (macOS: get/set the "Claude Code-credentials" generic password for the current user; gate behind cfg(target_os="macos")). active_backend() picks by OS. read_active() -> ActiveCredential (the blob + a non-secret descriptor: subscriptionType, rateLimitTier, expiresAt). write_active(claude_ai_oauth_value). Unit tests (FileBackend, tempfile): write_active replaces claudeAiOauth and KEEPS mcpOAuth and other top-level keys; descriptor parses tier/expiry without exposing tokens. | Restrictions: descriptor returned to callers must not include token strings; macOS path compiles but is tested only on macOS. | Success: cargo test for credentials (FileBackend) passes; crate compiles for the macOS cfg path._

- [x] 7. core/switch.rs — account/provider switch with capture + rollback
  - Files: `src-tauri/src/core/switch.rs`
  - Purpose: the headline algorithm — safe, atomic, reversible
  - _Leverage: src/core/(credentials,keyring_store,claude_json,settings,atomic_fs,paths).rs, research/modern-impl.md §1.7_
  - _Requirements: 4.4, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3_
  - _Prompt: Implement the task for spec claude-data-core, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Rust engineer (safety-critical) | Task: Implement core/switch.rs: add_account_from_active() captures the live credential + oauthAccount, stores blob in the vault, persists AccountMeta. switch_account(target_id): detect env override; CAPTURE current (read live cred+profile, vault_put it, backup .credentials.json + .claude.json); if target not in vault -> CoreError::AccountNotFound (no changes); load target blob; atomic write_active(target claudeAiOauth) preserving mcpOAuth; write_identity(target oauthAccount/userID); on ANY error restore both backups and return CoreError::SwitchFailedRolledBack; return SwitchResult(identity, applyNote per OS). apply_provider(meta+env) = settings.merge_env + backup; clear_provider = settings.clear_env. Unit tests (tempfile + mock/file vault): happy path switches active + previous captured + returned identity has NO token; injected write failure rolls BOTH files back to pre-switch bytes; AccountNotFound makes zero changes; apply/clear_provider only touch env. | Restrictions: capture+backup MUST precede any overwrite; never leave partial state; never return tokens. | Success: cargo test for switch (happy + rollback + not-found + provider) passes._

- [x] 8. commands/* + builder registration + capabilities
  - Files: `src-tauri/src/commands/accounts.rs`, `src-tauri/src/commands/providers.rs`, `src-tauri/src/commands/settings.rs`, `src-tauri/src/lib.rs` (modify), `src-tauri/capabilities/default.json` (modify)
  - Purpose: the narrow typed Tauri command surface
  - _Leverage: src/core/*, src/model.rs_
  - _Requirements: 7.1, 7.2, 7.3_
  - _Prompt: Implement the task for spec claude-data-core, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Tauri engineer | Task: Implement #[tauri::command] wrappers returning Result(_, CoreError): accounts.rs (list_accounts, get_active_identity, add_account_from_active, switch_account(id), remove_account(id)); providers.rs (list_providers, apply_provider(meta), clear_provider); settings.rs (read_settings_summary, detect_env_overrides). Register all via tauri::generate_handler! in lib.rs. Ensure capabilities/default.json stays narrow (no new fs/shell perms needed — all IO is in Rust). Each command has a doc comment naming its on-disk effect. | Restrictions: commands return labels/metadata only — NO token fields; keep capabilities minimal. | Success: cargo build clean; commands registered; a grep confirms no token field on any command return type._

- [x] 9. Frontend IPC client + DTO types
  - Files: `src/lib/ipc.ts`, `src/lib/types.ts` (modify)
  - Purpose: typed wrappers so screens call the backend safely
  - _Leverage: src-tauri/src/model.rs (mirror DTOs), @tauri-apps/api/core invoke_
  - _Requirements: 7.3, 7.4_
  - _Prompt: Implement the task for spec claude-data-core, first run spec-workflow-guide to get the workflow guide then implement the task: Role: TypeScript engineer | Task: Extend src/lib/types.ts with TS interfaces mirroring model.rs DTOs (AccountMeta, ProviderMeta, ActiveIdentity, SwitchResult, EnvOverrides, SettingsSummary) — none with a token field. Create src/lib/ipc.ts wrapping @tauri-apps/api/core invoke for each command (listAccounts, getActiveIdentity, addAccountFromActive, switchAccount, removeAccount, listProviders, applyProvider, clearProvider, readSettingsSummary, detectEnvOverrides), each typed and isTauri-guarded (throw a clear error in a plain browser). Add a light test asserting the wrappers call invoke with the right command names (mock @tauri-apps/api/core). | Restrictions: no token in any TS type; type-safe; do not refactor useShellStore yet (S4 does the wiring). | Success: tsc clean; ipc test passes._

- [x] 10. Verify: cargo tests/build, tsc, web build, fingerprint audit
  - Files: (verify) whole repo
  - Purpose: prove the safety-critical core is correct and clean
  - _Leverage: tech.md de-fingerprint rules_
  - _Requirements: all (esp. Testing)_
  - _Prompt: Implement the task for spec claude-data-core, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Release engineer | Task: Run cd src-tauri && cargo test (ALL core tests green — atomic/backup/rollback/preserve-keys/preserve-mcpOAuth/switch happy+rollback/vault/provider/env-override) and cargo build (clean); then pnpm exec tsc --noEmit (0) and pnpm test (green) and pnpm exec vite build (clean). Fingerprint grep over src + src-tauri/src + configs for ccmate|cc-mate|ccconfig|randynamic|__ccmate__|posthog|phc_|cc-switch|ccswitch|59948|unlock_cc_ext|ic= -> zero. CRITICAL extra check: grep the command return types / DTOs to assert NO accessToken/refreshToken field is ever returned to the frontend. Report exact pass/fail of each with any errors. Do NOT git commit. | Restrictions: fix don't suppress; if a token could leak to the webview, fix it. | Success: every gate green and reported; zero fingerprints; no token in any IPC type._
