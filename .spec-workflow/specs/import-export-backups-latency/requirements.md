# Requirements Document — import-export-backups-latency (S15)

## Introduction

S15 adds three cc‑switch‑inspired enhancements (additive — not in the 13‑screen design), each surfaced in Settings (a new "Data & backups" card) or the config editor:
1. **Export / Import** — move your provider list + app preferences between machines as a JSON file. **Secrets are intentionally excluded** (API keys and tokens live in the OS keyring and never leave it) — a deliberate, honest contrast to tools that dump keys to plaintext.
2. **Backups & restore** — Clavis already backs up each Claude file before writing; S15 formalizes a rotating backups store with a list + one‑click restore.
3. **Endpoint latency test** — measure the round‑trip to a provider's base URL so you can pick the fastest endpoint.

## Alignment with Product Vision

These realize the "feature‑rich like cc‑switch, but safe and calm" goal: migration convenience, a safety net (restore), and a practical speed tool — all honoring the keyring‑only‑secrets model and the de‑fingerprint rule (no predecessor file names, no plaintext key export).

## Requirements

### Requirement 1 — Export / Import (no secrets)

**User Story:** As a user moving to a new machine, I want to export my provider list + preferences, so I can restore them quickly.

#### Acceptance Criteria
1. **Export** SHALL write a JSON file (user‑chosen path via a save dialog) containing: providers (label, baseUrl, model — NO apiKey), app preferences (theme/accent/density/language/experimental flags), and saved account **labels/metadata** (NO tokens), plus a `schema`/`app: clavis` header and an export timestamp.
2. The export SHALL NEVER contain any secret (API key, OAuth token) — verified by a test asserting no secret material in the output.
3. **Import** SHALL read such a JSON (open dialog), validate the header, and **merge**: create/update providers (keyless — the user re‑enters keys), apply preferences; it SHALL report a summary (how many providers/prefs imported) and never overwrite secrets or unknown keys.
4. A malformed/foreign file SHALL be rejected with a clear message (no partial apply).

### Requirement 2 — Backups & restore (rotating)

**User Story:** As a user, I want to roll back a Claude config change, so a bad switch is recoverable.

#### Acceptance Criteria
1. Clavis SHALL keep timestamped backups of the Claude files it writes (`~/.claude/.credentials.json`, `~/.claude.json`, `~/.claude/settings.json`) under a Clavis‑managed backups directory, pruned to the most recent N (e.g. 20) per file.
2. A **Backups** list (in Settings) SHALL show each backup (file, timestamp, size) newest‑first.
3. **Restore** SHALL atomically copy a chosen backup back to its original location (itself backing up the current state first), preserving permissions, and report success/failure.
4. Restore SHALL never touch secrets in the keyring; it only restores the Claude file content the user already had.

### Requirement 3 — Endpoint latency test

**User Story:** As a user with several providers, I want to see which endpoint is fastest, so I can choose well.

#### Acceptance Criteria
1. A **Test latency** action (per provider, in the config editor / Configurations) SHALL measure the round‑trip to the provider's base URL (a lightweight request with a short timeout, a warm‑up then the median of a few samples) and show the result in ms (or a clear failure/timeout state).
2. The latency test SHALL send NO secret (no API key) — it only times reachability of the base URL; a non‑2xx but reachable response still yields a latency number.
3. The test SHALL be cancellable/bounded (a hard timeout) and never block the UI.

## Non-Functional Requirements

### Code Architecture and Modularity
- Backend: `core/portable.rs` (build/apply the export model — pure, secret‑free), `core/backups.rs` (list/restore/prune over a backups dir, reuse `atomic_fs`), `core/latency.rs` (timed HTTP HEAD/GET via the existing HTTP client), with thin `commands/*`. Frontend: a "Data & backups" card in Settings (Export/Import/Backups) + a latency action in the config editor; hooks in `queries.ts`. Add the Tauri dialog plugin for open/save.
- Export/import reuses the providers + prefs models; no new persisted schema beyond the backups index.

### Performance
- Latency uses a short timeout + few samples; backups list is a quick directory scan; export/import are single file ops.

### Security
- **No secret ever leaves the keyring**: export excludes keys/tokens (tested); latency sends no key; restore only moves Claude file content. Atomic writes; backups dir mode 0700, files 0600. The dialog plugin is scoped.

### Reliability
- Import validates before applying (no partial state); restore backs up current state first; backup pruning keeps the newest N; a failed latency test reports cleanly.

### Usability
- Export/Import are obvious Settings actions with a summary toast; the Backups list reads plainly with a confirm‑guarded Restore; the latency result shows inline per provider. The "no secrets in export" guarantee is stated in the UI.
