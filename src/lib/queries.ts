/**
 * TanStack Query data layer — the React shell's only typed window onto the S3
 * Rust core. Components call THESE hooks; they never import `ipc.ts` or
 * `invoke` directly.
 *
 * Each query/mutation wraps one (or, for `useCreateProvider`, a composed) IPC
 * call from {@link ./ipc}. Mutations invalidate the queries they affect on
 * success and normalise failures to an `Error` whose `.message` is the Rust
 * `CoreError` message (which serialises as `{ code, message }`).
 *
 * Outside the Tauri runtime (`vite dev`, the `#/gallery` route, a plain browser)
 * there is no backend: queries resolve to a clearly-LABELLED demo seed so the
 * gallery still renders, and mutations no-op by rejecting with a "desktop app
 * only" message the caller can surface. No token ever enters the query cache —
 * the only secret-bearing value is a provider key passed straight into a single
 * `useCreateProvider`/`useApplyProvider` submit and never stored.
 */
import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";

import * as ipc from "./ipc";
import { useShellStore } from "./store";
import type {
  AccountMeta,
  ActiveIdentity,
  EnvOverrides,
  ProviderConfigInput,
  ProviderConfigView,
  ProviderMeta,
  SettingsSummary,
  SwitchResult,
} from "./types";

/* ------------------------------------------------------------------------- *
 * Query keys — narrow tuples so mutations can invalidate precisely.
 * ------------------------------------------------------------------------- */
export const queryKeys = {
  accounts: ["accounts"] as const,
  providers: ["providers"] as const,
  /** One provider's full editor view, keyed by id (`provider:<id>`). */
  provider: (id: string) => ["provider", id] as const,
  activeIdentity: ["activeIdentity"] as const,
  envOverrides: ["envOverrides"] as const,
  settingsSummary: ["settingsSummary"] as const,
};

/* ------------------------------------------------------------------------- *
 * Demo seed — shown ONLY when not under Tauri. Every label is prefixed "DEMO"
 * so it can never be mistaken for a real captured account/provider.
 * ------------------------------------------------------------------------- */
const DEMO_ACCOUNTS: AccountMeta[] = [
  {
    id: "demo-personal",
    label: "DEMO · Personal",
    email: "demo@example.com",
    tier: "Max 5×",
    lastUsed: null,
  },
  {
    id: "demo-team",
    label: "DEMO · Team",
    email: "demo@team.example",
    tier: "Max 20×",
    lastUsed: null,
  },
];

const DEMO_PROVIDERS: ProviderMeta[] = [
  {
    id: "demo-zai",
    label: "DEMO · Z.ai",
    baseUrl: "https://api.z.ai/api/anthropic",
    model: "glm-4.6",
  },
  {
    id: "demo-kimi",
    label: "DEMO · Kimi K2",
    baseUrl: "https://api.moonshot.cn/anthropic",
    model: "kimi-k2-turbo",
  },
];

/**
 * A labelled demo provider view for off-Tauri rendering (the gallery / plain
 * browser). Seeded from the matching {@link DEMO_PROVIDERS} entry when the id is
 * known, else an empty draft. `hasToken` is always false — there is no vault here.
 */
function demoProviderView(id: string): ProviderConfigView {
  const seed = DEMO_PROVIDERS.find((p) => p.id === id);
  return {
    id: id || "demo-new",
    title: seed?.label ?? "DEMO · New provider",
    brand: "anthropic",
    env: {
      baseUrl: seed?.baseUrl ?? "",
      model: seed?.model ?? "",
      defaultSonnet: "",
      defaultHaiku: "",
      maxThinkingTokens: null,
      maxOutputTokens: null,
      httpsProxy: null,
      disableTelemetry: null,
    },
    config: {
      cleanupPeriodDays: null,
      includeCoAuthoredBy: null,
      outputStyle: null,
      forceLoginMethod: null,
      forceLoginOrgUuid: null,
      enableAllProjectMcpServers: null,
      enabledMcpServers: null,
    },
    hasToken: false,
  };
}

const DEMO_ACTIVE_IDENTITY: ActiveIdentity = {
  kind: "account",
  label: "DEMO · Personal",
  email: "demo@example.com",
  tier: "Max 5×",
  model: "claude-sonnet-4-5",
  expiresAt: null,
};

const DEMO_ENV_OVERRIDES: EnvOverrides = {
  oauthTokenSet: false,
  anthropicVars: [],
  configDirOverride: null,
};

const DEMO_SETTINGS_SUMMARY: SettingsSummary = {
  model: "claude-sonnet-4-5",
  hasEnv: false,
  topLevelKeys: ["model", "permissions"],
};

/** Message surfaced when a mutation is attempted outside the desktop app. */
export const DESKTOP_ONLY_MESSAGE =
  "This action is available in the Clavis desktop app only.";

/* ------------------------------------------------------------------------- *
 * Boundary helpers.
 * ------------------------------------------------------------------------- */

/** Extract the human message from a `CoreError` (`{ code, message }`) or Error. */
function coreErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
}

/** Query fetcher: demo seed off-Tauri, else the IPC call (errors normalised). */
async function runQuery<T>(demo: T, call: () => Promise<T>): Promise<T> {
  if (!isTauri()) return demo;
  try {
    return await call();
  } catch (error) {
    throw new Error(coreErrorMessage(error));
  }
}

/** Mutation runner: reject with the desktop-only message off-Tauri, else call. */
async function runMutation<T>(call: () => Promise<T>): Promise<T> {
  if (!isTauri()) throw new Error(DESKTOP_ONLY_MESSAGE);
  try {
    return await call();
  } catch (error) {
    throw new Error(coreErrorMessage(error));
  }
}

/* ------------------------------------------------------------------------- *
 * Queries.
 * ------------------------------------------------------------------------- */

/** Saved accounts (non-secret metadata only). */
export function useAccounts(): UseQueryResult<AccountMeta[], Error> {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => runQuery(DEMO_ACCOUNTS, ipc.listAccounts),
  });
}

/** Configured API-provider presets (non-secret metadata only). */
export function useProviders(): UseQueryResult<ProviderMeta[], Error> {
  return useQuery({
    queryKey: queryKeys.providers,
    queryFn: () => runQuery(DEMO_PROVIDERS, ipc.listProviders),
  });
}

/**
 * One provider's full editor view (payload + `hasToken`, never the token value).
 * Disabled when `id` is null (a brand-new draft has no row to load yet).
 */
export function useProvider(
  id: string | null,
): UseQueryResult<ProviderConfigView, Error> {
  return useQuery({
    queryKey: queryKeys.provider(id ?? ""),
    queryFn: () =>
      runQuery(demoProviderView(id ?? ""), () => ipc.getProvider(id as string)),
    enabled: id != null,
  });
}

/**
 * Who the active session currently is. As a side effect it hydrates the shell
 * store's thin `activeIdentity` cache so the Sidebar card + StatusBar paint
 * instantly without each reading the query.
 */
export function useActiveIdentity(): UseQueryResult<ActiveIdentity, Error> {
  const setActiveIdentity = useShellStore((s) => s.setActiveIdentity);
  const query = useQuery({
    queryKey: queryKeys.activeIdentity,
    queryFn: () => runQuery(DEMO_ACTIVE_IDENTITY, ipc.getActiveIdentity),
  });

  const data = query.data;
  useEffect(() => {
    if (!data) return;
    const kind =
      data.kind === "account" || data.kind === "provider" ? data.kind : "none";
    setActiveIdentity({
      kind,
      label: data.label,
      email: data.email,
      tier: data.tier,
      model: data.model,
    });
  }, [data, setActiveIdentity]);

  return query;
}

/** Auth-relevant env vars that override what Clavis writes. */
export function useEnvOverrides(): UseQueryResult<EnvOverrides, Error> {
  return useQuery({
    queryKey: queryKeys.envOverrides,
    queryFn: () => runQuery(DEMO_ENV_OVERRIDES, ipc.detectEnvOverrides),
  });
}

/** Non-secret summary of `settings.json`. */
export function useSettingsSummary(): UseQueryResult<SettingsSummary, Error> {
  return useQuery({
    queryKey: queryKeys.settingsSummary,
    queryFn: () => runQuery(DEMO_SETTINGS_SUMMARY, ipc.readSettingsSummary),
  });
}

/* ------------------------------------------------------------------------- *
 * Mutations. Each invalidates the queries it can change, on success.
 * ------------------------------------------------------------------------- */

/** Switch the active subscription account to `id`. */
export function useSwitchAccount(): UseMutationResult<
  SwitchResult,
  Error,
  string
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runMutation(() => ipc.switchAccount(id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts });
      void qc.invalidateQueries({ queryKey: queryKeys.activeIdentity });
      void qc.invalidateQueries({ queryKey: queryKeys.settingsSummary });
    },
  });
}

/** Input for {@link useApplyProvider}: the preset + its secret-bearing env block. */
export interface ApplyProviderInput {
  meta: ProviderMeta;
  /** Input-only; may include the provider key. Never stored after submit. */
  env: Record<string, string>;
}

/** Activate a provider preset by merging its `env` block into `settings.json`. */
export function useApplyProvider(): UseMutationResult<
  void,
  Error,
  ApplyProviderInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ meta, env }: ApplyProviderInput) =>
      runMutation(() => ipc.applyProvider(meta, env)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.providers });
      void qc.invalidateQueries({ queryKey: queryKeys.activeIdentity });
      void qc.invalidateQueries({ queryKey: queryKeys.settingsSummary });
    },
  });
}

/**
 * Input for {@link useSaveProvider}: the upsert payload + an optional new token.
 * The `token` is the only secret-bearing value; it is passed straight to the
 * mutation, sent ONLY when the user (re)types it, and never stored in state or
 * the query cache. Omit it to leave the existing vaulted token untouched.
 */
export interface SaveProviderInput {
  input: ProviderConfigInput;
  token?: string;
}

/** Create or replace a provider (upsert); invalidates the list + that provider. */
export function useSaveProvider(): UseMutationResult<
  ProviderConfigView,
  Error,
  SaveProviderInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, token }: SaveProviderInput) =>
      runMutation(() => ipc.saveProvider(input, token)),
    onSuccess: (view) => {
      void qc.invalidateQueries({ queryKey: queryKeys.providers });
      void qc.invalidateQueries({ queryKey: queryKeys.provider(view.id) });
    },
  });
}

/** Delete a provider (index + vaulted token); invalidates the list + that provider. */
export function useDeleteProvider(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runMutation(() => ipc.deleteProvider(id)),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.providers });
      void qc.invalidateQueries({ queryKey: queryKeys.provider(id) });
    },
  });
}

/** Reset to the subscription by clearing ONLY the `env` block. */
export function useClearProvider(): UseMutationResult<void, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => runMutation(() => ipc.clearProvider()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.activeIdentity });
      void qc.invalidateQueries({ queryKey: queryKeys.settingsSummary });
    },
  });
}

/** Capture the currently-logged-in account into the vault + account index. */
export function useAddCurrentAccount(): UseMutationResult<
  AccountMeta,
  Error,
  void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => runMutation(() => ipc.addAccountFromActive()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts });
      void qc.invalidateQueries({ queryKey: queryKeys.activeIdentity });
    },
  });
}

/** Forget a saved account (the live credential is untouched). */
export function useRemoveAccount(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runMutation(() => ipc.removeAccount(id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts });
      void qc.invalidateQueries({ queryKey: queryKeys.activeIdentity });
    },
  });
}

/**
 * Input for {@link useCreateProvider}: the preset fields plus the pasted key.
 * The `key` is passed straight to the mutation and never persisted in state.
 */
export interface CreateProviderInput {
  /** Stable id; derived from the label when omitted. */
  id?: string;
  label: string;
  baseUrl: string;
  model: string | null;
  key: string;
}

/** A url/label-safe slug, used when a provider id is not supplied. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "provider"
  );
}

/**
 * Create + activate a provider preset.
 *
 * NOTE: the S3 IPC surface has no dedicated "persist preset" command — the only
 * path that accepts a fresh `ProviderMeta` + secret is `apply_provider`, so
 * creating a preset currently means applying it (writing its `env` block). The
 * metadata index write is an S3 gap to close before the preset survives a
 * `list_providers` refresh.
 */
export function useCreateProvider(): UseMutationResult<
  void,
  Error,
  CreateProviderInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label, baseUrl, model, key }: CreateProviderInput) =>
      runMutation(() => {
        const meta: ProviderMeta = {
          id: id ?? slugify(label),
          label,
          baseUrl,
          model,
        };
        const env: Record<string, string> = {
          ANTHROPIC_BASE_URL: baseUrl,
          ANTHROPIC_AUTH_TOKEN: key,
        };
        if (model) env.ANTHROPIC_MODEL = model;
        return ipc.applyProvider(meta, env);
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.providers });
      void qc.invalidateQueries({ queryKey: queryKeys.activeIdentity });
      void qc.invalidateQueries({ queryKey: queryKeys.settingsSummary });
    },
  });
}
