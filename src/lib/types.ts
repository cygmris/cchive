/**
 * Shared frontend types for the Clavis design system.
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
 * telemetry vars Clavis writes into `settings.json` on apply.
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
  tier: string | null;
  model: string | null;
  /** Epoch milliseconds the credential expires at. */
  expiresAt: number | null;
}

/** Result of a successful switch: the new identity + a per-OS apply note. */
export interface SwitchResult {
  identity: ActiveIdentity;
  applyNote: string;
}

/** Auth-relevant environment variables that can override what Clavis writes. */
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
