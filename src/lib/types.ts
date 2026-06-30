/**
 * Shared frontend types for the cchive design system.
 */

/** Color theme. Light is the default. */
export type Theme = "light" | "dark";

/** The five swappable accent presets (Tweak). Clay is the default. */
export type AccentName = "clay" | "blue" | "green" | "violet" | "ember";

/** Layout density (Tweak). Comfortable is the default. */
export type Density = "comfortable" | "compact";

/** Persisted theme preferences. */
export interface ThemePrefs {
  theme: Theme;
  accent: AccentName;
  density: Density;
}

/** The set of valid accent names, for runtime validation. */
export const ACCENT_NAMES: readonly AccentName[] = [
  "clay",
  "blue",
  "green",
  "violet",
  "ember",
];

/** Defaults applied when no prefs are stored or stored prefs are corrupt. */
export const DEFAULT_THEME_PREFS: ThemePrefs = {
  theme: "light",
  accent: "clay",
  density: "comfortable",
};

/* ------------------------------------------------------------------------- *
 * Core IPC DTOs — mirror `src-tauri/src/model.rs` (serde `camelCase`).
 *
 * SAFETY CONTRACT: none of these carry a token. The webview only ever sees
 * labels + non-secret metadata (email, plan tier, expiry, model id). Optional
 * Rust fields serialize as `null` (no `skip_serializing_if`), so they are typed
 * `T | null` here to match the wire shape exactly.
 * ------------------------------------------------------------------------- */

/** Non-secret metadata for one saved account (the secret blob lives in the vault). */
export interface AccountMeta {
  id: string;
  label: string;
  email: string | null;
  /** Plan/rate-limit label, e.g. "Max 20x". */
  tier: string | null;
  /** Epoch milliseconds of the last switch-in, if ever used. */
  lastUsed: number | null;
}

/** Non-secret metadata for one API-provider preset (env-block switch mode). */
export interface ProviderMeta {
  id: string;
  label: string;
  /** `ANTHROPIC_BASE_URL` target (non-secret). */
  baseUrl: string | null;
  /** `ANTHROPIC_MODEL` override, if any. */
  model: string | null;
}

/**
 * The `env`-block half of a provider config — the `ANTHROPIC_*` / proxy /
 * telemetry vars cchive writes into `settings.json` on apply.
 *
 * SAFETY: there is deliberately NO token field here. The auth token
 * (`ANTHROPIC_AUTH_TOKEN`) lives only in the OS-keyring vault and is composed in
 * by Rust at apply time; it never rides on this struct across IPC. Optional Rust
 * fields serialize as `null`, so they are typed `T | null` to match the wire shape.
 */
export interface ProviderEnv {
  /** `ANTHROPIC_BASE_URL`. */
  baseUrl: string;
  /** `ANTHROPIC_MODEL`. */
  model: string;
  /** `ANTHROPIC_DEFAULT_SONNET_MODEL`. */
  defaultSonnet: string;
  /** `ANTHROPIC_DEFAULT_HAIKU_MODEL`. */
  defaultHaiku: string;
  /** `MAX_THINKING_TOKENS`. */
  maxThinkingTokens: number | null;
  /** `CLAUDE_CODE_MAX_OUTPUT_TOKENS`. */
  maxOutputTokens: number | null;
  /** `HTTPS_PROXY`. */
  httpsProxy: string | null;
  /** `DISABLE_TELEMETRY`. */
  disableTelemetry: boolean | null;
}

/** The non-`env` half of a provider config: top-level `settings.json` keys. */
export interface ProviderSettings {
  /** `cleanupPeriodDays`. */
  cleanupPeriodDays: number | null;
  /** `includeCoAuthoredBy`. */
  includeCoAuthoredBy: boolean | null;
  /** `outputStyle`. */
  outputStyle: string | null;
  /** `forceLoginMethod`. */
  forceLoginMethod: string | null;
  /** `forceLoginOrgUUID` (serialized from `forceLoginOrgUuid`). */
  forceLoginOrgUuid: string | null;
  /** `enableAllProjectMcpServers`. */
  enableAllProjectMcpServers: boolean | null;
  /** `enabledMcpjsonServers` (comma-separated in the UI, split to an array on apply). */
  enabledMcpServers: string | null;
}

/**
 * One saved API-provider config: non-secret metadata + the full settings payload.
 * Carries NO token value (the secret lives in the vault).
 */
export interface ProviderConfig {
  id: string;
  title: string;
  /** Brand key driving the chip (e.g. `anthropic`, `zai`, `kimi`). */
  brand: string;
  env: ProviderEnv;
  config: ProviderSettings;
}

/**
 * View handed to the editor: the full payload (flattened) plus a `hasToken` flag.
 * NEVER the token value — the editor renders the auth token only as set/not-set.
 */
export interface ProviderConfigView extends ProviderConfig {
  /** Whether a token exists in the vault for this provider. */
  hasToken: boolean;
}

/**
 * Upsert input mirror of {@link ProviderConfig}. `id` is absent for a brand-new
 * provider (the core mints one) and present when editing. The token never travels
 * here — it is passed to `save_provider` as a separate argument.
 */
export interface ProviderConfigInput {
  id?: string;
  title: string;
  brand: string;
  env: ProviderEnv;
  config: ProviderSettings;
}

/** Who the active session currently is, for the HUD. Never includes a token. */
export interface ActiveIdentity {
  /** "account" | "provider" | "none". */
  kind: string;
  label: string;
  email: string | null;
  /** Organization name (non-secret label from `oauthAccount`); renders the
   * Overview hero sub as "email · org" when present. Optional / may be absent. */
  org?: string | null;
  tier: string | null;
  model: string | null;
  /** Epoch milliseconds the credential expires at. */
  expiresAt: number | null;
}

/** Non-secret metadata for one saved Codex account (the `auth.json` payload lives
 * in the OS keyring, never here). The Codex twin of {@link AccountMeta}. */
export interface CodexAccountMeta {
  id: string;
  label: string;
  email: string | null;
  /** Plan label, e.g. "ChatGPT Pro", or "API key" in apikey mode. */
  plan: string | null;
  lastUsed: number | null;
}

/** The active Codex identity from `~/.codex/auth.json`. `kind`: "account" |
 * "apikey" | "none". Never carries a token. */
export interface CodexIdentity {
  kind: string;
  label: string;
  email: string | null;
  plan: string | null;
  expiresAt: number | null;
}

/** Result of a successful switch: the new identity + a per-OS apply note. */
export interface SwitchResult {
  identity: ActiveIdentity;
  applyNote: string;
}

/** Auth-relevant environment variables that can override what cchive writes. */
export interface EnvOverrides {
  /** `CLAUDE_CODE_OAUTH_TOKEN` is set — it bypasses the credential file/keychain. */
  oauthTokenSet: boolean;
  /** Sorted names of any `ANTHROPIC_*` vars present (values never captured). */
  anthropicVars: string[];
  /** `CLAUDE_CONFIG_DIR` value, if it relocates the config directory. */
  configDirOverride: string | null;
}

/** Non-secret summary of `settings.json` for the settings screen. */
export interface SettingsSummary {
  model: string | null;
  /** Whether an `env` provider-override block is present. */
  hasEnv: boolean;
  /** Top-level key names only. */
  topLevelKeys: string[];
}

/* ------------------------------------------------------------------------- *
 * Portable export / import + backups + latency DTOs — mirror
 * `src-tauri/src/model.rs` (serde `camelCase`).
 *
 * SAFETY CONTRACT: none of these carry a secret. An {@link ExportDoc} lists
 * providers WITHOUT a key and accounts WITHOUT a token; a {@link BackupEntry} is
 * file metadata only (the backup holds Claude file CONTENT on disk, never the
 * keyring); a {@link LatencyResult} is timing only (the probe sends no auth
 * header). Optional Rust fields serialize as `null`, so they are typed `T | null`
 * here to match the wire shape exactly.
 * ------------------------------------------------------------------------- */

/** One provider in a portable export: its non-secret identity only (no key). */
export interface ExportProvider {
  label: string;
  baseUrl: string | null;
  model: string | null;
}

/** One saved-account label in a portable export: display meta only (no token). */
export interface ExportAccount {
  label: string;
  email: string | null;
  tier: string | null;
}

/**
 * A portable, SECRET-FREE snapshot of the cchive setup written to / read from a
 * single JSON file. `app` is always `"cchive"` (an import rejects any other
 * identity); providers carry no key, accounts carry no token, and `prefs` is the
 * non-secret app-preference subset only.
 */
export interface ExportDoc {
  /** Identity tag; always `"cchive"`. */
  app: string;
  /** Export schema version. */
  schema: number;
  /** Epoch milliseconds the export was produced. */
  exportedAt: number;
  /** Saved providers, key-free. */
  providers: ExportProvider[];
  /** Non-secret app preferences (theme / language / experimental flags only). */
  prefs: Record<string, unknown>;
  /** Saved-account labels, token-free. */
  accounts: ExportAccount[];
}

/** Outcome of applying an import: how many providers/prefs changed. Counts only. */
export interface ImportSummary {
  providersAdded: number;
  providersUpdated: number;
  prefsApplied: number;
}

/** One rotating snapshot of a Claude file in the backups store. Metadata only. */
export interface BackupEntry {
  /** Stable id = the backup file name `<name>.<timestamp>.bak` (what restore takes). */
  id: string;
  /** The original file's display name (e.g. `settings.json`). */
  original: string;
  /** Epoch milliseconds the snapshot was taken. */
  timestamp: number;
  /** Size in bytes of the backed-up content. */
  size: number;
}

/**
 * Outcome of probing a provider endpoint's round-trip latency. The probe sends
 * NO auth header — it reports timing + the (optional) HTTP status only.
 */
export interface LatencyResult {
  /** Median round-trip in milliseconds; `null` when no response arrived. */
  ms: number | null;
  /** `true` when at least one response arrived (even a non-2xx one). */
  ok: boolean;
  /** HTTP status of the last response, when one arrived. */
  status: number | null;
}

/* ------------------------------------------------------------------------- *
 * MCP-server DTOs — mirror `src-tauri/src/model.rs` (serde `camelCase`).
 *
 * One global MCP server normalized from `~/.claude.json` `mcpServers` (or the
 * cchive disabled stash). Optional Rust fields serialize as `null`, so they are
 * typed `T | null` to match the wire shape exactly.
 *
 * SAFETY: `env` is the user's OWN per-server MCP config (it may hold a server's
 * API key, already in plaintext in `~/.claude.json`) — NOT an Anthropic auth
 * token. It is shown back only inside the edit form; cards/tables/counts never
 * surface it.
 * ------------------------------------------------------------------------- */

/** One global MCP server (enabled from `~/.claude.json`, or parked in the stash). */
export interface McpServer {
  name: string;
  /** `"stdio" | "http" | "sse"` (missing `type` normalizes to `"stdio"`). */
  transport: string;
  /** stdio launch command. */
  command: string | null;
  /** stdio command arguments. */
  args: string[] | null;
  /** stdio environment variables. */
  env: Record<string, string> | null;
  /** http/sse endpoint URL. */
  url: string | null;
  /** `"user" | "project"` (global servers are `"user"`). */
  scope: string;
  /** `false` when the definition is parked in the cchive disabled stash. */
  enabled: boolean;
  /** Optional free-text hint about the tools the server exposes (display only). */
  toolsHint: string | null;
}

/**
 * Upsert input mirror of {@link McpServer} (no `enabled` — upsert always writes an
 * enabled server; toggling is a separate move to/from the stash). `scope` defaults
 * to `"user"` when absent.
 */
export interface McpServerInput {
  name: string;
  transport: string;
  command?: string | null;
  args?: string[] | null;
  env?: Record<string, string> | null;
  url?: string | null;
  scope?: string | null;
}

/* ------------------------------------------------------------------------- *
 * Usage-analytics DTOs — mirror `src-tauri/src/model.rs` (serde `camelCase`).
 *
 * SAFETY: numbers + model ids + local dates only; never a credential. `u64`
 * counts arrive as JS `number` (well within `Number.MAX_SAFE_INTEGER` for token
 * tallies). `estCostUsd` is computed locally from a pricing table (no network).
 * ------------------------------------------------------------------------- */

/** Token counts for one bucket (a day, a model, or the whole range). */
export interface TokenTotals {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

/** One day of the per-day series (the output bar chart reads `output`). */
export interface DayPoint {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  output: number;
  input: number;
  cacheRead: number;
}

/** Per-model rolled-up token count (for the ranked model breakdown). */
export interface ModelTotal {
  model: string;
  /** Sum of all four token kinds for this model over the range. */
  tokens: number;
}

/** One cell of the past-year contribution heatmap. */
export interface HeatCell {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  tokens: number;
  /** Intensity bucket 0..4 (0 = no activity), driven off daily totals. */
  level: number;
}

/** The whole usage aggregate handed to the Usage screen. Numbers only. */
export interface UsageSummary {
  /** The window the totals/per-day/per-model cover (e.g. 30 or 7). */
  rangeDays: number;
  totals: TokenTotals;
  estCostUsd: number;
  /** Model ids seen with no pricing entry (their cost contribution is 0). */
  unknownModels: string[];
  /** Zero-filled day series over the range (oldest → newest). */
  perDay: DayPoint[];
  /** Models ranked by token count (desc). */
  perModel: ModelTotal[];
  /** One cell per day for the trailing year (oldest → newest). */
  heatmap: HeatCell[];
}

/* ------------------------------------------------------------------------- *
 * Markdown-resource DTOs — mirror `src-tauri/src/model.rs` (serde `camelCase`,
 * `ResourceKind` lowercase).
 *
 * One markdown resource per family: agents (`~/.claude/agents/*.md`), commands
 * (`~/.claude/commands/*.md`), skills (`~/.claude/skills/<name>/SKILL.md`).
 * Strings/numbers only — the body is plain markdown prose, never a credential.
 * Which optional fields are populated depends on `kind`: agents carry
 * `model`/`tools`; commands carry `argsHint`; skills carry `source`/`enabled`.
 * Optional Rust fields serialize as `null`, so they are typed `T | null` here to
 * match the wire shape exactly.
 * ------------------------------------------------------------------------- */

/** Which markdown-resource family a {@link Resource} belongs to. */
export type ResourceKind = "agent" | "command" | "skill";

/** One markdown resource (a subagent, a slash command, or a skill), summarized. */
export interface Resource {
  kind: ResourceKind;
  /** Agent name (or filename), `/`-prefixed for commands, folder name for skills. */
  name: string;
  description: string | null;
  /** Number of body lines (frontmatter stripped), for the line-count meta. */
  bodyLines: number;
  /** Agent model badge keyword (`sonnet`/`opus`/`haiku`) or raw model id. */
  model: string | null;
  /** Skill source (`Personal`/`Project`/`Plugin`). */
  source: string | null;
  /** Skill enabled flag (`true` live in `skills/`, `false` parked in the stash). */
  enabled: boolean | null;
  /** Absolute on-disk path (the `.md` file, or the skill's `SKILL.md`). */
  path: string;
  /** Command `argument-hint` (display only). */
  argsHint: string | null;
  /** Agent `tools` list, comma-joined for display. */
  tools: string | null;
}

/** A {@link Resource} plus the verbatim `.md` text, for the markdown editor. */
export interface ResourceDetail extends Resource {
  /** The raw `.md` contents (frontmatter + body), edited as-is. */
  raw: string;
}

/* ------------------------------------------------------------------------- *
 * Memory + Projects DTOs — mirror `src-tauri/src/model.rs` (serde `camelCase`).
 *
 * Memory edits a `CLAUDE.md` for a scope (global user memory or a project's);
 * Projects are discovered from `~/.claude.json` `projects` and each carries a
 * per-project `.claude/settings.local.json` (raw JSON text round-tripped).
 * Plain markdown / the user's own local settings only — never a credential.
 * Optional Rust fields serialize as `null`, so they are typed `T | null` here to
 * match the wire shape exactly.
 * ------------------------------------------------------------------------- */

/**
 * Which `CLAUDE.md` the Memory screen is editing. Mirrors the adjacently-tagged
 * Rust `MemoryScope` enum on the wire: `{ kind: "global" }` (→ `~/.claude/CLAUDE.md`)
 * or `{ kind: "project", path }` (→ `<path>/CLAUDE.md`).
 */
export type MemoryScope =
  | { kind: "global" }
  | { kind: "project"; path: string };

/** One memory document: the resolved `CLAUDE.md` path + its verbatim contents. */
export interface MemoryDoc {
  /** Absolute path of the `CLAUDE.md` being edited. */
  path: string;
  /** The file's markdown contents (`""` when absent). */
  content: string;
}

/** One project discovered from `~/.claude.json` `projects` (paths + flags only). */
export interface Project {
  /** Absolute project root (the `projects` map key). */
  path: string;
  /** Display name: the last path segment. */
  name: string;
  /** Whether `<path>/.claude/settings.local.json` exists on disk. */
  hasLocalSettings: boolean;
  /** Epoch milliseconds of last activity, if the entry carries one. */
  lastActivity: number | null;
}

/** One project's `.claude/settings.local.json`, round-tripped as raw JSON text. */
export interface ProjectSettings {
  /** Absolute project root the settings belong to. */
  path: string;
  /** The verbatim `.claude/settings.local.json` text (`"{}"` if absent). */
  raw: string;
}

/* ------------------------------------------------------------------------- *
 * Activity-log DTO — mirrors `src-tauri/src/model.rs` (serde `camelCase`).
 *
 * One entry in the capped recent-activity feed. Carries a display label only —
 * never a token: the append call sites pass account/provider/server/skill names
 * and CLAUDE.md paths, all non-secret.
 * ------------------------------------------------------------------------- */

/** One recent-activity entry: a kind bucket, a label-only message, and a time. */
export interface ActivityEntry {
  /** Feed-icon bucket: `"account" | "provider" | "mcp" | "skill" | "memory"`. */
  kind: string;
  /** Display label for the entry (no secret). */
  message: string;
  /** Epoch milliseconds the entry was recorded. */
  timestamp: number;
}

/* ------------------------------------------------------------------------- *
 * Notification-hook DTOs — mirror `src-tauri/src/model.rs` (serde `camelCase`,
 * `NotificationKind` lowerCamel).
 *
 * A cchive-marked `command` hook in `~/.claude/settings.json` `hooks` fires a
 * desktop notification on a Claude Code event. Each kind maps to one event
 * (in `core::notify_hook`): completion→Stop, general→Notification,
 * toolUse→PreToolUse. Booleans/labels only — never a credential.
 * ------------------------------------------------------------------------- */

/** Which desktop-notification event a toggle controls (mirrors the Rust enum). */
export type NotificationKind = "completion" | "general" | "toolUse";

/** Whether each cchive-marked notification hook is currently installed. */
export interface NotificationState {
  completion: boolean;
  general: boolean;
  toolUse: boolean;
}
