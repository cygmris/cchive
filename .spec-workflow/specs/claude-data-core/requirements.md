# Requirements Document — claude-data-core (S3)

## Introduction

S3 builds the **privileged Rust backbone** that lets Clavis read and write the real Claude Code files safely, and that performs the core **account/provider switch**. It provides cross‑platform path resolution, atomic file I/O with backups and rollback, per‑OS credential read/write (file on Linux/Windows, Keychain on macOS), an OS‑keyring vault for saved accounts' secrets, parsers/editors for `~/.claude/.credentials.json`, `~/.claude.json`, and `settings.json`, the two switch algorithms (subscription‑account and API‑provider), and a narrow, typed Tauri command + IPC layer through which the React UI gets **labels and metadata only — never raw tokens**. There is no new screen; S4 (Configurations) consumes these commands. The defining requirement is **safety**: a switch must never leave Claude Code unable to log in.

## Alignment with Product Vision

Realizes `product.md` Principle 3 (safe by construction), Principle 2 (machine truth), Principle 4 (local & private — secrets in the OS keyring, nothing in the webview), and the headline feature (instant, safe subscription‑account switching). It implements the algorithm and the twelve gotchas documented in `research/modern-impl.md §1.7, §6`. It is the precondition for design checklist items 9–10, 24–31 (switching) which S4 surfaces.

## Requirements

### Requirement 1 — Cross‑platform Claude path resolution

**User Story:** As the app, I want one correct place that resolves every Claude Code path per OS, so all file operations target the right location.

#### Acceptance Criteria
1. The core SHALL resolve the Claude home honoring `CLAUDE_CONFIG_DIR` when set, else `<home>/.claude`, using the platform home (never hardcoded), and expose paths for `.credentials.json`, `settings.json`, `CLAUDE.md`, `agents/`, `commands/`, `skills/`, `projects/`, and the sibling `<home>/.claude.json` (which is at `$HOME`, **not** inside `.claude/`).
2. On macOS the core SHALL also identify the Keychain item (service `Claude Code-credentials`, account = current user) as the credential source.
3. WHEN `CLAUDE_CODE_OAUTH_TOKEN` is set in the environment THEN the core SHALL detect it and report that file/keychain swapping will be overridden (so the UI can warn).

### Requirement 2 — Atomic file I/O with backup and rollback

**User Story:** As a cautious user, I want every write to be atomic and reversible, so a crash or error never corrupts or loses my Claude config.

#### Acceptance Criteria
1. WHEN the core writes any Claude file THEN it SHALL write to a temp file in the same directory, fsync, and `rename()` over the target (atomic on the same filesystem); it SHALL never truncate‑in‑place.
2. The core SHALL re‑apply mode `0600` to `.credentials.json` after writing (Linux/Windows).
3. WHEN a destructive change is made THEN the core SHALL first write a timestamped backup (`<file>.clavis.bak.<epoch>`), and SHALL provide a rollback that restores from it.
4. The core SHALL keep at most N rotating backups per file (configurable; default 10) and prune older ones.
5. WHEN editing a JSON file THEN the core SHALL parse → mutate only the targeted keys → re‑serialize preserving key order and **all unknown keys** (never full‑overwrite a file whose schema it does not fully model).

### Requirement 3 — Credential read/write per OS (preserving mcpOAuth)

**User Story:** As a multi‑account user, I want the app to read and write my active Claude credential correctly on my OS, so switching actually takes effect without breaking MCP logins.

#### Acceptance Criteria
1. The core SHALL read the active subscription credential: on Linux/Windows from `~/.claude/.credentials.json` → `claudeAiOauth`; on macOS from the Keychain item. It SHALL expose non‑secret descriptors (`subscriptionType`, `rateLimitTier`, `expiresAt`) without surfacing token values to the frontend.
2. WHEN writing a new active credential THEN the core SHALL replace **only** the `claudeAiOauth` object and **preserve** the existing `mcpOAuth` block (and any other keys) in `.credentials.json`.
3. On macOS the core SHALL write the Keychain item (the same JSON blob), not the plaintext file (which Claude Code deletes); on Linux/Windows it SHALL atomically write the file at mode `0600`.
4. The core SHALL read the identity profile from `~/.claude.json` → `oauthAccount` + `userID` (non‑secret) for display, and SHALL be able to write the target account's `oauthAccount` + `userID` back atomically when switching.

### Requirement 4 — OS‑keyring account vault

**User Story:** As a user with several accounts, I want Clavis to remember each account securely, so I can switch back to one even though only one is "active" in Claude Code at a time.

#### Acceptance Criteria
1. The core SHALL store each saved account's secret credential blob in the OS keyring (`keyring` crate) under the Clavis namespace (e.g. service `app.clavis.accounts`, key = account id), separate from Claude Code's own `Claude Code-credentials` item.
2. Non‑secret account metadata (label/email, plan tier, ordering, last‑used) SHALL be stored via `tauri-plugin-store`, not the keyring.
3. The core SHALL support add/list/get/remove of vault accounts; `list` SHALL return metadata only (no tokens).
4. WHEN capturing the current active account THEN the core SHALL persist it to the vault first (labeled by email + tier) **before** any overwrite, so a one‑account user never loses their only credential.

### Requirement 5 — Subscription‑account switch (the headline, safe & reversible)

**User Story:** As a user whose Max 5× just ran out, I want to switch to my Max 20× in one call, so I keep working without losing or corrupting either account.

#### Acceptance Criteria
1. `switch_account(targetId)` SHALL execute: detect platform → (warn if `CLAUDE_CODE_OAUTH_TOKEN` set) → **capture current** (read live credential + profile, persist to vault, write timestamped backups of `.credentials.json` and `.claude.json`) → load target from vault → **atomically write** target `claudeAiOauth` (preserving `mcpOAuth`) + target `oauthAccount`/`userID` → optionally verify → on any failure **roll back** from the backups.
2. IF the target account is not in the vault THEN the operation SHALL fail safely with a clear error and make **no** changes.
3. WHEN the switch succeeds THEN the core SHALL return the new active descriptor (email, tier) and a per‑OS "apply" note (Linux/Windows: next message; macOS: ~30 s or restart). It SHALL NOT touch `settings.json`, `CLAUDE.md`, skills, commands, agents, projects history, or `mcpOAuth`.
4. WHEN any write step fails THEN the system SHALL restore the previous credential + profile from backup and report the failure (no partial state).

### Requirement 6 — API‑provider switch (distinct code path)

**User Story:** As a user routing to a third‑party endpoint, I want to switch providers by editing only the env block, so my subscription login stays intact.

#### Acceptance Criteria
1. `apply_provider(config)` SHALL shallow‑merge the provider's `env` (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, optional small‑model) into `~/.claude/settings.json`, preserving all other keys, atomically, after a backup.
2. `clear_provider()` SHALL remove only the `env` block (reset to subscription), preserving the rest of `settings.json`.
3. Provider switching SHALL NOT read or write `.credentials.json` (the OAuth credential is irrelevant in this mode).

### Requirement 7 — Narrow, typed command + IPC layer (no tokens in the webview)

**User Story:** As a security‑minded user, I want secrets to stay in the Rust process, so the UI can never leak my tokens.

#### Acceptance Criteria
1. The core SHALL expose narrow `#[tauri::command]`s — e.g. `list_accounts`, `get_active_identity`, `add_account_from_active`, `switch_account`, `remove_account`, `list_providers`/`apply_provider`/`clear_provider`, `read_settings_summary`, `detect_env_overrides` — each documenting its on‑disk effect.
2. Command inputs/returns SHALL carry only labels/metadata; **no access/refresh token value SHALL cross the IPC boundary** to the frontend.
3. A typed TS IPC client (`src/lib/ipc.ts`) + shared types (`src/lib/types.ts`) SHALL wrap these commands so screens call them type‑safely; Tauri capabilities SHALL remain narrow (no broad `fs`/`shell`).
4. The shell's `useShellStore` (S2) SHALL be refactorable to source accounts/providers/active identity from these commands without changing shell components (this spec provides the commands + types; S4 wires the screen and the store source).

## Non-Functional Requirements

### Code Architecture and Modularity
- Privileged logic lives in `src-tauri/src/core/*` (`paths`, `atomic_fs`, `credentials`, `keyring_store`, `claude_json`, `settings`) with thin `commands/*` wrappers; `core/*` must not depend on `commands/*`. Shared serde types in `model.rs`.
- OS‑specific credential code is isolated behind one interface in `credentials.rs`.

### Performance
- File operations stream/parse efficiently; a switch completes well under one second on local disk.

### Security
- Secrets only in Rust + OS keyring; never logged, never returned to the webview, never in git. Backups of credential files are mode `0600`. Capabilities stay minimal.

### Reliability
- **Zero credential‑clobber paths.** Capture‑before‑write + atomic rename + rollback are mandatory and covered by tests. Concurrent Claude Code reads must never see a partially written file. Corrupt/missing inputs degrade to clear errors, never panics that leave partial state.

### Usability
- Errors are actionable and plain ("Target account not found in vault", "CLAUDE_CODE_OAUTH_TOKEN is set — file/keychain switching is overridden; unset it to use Clavis switching"). Per‑OS apply semantics are reported accurately.

### Testing
- Rust unit/integration tests over a temp `$HOME`/`CLAUDE_CONFIG_DIR` fixture SHALL cover: atomic write + 0600, backup + rollback, preserve‑unknown‑keys, preserve `mcpOAuth` on credential swap, full `switch_account` happy path, switch failure → rollback, vault add/list/get/remove (metadata‑only list), provider apply/clear, and env‑override detection. These are the safety‑critical core of the whole product.
