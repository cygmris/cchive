/**
 * Query data-layer tests — each query hook calls the right IPC command, and the
 * mutations invalidate the queries they affect on success while surfacing the
 * Rust `CoreError` message on failure.
 *
 * `@tauri-apps/api/core` is mocked so `isTauri()` is true (the demo fallback is
 * bypassed) and `./ipc` is mocked to spy on every command — so the hooks are
 * exercised against the real TanStack Query machinery with a stubbed backend.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createElement, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

vi.mock("./ipc", () => ({
  listAccounts: vi.fn(),
  getActiveIdentity: vi.fn(),
  addAccountFromActive: vi.fn(),
  switchAccount: vi.fn(),
  removeAccount: vi.fn(),
  listProviders: vi.fn(),
  getProvider: vi.fn(),
  saveProvider: vi.fn(),
  deleteProvider: vi.fn(),
  applyProvider: vi.fn(),
  clearProvider: vi.fn(),
  readSettingsSummary: vi.fn(),
  detectEnvOverrides: vi.fn(),
}));

import * as ipc from "./ipc";
import {
  queryKeys,
  useAccounts,
  useActiveIdentity,
  useAddCurrentAccount,
  useApplyProvider,
  useClearProvider,
  useCreateProvider,
  useDeleteProvider,
  useEnvOverrides,
  useProvider,
  useProviders,
  useRemoveAccount,
  useSaveProvider,
  useSettingsSummary,
  useSwitchAccount,
} from "./queries";
import type {
  ActiveIdentity,
  ProviderConfigInput,
  ProviderConfigView,
} from "./types";

const ACTIVE: ActiveIdentity = {
  kind: "account",
  label: "Personal",
  email: "me@personal.dev",
  tier: "Max 5×",
  model: "claude-sonnet-4-5",
  expiresAt: null,
};

const PROVIDER_VIEW: ProviderConfigView = {
  id: "prov-1",
  title: "Z.ai",
  brand: "zai",
  env: {
    baseUrl: "https://api.z.ai/api/anthropic",
    model: "glm-4.6",
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
  hasToken: true,
};

const PROVIDER_INPUT: ProviderConfigInput = {
  title: "Z.ai",
  brand: "zai",
  env: PROVIDER_VIEW.env,
  config: PROVIDER_VIEW.config,
};

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  (ipc.listAccounts as Mock).mockResolvedValue([]);
  (ipc.listProviders as Mock).mockResolvedValue([]);
  (ipc.getActiveIdentity as Mock).mockResolvedValue(ACTIVE);
  (ipc.detectEnvOverrides as Mock).mockResolvedValue({
    oauthTokenSet: false,
    anthropicVars: [],
    configDirOverride: null,
  });
  (ipc.readSettingsSummary as Mock).mockResolvedValue({
    model: null,
    hasEnv: false,
    topLevelKeys: [],
  });
  (ipc.switchAccount as Mock).mockResolvedValue({
    identity: ACTIVE,
    applyNote: "",
  });
  (ipc.removeAccount as Mock).mockResolvedValue(undefined);
  (ipc.addAccountFromActive as Mock).mockResolvedValue({
    id: "acc-new",
    label: "New",
    email: "new@x.dev",
    tier: "Max 5×",
    lastUsed: null,
  });
  (ipc.applyProvider as Mock).mockResolvedValue(undefined);
  (ipc.clearProvider as Mock).mockResolvedValue(undefined);
  (ipc.getProvider as Mock).mockResolvedValue(PROVIDER_VIEW);
  (ipc.saveProvider as Mock).mockResolvedValue(PROVIDER_VIEW);
  (ipc.deleteProvider as Mock).mockResolvedValue(undefined);
});

describe("query hooks call the matching IPC command", () => {
  const cases: Array<[string, () => unknown, Mock]> = [
    ["useAccounts → listAccounts", useAccounts, ipc.listAccounts as Mock],
    ["useProviders → listProviders", useProviders, ipc.listProviders as Mock],
    [
      "useActiveIdentity → getActiveIdentity",
      useActiveIdentity,
      ipc.getActiveIdentity as Mock,
    ],
    [
      "useEnvOverrides → detectEnvOverrides",
      useEnvOverrides,
      ipc.detectEnvOverrides as Mock,
    ],
    [
      "useSettingsSummary → readSettingsSummary",
      useSettingsSummary,
      ipc.readSettingsSummary as Mock,
    ],
  ];

  it.each(cases)("%s", async (_name, hook, spy) => {
    const { result } = renderHook(() => hook() as { isSuccess: boolean }, {
      wrapper: wrapperFor(newClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("useSwitchAccount", () => {
  it("invokes switch_account and invalidates the affected queries", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSwitchAccount(), {
      wrapper: wrapperFor(qc),
    });

    await act(async () => {
      await result.current.mutateAsync("acc-1");
    });

    expect(ipc.switchAccount).toHaveBeenCalledWith("acc-1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.accounts });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.activeIdentity,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.settingsSummary,
    });
  });

  it("surfaces the CoreError message on failure", async () => {
    (ipc.switchAccount as Mock).mockRejectedValueOnce({
      code: "switch_failed",
      message: "rolled back: credential restored",
    });
    const { result } = renderHook(() => useSwitchAccount(), {
      wrapper: wrapperFor(newClient()),
    });

    await act(async () => {
      await expect(result.current.mutateAsync("acc-1")).rejects.toThrow(
        "rolled back: credential restored",
      );
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      "rolled back: credential restored",
    );
  });
});

describe("other mutations invalidate on success", () => {
  it("useAddCurrentAccount invalidates accounts + activeIdentity", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useAddCurrentAccount(), {
      wrapper: wrapperFor(qc),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(ipc.addAccountFromActive).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.accounts });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.activeIdentity,
    });
  });

  it("useRemoveAccount invokes remove_account with the id", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useRemoveAccount(), {
      wrapper: wrapperFor(qc),
    });

    await act(async () => {
      await result.current.mutateAsync("acc-9");
    });

    expect(ipc.removeAccount).toHaveBeenCalledWith("acc-9");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.accounts });
  });

  it("useApplyProvider passes meta + env straight to apply_provider", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useApplyProvider(), {
      wrapper: wrapperFor(qc),
    });
    const meta = {
      id: "p1",
      label: "Z.ai",
      baseUrl: "https://api.z.ai/api/anthropic",
      model: "glm-4.6",
    };
    const env = { ANTHROPIC_BASE_URL: meta.baseUrl };

    await act(async () => {
      await result.current.mutateAsync({ meta, env });
    });

    expect(ipc.applyProvider).toHaveBeenCalledWith(meta, env);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.providers });
  });

  it("useClearProvider invokes clear_provider", async () => {
    const { result } = renderHook(() => useClearProvider(), {
      wrapper: wrapperFor(newClient()),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(ipc.clearProvider).toHaveBeenCalledTimes(1);
  });

  it("useCreateProvider composes the env block and applies it", async () => {
    const { result } = renderHook(() => useCreateProvider(), {
      wrapper: wrapperFor(newClient()),
    });

    await act(async () => {
      await result.current.mutateAsync({
        label: "Kimi K2",
        baseUrl: "https://api.moonshot.cn/anthropic",
        model: "kimi-k2-turbo",
        key: "sk-secret",
      });
    });

    expect(ipc.applyProvider).toHaveBeenCalledTimes(1);
    const [meta, env] = (ipc.applyProvider as Mock).mock.calls[0];
    expect(meta).toMatchObject({
      id: "kimi-k2",
      label: "Kimi K2",
      baseUrl: "https://api.moonshot.cn/anthropic",
      model: "kimi-k2-turbo",
    });
    expect(env).toMatchObject({
      ANTHROPIC_BASE_URL: "https://api.moonshot.cn/anthropic",
      ANTHROPIC_AUTH_TOKEN: "sk-secret",
      ANTHROPIC_MODEL: "kimi-k2-turbo",
    });
  });
});

describe("provider editor hooks", () => {
  it("useProvider fetches get_provider with the id and stays disabled when null", async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useProvider(id),
      {
        wrapper: wrapperFor(newClient()),
        initialProps: { id: null as string | null },
      },
    );

    // A brand-new draft has no row to load → the query never fires.
    expect(result.current.fetchStatus).toBe("idle");
    expect(ipc.getProvider).not.toHaveBeenCalled();

    rerender({ id: "prov-1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(ipc.getProvider).toHaveBeenCalledWith("prov-1");
    expect(result.current.data).toEqual(PROVIDER_VIEW);
  });

  it("useSaveProvider passes input + token to save_provider and invalidates", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSaveProvider(), {
      wrapper: wrapperFor(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({
        input: PROVIDER_INPUT,
        token: "sk-fresh",
      });
    });

    expect(ipc.saveProvider).toHaveBeenCalledWith(PROVIDER_INPUT, "sk-fresh");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.providers });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.provider("prov-1"),
    });
  });

  it("useSaveProvider omits the token when none is supplied", async () => {
    const { result } = renderHook(() => useSaveProvider(), {
      wrapper: wrapperFor(newClient()),
    });

    await act(async () => {
      await result.current.mutateAsync({ input: PROVIDER_INPUT });
    });

    expect(ipc.saveProvider).toHaveBeenCalledWith(PROVIDER_INPUT, undefined);
  });

  it("useDeleteProvider deletes by id and invalidates the list + that provider", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteProvider(), {
      wrapper: wrapperFor(qc),
    });

    await act(async () => {
      await result.current.mutateAsync("prov-9");
    });

    expect(ipc.deleteProvider).toHaveBeenCalledWith("prov-9");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.providers });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.provider("prov-9"),
    });
  });
});
