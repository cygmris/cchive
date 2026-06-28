/**
 * The declarative field schema that drives the Config Editor.
 *
 * This is DATA ONLY (no markup): one array of sections, each with its fields, is
 * the single source of truth for what the editor renders. Adding a setting is a
 * data edit here, not new JSX. The screen (and its FieldRow) reads `control` to
 * pick the input, and `target` to read/write the right slot of the provider
 * payload.
 *
 * The five sections + their fields mirror the design (design-inventory §4) and
 * requirements 3.2 exactly. Each `target` is type-checked against the real
 * `ProviderEnv` / `ProviderSettings` DTOs (mirrored from `model.rs`), so a typo
 * in a mapped key is a compile error. The one exception is the secret auth token,
 * whose `target` is `token`: it lives in the OS-keyring vault, is sent separately
 * to `save_provider`, and is NEVER part of the env/settings payload or any view.
 */
import type { ProviderEnv, ProviderSettings } from "@/lib/types";

/** The control widget a field renders as. */
export type ControlType = "text" | "secret" | "number" | "bool" | "enum";

/** Stable section ids (also the left-nav keys). */
export type SectionId = "common" | "general" | "auth" | "mcp" | "environment";

/** One option in an enum/bool `<select>`. */
export interface SelectOption {
  readonly label: string;
  /** Empty string means "unset" (the field is omitted from the payload). */
  readonly value: string;
}

/**
 * Where a field's value reads from / writes to in the provider payload.
 * - `env`    → a key of `ProviderEnv` (the `ANTHROPIC_*` / proxy / telemetry block)
 * - `config` → a key of `ProviderSettings` (top-level `settings.json` keys)
 * - `token`  → the vault secret, carried apart from any DTO (never the payload)
 */
export type FieldTarget =
  | { readonly group: "env"; readonly key: keyof ProviderEnv }
  | { readonly group: "config"; readonly key: keyof ProviderSettings }
  | { readonly group: "token" };

/** One editable setting. */
export interface FieldDef {
  /** Stable id (the env var / settings key name); also the mono label for env fields. */
  readonly key: string;
  /** Display label (mono). */
  readonly label: string;
  /** Honest one-line description shown beside the control. */
  readonly description: string;
  readonly control: ControlType;
  /** Options for `enum`/`bool` controls (absent for text/secret/number). */
  readonly options?: readonly SelectOption[];
  /** Default applied to a blank/new provider (absent = leave unset). */
  readonly default?: string | number | boolean;
  /** Input placeholder (absent = none). */
  readonly placeholder?: string;
  /** Which payload slot this field maps to. */
  readonly target: FieldTarget;
}

/** One left-nav section + its ordered fields. */
export interface SectionDef {
  readonly id: SectionId;
  readonly label: string;
  readonly fields: readonly FieldDef[];
}

/** Shared bool→select options: Default (unset) / true / false. */
const BOOL_OPTIONS: readonly SelectOption[] = [
  { label: "Default", value: "" },
  { label: "true", value: "true" },
  { label: "false", value: "false" },
];

/**
 * The five Config Editor sections, in nav order, with the exact design fields.
 * The editor's "All settings" view iterates every section's fields in this order.
 */
export const SECTIONS: readonly SectionDef[] = [
  {
    id: "common",
    label: "Common",
    fields: [
      {
        key: "ANTHROPIC_BASE_URL",
        label: "ANTHROPIC_BASE_URL",
        description:
          "API endpoint Claude Code talks to. Leave blank to use Anthropic's default.",
        control: "text",
        placeholder: "https://api.anthropic.com",
        target: { group: "env", key: "baseUrl" },
      },
      {
        key: "ANTHROPIC_AUTH_TOKEN",
        label: "ANTHROPIC_AUTH_TOKEN",
        description:
          "Secret API key for this provider. Stored in the OS keyring — shown only as set or not set, never displayed.",
        control: "secret",
        target: { group: "token" },
      },
      {
        key: "ANTHROPIC_MODEL",
        label: "ANTHROPIC_MODEL",
        description: "Primary model id this provider serves (e.g. glm-4.6).",
        control: "text",
        target: { group: "env", key: "model" },
      },
      {
        key: "ANTHROPIC_DEFAULT_SONNET_MODEL",
        label: "ANTHROPIC_DEFAULT_SONNET_MODEL",
        description:
          "Model used wherever Claude Code asks for a Sonnet-class model.",
        control: "text",
        target: { group: "env", key: "defaultSonnet" },
      },
      {
        key: "ANTHROPIC_DEFAULT_HAIKU_MODEL",
        label: "ANTHROPIC_DEFAULT_HAIKU_MODEL",
        description:
          "Model used wherever Claude Code asks for a Haiku-class model.",
        control: "text",
        target: { group: "env", key: "defaultHaiku" },
      },
    ],
  },
  {
    id: "general",
    label: "General",
    fields: [
      {
        key: "cleanupPeriodDays",
        label: "Cleanup Period (days)",
        description: "How many days of chat transcripts to keep before pruning.",
        control: "number",
        default: 30,
        target: { group: "config", key: "cleanupPeriodDays" },
      },
      {
        key: "includeCoAuthoredBy",
        label: "Include Co-Authored-By",
        description: "Add the Claude Code co-author trailer to git commits.",
        control: "bool",
        options: BOOL_OPTIONS,
        default: true,
        target: { group: "config", key: "includeCoAuthoredBy" },
      },
      {
        key: "outputStyle",
        label: "Output Style",
        description: "Verbosity of Claude Code's responses.",
        control: "enum",
        options: [
          { label: "Default", value: "" },
          { label: "Explanatory", value: "Explanatory" },
          { label: "Concise", value: "Concise" },
        ],
        target: { group: "config", key: "outputStyle" },
      },
    ],
  },
  {
    id: "auth",
    label: "Auth & Login",
    fields: [
      {
        key: "forceLoginMethod",
        label: "Force Login Method",
        description: "Pin the sign-in flow to a specific method.",
        control: "enum",
        options: [
          { label: "None", value: "" },
          { label: "claudeai", value: "claudeai" },
          { label: "console", value: "console" },
        ],
        target: { group: "config", key: "forceLoginMethod" },
      },
      {
        key: "forceLoginOrgUuid",
        label: "Force Login Org UUID",
        description: "Restrict login to a specific organization by UUID.",
        control: "text",
        placeholder: "xxxxxxxx-xxxx-xxxx",
        target: { group: "config", key: "forceLoginOrgUuid" },
      },
    ],
  },
  {
    id: "mcp",
    label: "MCP",
    fields: [
      {
        key: "enableAllProjectMcpServers",
        label: "Enable All Project MCP Servers",
        description:
          "Auto-approve every MCP server declared in a project's .mcp.json.",
        control: "bool",
        options: BOOL_OPTIONS,
        default: false,
        target: { group: "config", key: "enableAllProjectMcpServers" },
      },
      {
        key: "enabledMcpServers",
        label: "Enabled MCP Servers",
        description: "Comma-separated list of project MCP servers to enable.",
        control: "text",
        placeholder: "memory, github",
        target: { group: "config", key: "enabledMcpServers" },
      },
    ],
  },
  {
    id: "environment",
    label: "Environment",
    fields: [
      {
        key: "MAX_THINKING_TOKENS",
        label: "MAX_THINKING_TOKENS",
        description: "Upper bound on tokens spent on extended thinking.",
        control: "number",
        target: { group: "env", key: "maxThinkingTokens" },
      },
      {
        key: "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
        label: "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
        description: "Cap on tokens generated per response.",
        control: "number",
        target: { group: "env", key: "maxOutputTokens" },
      },
      {
        key: "HTTPS_PROXY",
        label: "HTTPS_PROXY",
        description: "Proxy URL for outbound HTTPS requests.",
        control: "text",
        target: { group: "env", key: "httpsProxy" },
      },
      {
        key: "DISABLE_TELEMETRY",
        label: "DISABLE_TELEMETRY",
        description: "Turn off anonymous usage and error reporting.",
        control: "bool",
        options: BOOL_OPTIONS,
        default: true,
        target: { group: "env", key: "disableTelemetry" },
      },
    ],
  },
];

/**
 * All fields flattened in nav order, each tagged with its section id — for the
 * "All settings" view and the cross-section search filter.
 */
export const ALL_FIELDS: readonly (FieldDef & { readonly section: SectionId })[] =
  SECTIONS.flatMap((s) => s.fields.map((f) => ({ ...f, section: s.id })));
