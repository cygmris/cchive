# Requirements Document — config-editor (S5)

## Introduction

S5 delivers the **Config Editor** screen and the **provider persistence** backend it needs. It lets a user edit a stored API‑provider configuration field‑by‑field across the design's five sections (Common / General / Auth & Login / MCP / Environment), with a left section nav, a settings search, the design's control types (text, masked secret, number, bool→select, enum), and Save / Delete. To support this, it extends the S3 core with a **store‑backed provider index** (so providers created in S4 persist and appear in `list_providers`) carrying a full settings payload, with the secret (auth token) kept in the OS‑keyring vault. Applying a provider merges its full payload into `~/.claude/settings.json` (preserving unknown keys). This both fixes the S4 provider‑index gap and completes design checklist items **32–40**.

## Alignment with Product Vision

Realizes `product.md` Feature 3 (config editor with validation, "never save broken JSON") and the design's Config Editor (§4). It makes providers first‑class, editable, durable configs — the "keyring" entries you tune — while keeping the safe‑write discipline (atomic, backup, preserve unknown keys) and secret isolation (token never leaves Rust).

## Requirements

### Requirement 1 — Provider persistence (store‑backed index + vault secret)

**User Story:** As a user, I want providers I create or edit to persist, so they're still there after a refresh or restart.

#### Acceptance Criteria
1. The core SHALL persist providers in a store‑backed index (via `tauri-plugin-store`) holding each provider's non‑secret metadata + settings payload, and SHALL keep the secret auth token in the OS‑keyring vault under the Clavis namespace.
2. `list_providers` SHALL return the persisted providers' metadata (id, title, brand, baseUrl, model) with **no token**; `get_provider(id)` SHALL return the full non‑secret payload (env minus the secret value, plus config fields) for editing; the secret SHALL be represented only as "set / not set", never returned.
3. `create_provider` / `update_provider` SHALL upsert metadata + payload to the index and (if a new token is provided) the secret to the vault; `delete_provider` SHALL remove both. A provider created in S4's flow SHALL now survive a `list_providers` refresh.
4. `apply_provider(id)` SHALL merge the provider's full settings payload (env incl. the vaulted token + the config fields) into `~/.claude/settings.json` atomically, preserving all other keys; `clear_provider` SHALL remove only the `env` block (unchanged from S3).

### Requirement 2 — Config Editor screen shell

**User Story:** As a user, I want a focused editor for one config, so I can tune it without touching others.

#### Acceptance Criteria
1. The editor SHALL be reachable via a provider row's edit action, "Blank provider", and a preset (from S4), and via the Overview hero "Edit config" (later); it SHALL NOT be a sidebar nav item, and Configurations SHALL stay highlighted while it is active.
2. The editor SHALL show a back link "‹ Configurations" and the editing title (the config's name), with right‑aligned **Delete** (trash, danger on hover) and **Save** primary actions.
3. The body SHALL be a two‑column layout: a sticky left nav ("All settings" + Common / General / Auth & Login / MCP / Environment) and the field area; selecting a section SHALL filter fields to it.
4. A "Search settings…" input SHALL filter fields by label/description substring across sections.

### Requirement 3 — Field sections, controls, and the exact fields

**User Story:** As a user, I want every setting from the design with the right input type, so editing is precise and safe.

#### Acceptance Criteria
1. Each field row SHALL render a mono label + a description + a ~300px control. Control types SHALL be: text input; **secret** input (masked placeholder, show/hide, "set/not set" indicator, never displaying the stored value); number input; **bool**→select (Default / true / false); and **enum**→select with the field's options.
2. The fields SHALL match the design exactly:
   - **Common:** `ANTHROPIC_BASE_URL` (text, placeholder `https://api.anthropic.com`), `ANTHROPIC_AUTH_TOKEN` (secret), `ANTHROPIC_MODEL` (text), `ANTHROPIC_DEFAULT_SONNET_MODEL` (text), `ANTHROPIC_DEFAULT_HAIKU_MODEL` (text).
   - **General:** `Cleanup Period (days)` (number, default 30), `Include Co‑Authored‑By` (bool, default true), `Output Style` (enum: Default / Explanatory / Concise).
   - **Auth & Login:** `Force Login Method` (enum: None / claudeai / console), `Force Login Org UUID` (text, placeholder `xxxxxxxx‑xxxx‑xxxx`).
   - **MCP:** `Enable All Project MCP Servers` (bool, default false), `Enabled MCP Servers` (text, e.g. `memory, github`).
   - **Environment:** `MAX_THINKING_TOKENS` (number), `CLAUDE_CODE_MAX_OUTPUT_TOKENS` (number), `HTTPS_PROXY` (text), `DISABLE_TELEMETRY` (bool, default true).
3. Editing a field SHALL update local form state (controlled); values SHALL be prefilled from `get_provider` (Base URL + model from the edited provider; secret shown as "set/not set").

### Requirement 4 — Save and Delete (safe, validated)

**User Story:** As a user, I want Save to persist correctly and never write broken JSON, and Delete to remove the config.

#### Acceptance Criteria
1. WHEN Save is used THEN the editor SHALL validate the form (e.g. base URL is a URL when present; numbers are numeric; UUID shape when present) and, on success, call `update_provider`/`create_provider` to persist metadata + payload (+ a changed secret to the vault), then toast success and reflect the saved name/fields.
2. IF validation fails THEN Save SHALL be blocked with inline field errors and no write SHALL occur.
3. The secret field SHALL only send a new token when the user enters one; leaving it untouched SHALL preserve the existing vaulted token (it is never round‑tripped through the UI).
4. WHEN Delete is used THEN the editor SHALL confirm, call `delete_provider`, and navigate back to Configurations; the provider SHALL disappear from the list.
5. Saving SHALL NOT itself switch the active config; it only persists. (Applying is the Configurations/switcher action.)

### Requirement 5 — Blank provider authoring

**User Story:** As a user, I want to build a provider from scratch, so I'm not limited to presets.

#### Acceptance Criteria
1. "Blank provider" SHALL open the editor on a new, unsaved provider with empty fields and a default name; Save SHALL create it (Req 4).
2. A blank provider with no key/base URL SHALL be creatable as a draft but SHALL warn it is "not configured yet" until a base URL + key are set.

## Non-Functional Requirements

### Code Architecture and Modularity
- Backend: extend `src-tauri/src/core/providers.rs` (new module) for the index + payload, reusing `atomic_fs`, `settings`, `keyring_store`; commands in `commands/providers.rs`; DTOs in `model.rs`. Frontend: the editor under `src/screens/config-editor/`, a field‑schema module describing the sections/fields/control types declaratively, and query/mutation hooks in `queries.ts`.
- The field set SHALL be data‑driven (a schema array), so adding a field is a data change, not new markup.

### Performance
- Editing is local/instant; Save is a single atomic persist; no full settings.json overwrite.

### Security
- The auth token never leaves Rust after entry; the editor shows only "set/not set". No secret in query cache or form state beyond the single Save submit. Capabilities stay narrow.

### Reliability
- Save validates before writing; writes are atomic + preserve unknown keys; a failed Save leaves the stored provider unchanged and surfaces the error. Deleting a provider never touches the live `settings.json` unless it was the applied one (then offer to clear env — or leave to the user; default: do not silently change live settings on delete).

### Usability
- Sentence case; mono for keys/URLs/models/paths; honest field descriptions matching the design's tone. Secret fields never reveal stored values. Validation errors are specific and inline.
