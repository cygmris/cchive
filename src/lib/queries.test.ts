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
  useEnvOverrides,
  useProviders,
  useRemoveAccount,
  useSettingsSummary,
  useSwitchAccount,
} from "./queries";
import type { ActiveIdentity } from "./types";

const ACTIVE: ActiveIdentity = {
  kind: "account",
  label: "Personal",
  email: "me@personal.dev",
  tier: "Max 5×",
  model: "claude-sonnet-4-5",
  expiresAt: null,
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
