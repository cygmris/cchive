//! Shared DTOs and the error type that cross the Tauri IPC boundary.
//!
//! SAFETY CONTRACT: nothing in this module carries a token. The webview only
//! ever sees labels + non-secret metadata (email, plan tier, expiry, model id).
//! Access/refresh tokens stay in Rust (the OS keyring + the on-disk credential
//! files) and are never serialized into any of these structs.
#![allow(dead_code)] // scaffolding: commands wire these up in a later task

use std::collections::BTreeMap;

use serde::ser::SerializeStruct;
use serde::{Deserialize, Serialize};

/// Non-secret metadata for one saved account (the secret blob lives in the vault).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountMeta {
    pub id: String,
    pub label: String,
    pub email: Option<String>,
    /// Plan/rate-limit label, e.g. "Max 20x" derived from `rateLimitTier`.
    pub tier: Option<String>,
    /// Epoch milliseconds of the last switch-in, if ever used.
    pub last_used: Option<i64>,
}

/// Non-secret metadata for one API-provider preset (env-block switch mode).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderMeta {
    pub id: String,
    pub label: String,
    /// `ANTHROPIC_BASE_URL` target (non-secret).
    pub base_url: Option<String>,
    /// `ANTHROPIC_MODEL` override, if any.
    pub model: Option<String>,
}

/// The `env`-block half of a provider config. Maps 1:1 to the `ANTHROPIC_*` /
/// proxy / telemetry env vars Clavis writes into `settings.json` on apply.
///
/// SAFETY: there is deliberately NO token field here. The auth token
/// (`ANTHROPIC_AUTH_TOKEN`) lives only in the OS keyring vault and is composed in
/// at apply time; it never rides on this struct (so it never crosses IPC).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderEnv {
    /// `ANTHROPIC_BASE_URL`.
    pub base_url: String,
    /// `ANTHROPIC_MODEL`.
    pub model: String,
    /// `ANTHROPIC_DEFAULT_SONNET_MODEL`.
    pub default_sonnet: String,
    /// `ANTHROPIC_DEFAULT_HAIKU_MODEL`.
    pub default_haiku: String,
    /// `MAX_THINKING_TOKENS`.
    pub max_thinking_tokens: Option<i64>,
    /// `CLAUDE_CODE_MAX_OUTPUT_TOKENS`.
    pub max_output_tokens: Option<i64>,
    /// `HTTPS_PROXY`.
    pub https_proxy: Option<String>,
    /// `DISABLE_TELEMETRY`.
    pub disable_telemetry: Option<bool>,
}

/// The non-`env` half of a provider config: top-level `settings.json` keys.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSettings {
    /// `cleanupPeriodDays`.
    pub cleanup_period_days: Option<i64>,
    /// `includeCoAuthoredBy`.
    pub include_co_authored_by: Option<bool>,
    /// `outputStyle`.
    pub output_style: Option<String>,
    /// `forceLoginMethod`.
    pub force_login_method: Option<String>,
    /// `forceLoginOrgUUID`.
    pub force_login_org_uuid: Option<String>,
    /// `enableAllProjectMcpServers`.
    pub enable_all_project_mcp_servers: Option<bool>,
    /// `enabledMcpjsonServers` (comma-separated in the UI, split to an array on apply).
    pub enabled_mcp_servers: Option<String>,
}

/// One saved API-provider config: non-secret metadata + the full settings payload.
/// Persisted in the Clavis-managed provider index; the token is kept separately in
/// the vault. Carries no token value.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub id: String,
    pub title: String,
    /// Brand key driving the chip (e.g. `anthropic`, `zai`, `kimi`).
    pub brand: String,
    pub env: ProviderEnv,
    pub config: ProviderSettings,
}

/// View model handed to the webview: the full payload plus a `hasToken` flag.
/// NEVER the token value — the editor renders the auth token only as set/not-set.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfigView {
    #[serde(flatten)]
    pub config: ProviderConfig,
    /// Whether a token exists in the vault for this provider.
    pub has_token: bool,
}

/// Upsert input mirror of `ProviderConfig`. `id` is absent for a brand-new
/// provider (the core mints one) and present when editing an existing one. The
/// token never travels here — it is passed as a separate `Option<String>`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfigInput {
    pub id: Option<String>,
    pub title: String,
    pub brand: String,
    pub env: ProviderEnv,
    pub config: ProviderSettings,
}

/// One provider in a portable export: its non-secret identity only.
///
/// SAFETY: there is deliberately NO key/token field — a portable export carries
/// the label + base URL + model so a fresh profile can recreate the provider
/// shell, but the auth token never leaves the vault.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProvider {
    pub label: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
}

/// One account label in a portable export: a display label + non-secret meta.
/// SAFETY: no secret blob/token — accounts are listed for reference only; an
/// import does not (and cannot) recreate a signed-in account from this.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAccount {
    pub label: String,
    pub email: Option<String>,
    pub tier: Option<String>,
}

/// A portable, SECRET-FREE snapshot of the Clavis setup, written to / read from a
/// single JSON file via the export/import flow. `app` is always `"clavis"`; an
/// import rejects any other identity. Providers carry no key, accounts carry no
/// token, and `prefs` is the non-secret app-preference subset only.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportDoc {
    /// Identity tag; always `"clavis"` (a foreign value is rejected on import).
    pub app: String,
    /// Export schema version (bumped if the shape ever changes).
    pub schema: u32,
    /// Epoch milliseconds the export was produced.
    pub exported_at: i64,
    /// Saved providers, key-free (label + base URL + model).
    pub providers: Vec<ExportProvider>,
    /// Non-secret app preferences (theme / language / experimental flags only).
    pub prefs: serde_json::Value,
    /// Saved-account labels, token-free.
    pub accounts: Vec<ExportAccount>,
}

/// Outcome of applying an import: how many providers were created/updated and how
/// many preference keys were applied. Counts only — never a secret.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub providers_added: u32,
    pub providers_updated: u32,
    pub prefs_applied: u32,
}

/// One rotating snapshot of a Claude file in the Clavis backups store. Plain
/// metadata for the Settings backups list — never a secret (the backup holds the
/// file CONTENT on disk; the OS keyring is never part of a backup).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    /// Stable id = the backup file name `<name>.<timestamp>.bak` (what `restore` takes).
    pub id: String,
    /// The original file's display name (e.g. `settings.json`, `.credentials.json`).
    pub original: String,
    /// Epoch milliseconds the snapshot was taken.
    pub timestamp: i64,
    /// Size in bytes of the backed-up content.
    pub size: u64,
}

/// Outcome of probing a provider endpoint's round-trip latency. The probe sends
/// NO auth header and never carries a secret — it only reports timing and the
/// (optional) HTTP status of the response that came back.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatencyResult {
    /// Median round-trip in milliseconds across the timed samples; `None` when no
    /// response arrived (timeout / connect error).
    pub ms: Option<u64>,
    /// `true` when at least one response arrived (even a non-2xx one); `false` on
    /// timeout / connect error.
    pub ok: bool,
    /// HTTP status of the last response, when one arrived.
    pub status: Option<u16>,
}

/// One global MCP server, normalized from `~/.claude.json` `mcpServers` (or from
/// the Clavis disabled stash). `transport` is `"stdio" | "http" | "sse"` (missing
/// `type` normalizes to `"stdio"`); `scope` is `"user" | "project"` (global
/// servers are `"user"`). `enabled` is `false` for servers parked in the stash.
///
/// NOTE: `env` is the user's OWN per-server MCP config (it may hold a server's API
/// key), already stored in plaintext in `~/.claude.json`. It is NOT an Anthropic
/// auth/refresh token — those never leave the Rust core. The form is the only
/// place `env` is shown back for editing; cards/tables/counts don't surface it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub name: String,
    /// `"stdio" | "http" | "sse"`.
    pub transport: String,
    /// stdio launch command.
    pub command: Option<String>,
    /// stdio command arguments.
    pub args: Option<Vec<String>>,
    /// stdio environment variables.
    pub env: Option<BTreeMap<String, String>>,
    /// http/sse endpoint URL.
    pub url: Option<String>,
    /// `"user" | "project"`.
    pub scope: String,
    /// `false` when the definition is parked in the Clavis disabled stash.
    pub enabled: bool,
    /// Optional free-text hint about the tools the server exposes (display only).
    pub tools_hint: Option<String>,
}

/// Upsert input mirror of `McpServer` (no `enabled` — upsert always writes an
/// enabled server; toggling is a separate move to/from the stash). `scope`
/// defaults to `"user"` when absent.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInput {
    pub name: String,
    pub transport: String,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<BTreeMap<String, String>>,
    pub url: Option<String>,
    pub scope: Option<String>,
}

/// Who the active session currently is, for the HUD. Never includes a token.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveIdentity {
    /// "account" | "provider" | "none".
    pub kind: String,
    pub label: String,
    pub email: Option<String>,
    /// Organization name from `~/.claude.json` `oauthAccount.organizationName`
    /// (a non-secret label; never a token/uuid). Drives the "email · org" hero sub.
    pub org: Option<String>,
    pub tier: Option<String>,
    pub model: Option<String>,
    /// Epoch milliseconds the credential expires at (drives the countdown badge).
    pub expires_at: Option<i64>,
}

/// Result of a successful switch: the new identity + a per-OS note about when
/// Claude Code will pick up the change (file re-read vs keychain cache).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchResult {
    pub identity: ActiveIdentity,
    pub apply_note: String,
}

/// Auth-relevant environment variables that can override what Clavis writes.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvOverrides {
    /// `CLAUDE_CODE_OAUTH_TOKEN` is set — it bypasses the credential file/keychain.
    pub oauth_token_set: bool,
    /// Sorted names of any `ANTHROPIC_*` vars present (values never captured).
    pub anthropic_vars: Vec<String>,
    /// `CLAUDE_CONFIG_DIR` value, if it relocates the config directory.
    pub config_dir_override: Option<String>,
}

/// Non-secret summary of `settings.json` for the settings screen.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSummary {
    pub model: Option<String>,
    /// Whether an `env` provider-override block is present.
    pub has_env: bool,
    /// Top-level key names only (so the UI can show what's configured).
    pub top_level_keys: Vec<String>,
}

/// Token counts for one bucket (a day, a model, or a whole range). All four
/// kinds are plain counts — no secrets, just numbers crossing IPC.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenTotals {
    pub input: u64,
    pub output: u64,
    pub cache_creation: u64,
    pub cache_read: u64,
}

/// One day of the per-day series (the output-tokens bar chart reads `output`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayPoint {
    /// Local calendar day, `YYYY-MM-DD`.
    pub date: String,
    pub output: u64,
    pub input: u64,
    pub cache_read: u64,
}

/// Per-model rolled-up token count (for the ranked model breakdown).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelTotal {
    pub model: String,
    /// Sum of all four token kinds for this model over the range.
    pub tokens: u64,
}

/// One cell of the past-year contribution heatmap.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatCell {
    /// Local calendar day, `YYYY-MM-DD`.
    pub date: String,
    pub tokens: u64,
    /// Intensity bucket 0..=4 (0 = no activity), driven off daily totals.
    pub level: u8,
}

/// The whole usage aggregate handed to the Usage screen. Numbers + model ids +
/// dates only; never a credential. `est_cost_usd` is computed locally from the
/// pricing table (no network), so it is just a number too.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    /// The window the totals/per-day/per-model cover (e.g. 30 or 7).
    pub range_days: u32,
    pub totals: TokenTotals,
    pub est_cost_usd: f64,
    /// Model ids seen with no pricing entry (their cost contribution is 0).
    pub unknown_models: Vec<String>,
    /// Zero-filled day series over the range (oldest → newest).
    pub per_day: Vec<DayPoint>,
    /// Models ranked by token count (desc).
    pub per_model: Vec<ModelTotal>,
    /// One cell per day for the trailing year (oldest → newest).
    pub heatmap: Vec<HeatCell>,
}

/// Which markdown-resource family a `Resource` belongs to. Serializes to the
/// lowercase string the webview passes back (`"agent" | "command" | "skill"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResourceKind {
    Agent,
    Command,
    Skill,
}

/// One markdown resource (a subagent, a slash command, or a skill), summarized
/// from its `.md` frontmatter + body. Strings/numbers only — no secrets. Which
/// optional fields are populated depends on `kind`:
/// - agents: `model`, `tools` (no `source`/`enabled`/`args_hint`);
/// - commands: `args_hint` (no `model`/`tools`/`source`/`enabled`);
/// - skills: `source`, `enabled` (no `model`/`tools`/`args_hint`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Resource {
    pub kind: ResourceKind,
    /// Display name: agent frontmatter `name` (or filename), `/`-prefixed for
    /// commands, the folder name for skills.
    pub name: String,
    pub description: Option<String>,
    /// Number of body lines (frontmatter stripped), for the line-count meta.
    pub body_lines: u32,
    /// Agent model badge keyword (`sonnet`/`opus`/`haiku`) or the raw model id.
    pub model: Option<String>,
    /// Skill source (`Personal`/`Project`/`Plugin`).
    pub source: Option<String>,
    /// Skill enabled flag (`true` live in `skills/`, `false` parked in the stash).
    pub enabled: Option<bool>,
    /// Absolute on-disk path (the `.md` file, or the skill's `SKILL.md`).
    pub path: String,
    /// Command `argument-hint` (display only).
    pub args_hint: Option<String>,
    /// Agent `tools` list, comma-joined for display.
    pub tools: Option<String>,
}

/// A `Resource` plus the verbatim `.md` text, for the markdown editor.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceDetail {
    #[serde(flatten)]
    pub resource: Resource,
    /// The raw `.md` contents (frontmatter + body), edited as-is.
    pub raw: String,
}

/// Which `CLAUDE.md` the Memory screen is editing: the global user memory or a
/// specific project's. Serializes adjacently-tagged so the webview can pass
/// `{ kind: "global" }` or `{ kind: "project", path: "/abs/project" }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "path")]
pub enum MemoryScope {
    /// `~/.claude/CLAUDE.md`.
    Global,
    /// `<path>/CLAUDE.md`.
    Project(String),
}

/// One memory document: the resolved `CLAUDE.md` path + its verbatim contents
/// (empty string when the file does not yet exist). Plain markdown — no secrets.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryDoc {
    /// Absolute path of the `CLAUDE.md` being edited.
    pub path: String,
    /// The file's markdown contents (`""` when absent).
    pub content: String,
}

/// One project Claude Code has been run in, discovered from `~/.claude.json`
/// `projects` keys. Paths + a name + flags only — never a secret.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    /// Absolute project root (the `projects` map key).
    pub path: String,
    /// Display name: the last path segment.
    pub name: String,
    /// Whether `<path>/.claude/settings.local.json` exists on disk.
    pub has_local_settings: bool,
    /// Epoch milliseconds of last activity, if the entry carries one.
    pub last_activity: Option<i64>,
}

/// One project's `.claude/settings.local.json`, round-tripped as raw JSON text
/// (`"{}"` when the file is absent) so the editor preserves the user's exact
/// formatting. Per-project local settings only — never credentials.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    /// Absolute project root the settings belong to.
    pub path: String,
    /// The verbatim `.claude/settings.local.json` text (`"{}"` if absent).
    pub raw: String,
}

/// One recent-activity log entry for the Overview feed: a `kind` bucket, a
/// human-readable `message`, and an epoch-millisecond `timestamp`. Labels ONLY —
/// `message` is a display string (e.g. "Switched account to Work"); a token is
/// never recorded here.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntry {
    /// Bucket driving the feed icon: e.g. `"account" | "provider" | "mcp" |
    /// "skill" | "memory"`.
    pub kind: String,
    /// Display label for the entry (no secret).
    pub message: String,
    /// Epoch milliseconds the entry was recorded.
    pub timestamp: i64,
}

/// Which desktop-notification event a toggle controls. Serializes to the
/// camelCase string the webview passes back, and maps (in `core::notify_hook`)
/// to a `settings.json` `hooks` event: Completion→Stop, General→Notification,
/// ToolUse→PreToolUse.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NotificationKind {
    Completion,
    General,
    ToolUse,
}

/// Whether each Clavis-marked notification hook is currently installed in
/// `~/.claude/settings.json`. Derived by scanning for the `clavis-notify`
/// marker; carries no secret.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationState {
    pub completion: bool,
    pub general: bool,
    pub tool_use: bool,
}

/// The single error type returned to the frontend. Serializes to a stable
/// `{ code, message }` shape so the UI can branch on `code` without parsing
/// human text.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("account not found: {0}")]
    AccountNotFound(String),

    #[error("switch failed and both files were rolled back: {0}")]
    SwitchFailedRolledBack(String),

    #[error("a credential env override is active: {0}")]
    EnvOverride(String),

    #[error("corrupt or unparseable file: {0}")]
    CorruptFile(String),

    #[error("keyring error: {0}")]
    Keyring(String),

    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("io error: {0}")]
    Io(String),
}

impl CoreError {
    /// Stable machine-readable code (never changes across message wording).
    pub fn code(&self) -> &'static str {
        match self {
            CoreError::AccountNotFound(_) => "ACCOUNT_NOT_FOUND",
            CoreError::SwitchFailedRolledBack(_) => "SWITCH_FAILED_ROLLED_BACK",
            CoreError::EnvOverride(_) => "ENV_OVERRIDE",
            CoreError::CorruptFile(_) => "CORRUPT_FILE",
            CoreError::Keyring(_) => "KEYRING",
            CoreError::InvalidInput(_) => "INVALID_INPUT",
            CoreError::NotFound(_) => "NOT_FOUND",
            CoreError::Io(_) => "IO",
        }
    }
}

impl Serialize for CoreError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut s = serializer.serialize_struct("CoreError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

impl From<std::io::Error> for CoreError {
    fn from(e: std::io::Error) -> Self {
        CoreError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for CoreError {
    fn from(e: serde_json::Error) -> Self {
        CoreError::CorruptFile(e.to_string())
    }
}
