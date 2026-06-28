/**
 * Typed IPC client — the single place the React shell calls the privileged Rust
 * core.
 *
 * Each wrapper invokes one `#[tauri::command]` and is guarded by {@link isTauri}:
 * in a plain browser (`vite dev`, the gallery, unit tests without a mock) there
 * is no Tauri runtime, so the call throws a clear error instead of hanging. Every
 * return carries labels + non-secret metadata only — tokens never cross this
 * boundary (they stay in the OS keyring + the on-disk credential files).
 *
 * `applyProvider`'s `env` argument is the only secret-bearing value here, and it
 * travels webview → Rust (an input that gets written to `settings.json`); it is
 * never returned.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

import type {
  AccountMeta,
  ActiveIdentity,
  EnvOverrides,
  McpServer,
  McpServerInput,
  ProviderConfigInput,
  ProviderConfigView,
  ProviderMeta,
  SettingsSummary,
  SwitchResult,
  UsageSummary,
} from "./types";

/** Throw a clear error when invoked outside the Tauri runtime. */
function ensureTauri(command: string): void {
  if (!isTauri()) {
    throw new Error(
      `Clavis IPC "${command}" requires the Tauri runtime and is unavailable in a plain browser.`,
    );
  }
}

/** List saved accounts (non-secret metadata only). */
export function listAccounts(): Promise<AccountMeta[]> {
  ensureTauri("list_accounts");
  return invoke<AccountMeta[]>("list_accounts");
}

/** Report who the active session currently is (label/email/tier/model/expiry). */
export function getActiveIdentity(): Promise<ActiveIdentity> {
  ensureTauri("get_active_identity");
  return invoke<ActiveIdentity>("get_active_identity");
}

/** Capture the currently-logged-in account into the vault + account index. */
export function addAccountFromActive(): Promise<AccountMeta> {
  ensureTauri("add_account_from_active");
  return invoke<AccountMeta>("add_account_from_active");
}

/** Switch the active subscription account to `id`. */
export function switchAccount(id: string): Promise<SwitchResult> {
  ensureTauri("switch_account");
  return invoke<SwitchResult>("switch_account", { id });
}

/** Remove a saved account from the vault + account index. */
export function removeAccount(id: string): Promise<void> {
  ensureTauri("remove_account");
  return invoke<void>("remove_account", { id });
}

/** List configured API-provider presets (non-secret metadata only). */
export function listProviders(): Promise<ProviderMeta[]> {
  ensureTauri("list_providers");
  return invoke<ProviderMeta[]>("list_providers");
}

/** Read one saved provider as a token-free view (full payload + `hasToken`). */
export function getProvider(id: string): Promise<ProviderConfigView> {
  ensureTauri("get_provider");
  return invoke<ProviderConfigView>("get_provider", { id });
}

/**
 * Create or replace a provider (upsert), returning the saved token-free view.
 * `token` is the only secret-bearing value here: pass it ONLY when the user
 * (re)types it; omit it to leave any existing vaulted token untouched. It travels
 * webview → Rust (input only, written to the vault) and is never echoed back.
 */
export function saveProvider(
  input: ProviderConfigInput,
  token?: string,
): Promise<ProviderConfigView> {
  ensureTauri("save_provider");
  return invoke<ProviderConfigView>("save_provider", { input, token });
}

/** Delete a provider from the index and its vaulted token (idempotent). */
export function deleteProvider(id: string): Promise<void> {
  ensureTauri("delete_provider");
  return invoke<void>("delete_provider", { id });
}

/**
 * Activate a provider preset by merging `env` into `settings.json`.
 * `env` is an input-only block (may include the provider key); it is never echoed
 * back.
 */
export function applyProvider(
  meta: ProviderMeta,
  env: Record<string, string>,
): Promise<void> {
  ensureTauri("apply_provider");
  return invoke<void>("apply_provider", { meta, env });
}

/** Reset to the subscription by clearing ONLY the `env` block. */
export function clearProvider(): Promise<void> {
  ensureTauri("clear_provider");
  return invoke<void>("clear_provider");
}

/** Non-secret summary of `settings.json` (model, has-env, top-level keys). */
export function readSettingsSummary(): Promise<SettingsSummary> {
  ensureTauri("read_settings_summary");
  return invoke<SettingsSummary>("read_settings_summary");
}

/** Detect auth-relevant env vars that override or relocate what Clavis writes. */
export function detectEnvOverrides(): Promise<EnvOverrides> {
  ensureTauri("detect_env_overrides");
  return invoke<EnvOverrides>("detect_env_overrides");
}

/**
 * Aggregate local token usage from `~/.claude/projects/**` over the last
 * `rangeDays` days (0 ⇒ the core's default of 30). The core streams the session
 * logs and returns numbers only — token counts, model ids, dates, an estimated
 * cost — never a credential.
 */
export function readUsage(rangeDays: number): Promise<UsageSummary> {
  ensureTauri("read_usage");
  return invoke<UsageSummary>("read_usage", { rangeDays });
}

/**
 * List global MCP servers: enabled (from `~/.claude.json` `mcpServers`) + disabled
 * (from the Clavis stash), each normalized. `.credentials.json`/`mcpOAuth`
 * untouched.
 */
export function listMcpServers(): Promise<McpServer[]> {
  ensureTauri("list_mcp_servers");
  return invoke<McpServer[]>("list_mcp_servers");
}

/**
 * Create or replace a global MCP server (always enabled), returning the saved
 * normalized server. Writes `~/.claude.json` `mcpServers` atomically, preserving
 * every other key. The `env` block in `input` is the user's own per-server config
 * (input only; written to `~/.claude.json`).
 */
export function saveMcpServer(input: McpServerInput): Promise<McpServer> {
  ensureTauri("save_mcp_server");
  return invoke<McpServer>("save_mcp_server", { input });
}

/** Delete a global MCP server by name (from both `~/.claude.json` and the stash). */
export function deleteMcpServer(name: string): Promise<void> {
  ensureTauri("delete_mcp_server");
  return invoke<void>("delete_mcp_server", { name });
}

/**
 * Enable/disable a global MCP server by moving its definition between
 * `~/.claude.json` `mcpServers` and the disabled stash (never losing it).
 */
export function setMcpEnabled(name: string, on: boolean): Promise<void> {
  ensureTauri("set_mcp_enabled");
  return invoke<void>("set_mcp_enabled", { name, on });
}
