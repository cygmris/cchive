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
  readUsage: vi.fn(),
  listMcpServers: vi.fn(),
  saveMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
  setMcpEnabled: vi.fn(),
  listResources: vi.fn(),
  getResource: vi.fn(),
  saveResource: vi.fn(),
  deleteResource: vi.fn(),
  setSkillEnabled: vi.fn(),
  readMemory: vi.fn(),
  writeMemory: vi.fn(),
  listProjects: vi.fn(),
  readProjectSettings: vi.fn(),
  writeProjectSettings: vi.fn(),
  appendActivity: vi.fn(),
  readActivity: vi.fn(),
  readNotificationState: vi.fn(),
  setNotification: vi.fn(),
}));

import * as ipc from "./ipc";
import {
  queryKeys,
  useAccounts,
  useActiveIdentity,
  useActivity,
  useAddCurrentAccount,
  useApplyProvider,
  useClearProvider,
  useCreateProvider,
  useDeleteMcpServer,
  useDeleteProvider,
  useEnvOverrides,
  useMcpServers,
  useMemory,
  useNotifications,
  useProjects,
  useProjectSettings,
  useProvider,
  useProviders,
  useRemoveAccount,
  useResources,
  useSaveMcpServer,
  useSaveMemory,
  useSaveProjectSettings,
  useSaveProvider,
  useSaveResource,
  useSetNotification,
  useSettingsSummary,
  useSkillEnabled,
  useSwitchAccount,
  useToggleMcpServer,
  useDeleteResource,
  useUsage,
} from "./queries";
import type {
  ActiveIdentity,
  ActivityEntry,
  McpServer,
  McpServerInput,
  MemoryDoc,
  MemoryScope,
  NotificationState,
  Project,
  ProjectSettings,
  ProviderConfigInput,
  ProviderConfigView,
  Resource,
  ResourceKind,
  UsageSummary,
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

const USAGE_SUMMARY: UsageSummary = {
  rangeDays: 7,
  totals: { input: 1_000, output: 500, cacheCreation: 100, cacheRead: 4_000 },
  estCostUsd: 1.23,
  unknownModels: [],
  perDay: [{ date: "2026-06-28", output: 500, input: 1_000, cacheRead: 4_000 }],
  perModel: [{ model: "claude-sonnet-4-5", tokens: 5_600 }],
  heatmap: [{ date: "2026-06-28", tokens: 5_600, level: 4 }],
};

const MCP_SERVER: McpServer = {
  name: "context7",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@upstash/context7-mcp"],
  env: null,
  url: null,
  scope: "user",
  enabled: true,
  toolsHint: null,
};

const MCP_INPUT: McpServerInput = {
  name: "context7",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@upstash/context7-mcp"],
  env: null,
  url: null,
  scope: "user",
};

const SKILL: Resource = {
  kind: "skill",
  name: "pdf-forms",
  description: "Fill and parse PDF forms.",
  bodyLines: 30,
  model: null,
  source: "Personal",
  enabled: true,
  path: "/home/me/.claude/skills/pdf-forms/SKILL.md",
  argsHint: null,
  tools: null,
};

const MEMORY_DOC: MemoryDoc = {
  path: "/home/me/.claude/CLAUDE.md",
  content: "# My memory\n",
};

const PROJECTS: Project[] = [
  {
    path: "/home/me/code/alpha",
    name: "alpha",
    hasLocalSettings: true,
    lastActivity: null,
  },
];

const PROJECT_SETTINGS: ProjectSettings = {
  path: "/home/me/code/alpha",
  raw: `{ "permissions": { "allow": [], "deny": [] } }`,
};

const ACTIVITY: ActivityEntry[] = [
  { kind: "account", message: "Switched account to Personal", timestamp: 1_717_200_000_000 },
  { kind: "skill", message: "Enabled skill pdf-forms", timestamp: 1_717_100_000_000 },
];

const NOTIFICATION_STATE: NotificationState = {
  completion: true,
  general: false,
  toolUse: false,
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
  (ipc.readUsage as Mock).mockResolvedValue(USAGE_SUMMARY);
  (ipc.listMcpServers as Mock).mockResolvedValue([MCP_SERVER]);
  (ipc.saveMcpServer as Mock).mockResolvedValue(MCP_SERVER);
  (ipc.deleteMcpServer as Mock).mockResolvedValue(undefined);
  (ipc.setMcpEnabled as Mock).mockResolvedValue(undefined);
  (ipc.listResources as Mock).mockResolvedValue([SKILL]);
  (ipc.getResource as Mock).mockResolvedValue({ ...SKILL, raw: "---\n---\n" });
  (ipc.saveResource as Mock).mockResolvedValue(undefined);
  (ipc.deleteResource as Mock).mockResolvedValue(undefined);
  (ipc.setSkillEnabled as Mock).mockResolvedValue(undefined);
  (ipc.readMemory as Mock).mockResolvedValue(MEMORY_DOC);
  (ipc.writeMemory as Mock).mockResolvedValue(undefined);
  (ipc.listProjects as Mock).mockResolvedValue(PROJECTS);
  (ipc.readProjectSettings as Mock).mockResolvedValue(PROJECT_SETTINGS);
  (ipc.writeProjectSettings as Mock).mockResolvedValue(undefined);
  (ipc.readActivity as Mock).mockResolvedValue([]);
  (ipc.appendActivity as Mock).mockResolvedValue(undefined);
  (ipc.readNotificationState as Mock).mockResolvedValue(NOTIFICATION_STATE);
  (ipc.setNotification as Mock).mockResolvedValue(undefined);
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
    [
      "useMcpServers → listMcpServers",
      useMcpServers,
      ipc.listMcpServers as Mock,
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

describe("useUsage", () => {
  it("reads the usage aggregate for the given range via read_usage", async () => {
    const { result } = renderHook(() => useUsage(7), {
      wrapper: wrapperFor(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ipc.readUsage).toHaveBeenCalledTimes(1);
    expect(ipc.readUsage).toHaveBeenCalledWith(7);
    expect(result.current.data).toEqual(USAGE_SUMMARY);
  });

  it("re-queries with the new range when it changes", async () => {
    const { result, rerender } = renderHook(
      ({ range }: { range: number }) => useUsage(range),
      {
        wrapper: wrapperFor(newClient()),
        initialProps: { range: 30 },
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ipc.readUsage).toHaveBeenCalledWith(30);

    rerender({ range: 7 });
    await waitFor(() => expect(ipc.readUsage).toHaveBeenCalledWith(7));
  });
});

describe("useActivity", () => {
  it("reads the capped feed for the given limit via read_activity", async () => {
    (ipc.readActivity as Mock).mockResolvedValue(ACTIVITY);
    const { result } = renderHook(() => useActivity(6), {
      wrapper: wrapperFor(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ipc.readActivity).toHaveBeenCalledTimes(1);
    expect(ipc.readActivity).toHaveBeenCalledWith(6);
    expect(result.current.data).toEqual(ACTIVITY);
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

  it("appends a label-only activity entry and refreshes the feed on success", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSwitchAccount(), {
      wrapper: wrapperFor(qc),
    });

    await act(async () => {
      await result.current.mutateAsync("acc-1");
    });

    // The append carries the account label only — never a token.
    expect(ipc.appendActivity).toHaveBeenCalledWith(
      "account",
      "Switched account to Personal",
    );
    // The best-effort append then invalidates the activity feed (a microtask later).
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.activity }),
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

describe("MCP server hooks", () => {
  it("useMcpServers reads the server list via list_mcp_servers", async () => {
    const { result } = renderHook(() => useMcpServers(), {
      wrapper: wrapperFor(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ipc.listMcpServers).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual([MCP_SERVER]);
  });

  it("useSaveMcpServer upserts via save_mcp_server and invalidates the list", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSaveMcpServer(), {
      wrapper: wrapperFor(qc),
    });

    await act(async () => {
      await result.current.mutateAsync(MCP_INPUT);
    });

    expect(ipc.saveMcpServer).toHaveBeenCalledWith(MCP_INPUT);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.mcpServers });
  });

  it("useDeleteMcpServer deletes by name and invalidates the list", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteMcpServer(), {
      wrapper: wrapperFor(qc),
    });

    await act(async () => {
      await result.current.mutateAsync("context7");
    });

    expect(ipc.deleteMcpServer).toHaveBeenCalledWith("context7");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.mcpServers });
  });

  it("useToggleMcpServer moves a server via set_mcp_enabled and invalidates the list", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useToggleMcpServer(), {
      wrapper: wrapperFor(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({ name: "context7", on: false });
    });

    expect(ipc.setMcpEnabled).toHaveBeenCalledWith("context7", false);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.mcpServers });
  });
});

describe("markdown resource hooks", () => {
  const kinds: ResourceKind[] = ["agent", "command", "skill"];

  it.each(kinds)(
    "useResources(%s) reads that kind's list via list_resources",
    async (kind) => {
      const { result } = renderHook(() => useResources(kind), {
        wrapper: wrapperFor(newClient()),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(ipc.listResources).toHaveBeenCalledTimes(1);
      expect(ipc.listResources).toHaveBeenCalledWith(kind);
      expect(result.current.data).toEqual([SKILL]);
    },
  );

  it("useSaveResource writes via save_resource and invalidates that kind's list", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSaveResource(), {
      wrapper: wrapperFor(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({
        kind: "agent",
        name: "code-reviewer",
        raw: "---\nname: code-reviewer\n---\n",
      });
    });

    expect(ipc.saveResource).toHaveBeenCalledWith(
      "agent",
      "code-reviewer",
      "---\nname: code-reviewer\n---\n",
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.resources("agent"),
    });
  });

  it("useDeleteResource removes via delete_resource and invalidates that kind's list", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteResource(), {
      wrapper: wrapperFor(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({ kind: "command", name: "review-pr" });
    });

    expect(ipc.deleteResource).toHaveBeenCalledWith("command", "review-pr");
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.resources("command"),
    });
  });

  it("useSkillEnabled moves a skill via set_skill_enabled and invalidates the skills list", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSkillEnabled(), {
      wrapper: wrapperFor(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({ name: "pdf-forms", on: false });
    });

    expect(ipc.setSkillEnabled).toHaveBeenCalledWith("pdf-forms", false);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.resources("skill"),
    });
  });
});

describe("memory hooks", () => {
  it("useMemory reads the scope's CLAUDE.md via read_memory and returns it", async () => {
    const scope = { kind: "global" } as const;
    const { result } = renderHook(() => useMemory(scope), {
      wrapper: wrapperFor(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ipc.readMemory).toHaveBeenCalledWith(scope);
    expect(result.current.data).toEqual(MEMORY_DOC);
  });

  it("useMemory re-queries with the new scope when it changes", async () => {
    const { result, rerender } = renderHook(
      ({ scope }: { scope: MemoryScope }) => useMemory(scope),
      {
        wrapper: wrapperFor(newClient()),
        initialProps: { scope: { kind: "global" } as MemoryScope },
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ipc.readMemory).toHaveBeenCalledWith({ kind: "global" });

    const projectScope: MemoryScope = {
      kind: "project",
      path: "/home/me/code/alpha",
    };
    rerender({ scope: projectScope });
    await waitFor(() =>
      expect(ipc.readMemory).toHaveBeenCalledWith(projectScope),
    );
  });

  it("useSaveMemory writes via write_memory and invalidates that scope's memory", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSaveMemory(), {
      wrapper: wrapperFor(qc),
    });
    const scope = { kind: "global" } as const;

    await act(async () => {
      await result.current.mutateAsync({ scope, content: "# Updated\n" });
    });

    expect(ipc.writeMemory).toHaveBeenCalledWith(scope, "# Updated\n");
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.memory(scope),
    });
  });
});

describe("projects hooks", () => {
  it("useProjects reads the project list via list_projects", async () => {
    const { result } = renderHook(() => useProjects(), {
      wrapper: wrapperFor(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ipc.listProjects).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(PROJECTS);
  });

  it("useProjectSettings stays idle when null and reads with the path otherwise", async () => {
    const { result, rerender } = renderHook(
      ({ path }: { path: string | null }) => useProjectSettings(path),
      {
        wrapper: wrapperFor(newClient()),
        initialProps: { path: null as string | null },
      },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(ipc.readProjectSettings).not.toHaveBeenCalled();

    rerender({ path: "/home/me/code/alpha" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ipc.readProjectSettings).toHaveBeenCalledWith("/home/me/code/alpha");
    expect(result.current.data).toEqual(PROJECT_SETTINGS);
  });

  it("useSaveProjectSettings writes + invalidates that project's settings and the list", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSaveProjectSettings(), {
      wrapper: wrapperFor(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({
        path: "/home/me/code/alpha",
        raw: "{}",
      });
    });

    expect(ipc.writeProjectSettings).toHaveBeenCalledWith(
      "/home/me/code/alpha",
      "{}",
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.projectSettings("/home/me/code/alpha"),
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.projects });
  });
});

describe("notification hooks", () => {
  it("useNotifications reads the derived state via read_notification_state", async () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: wrapperFor(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ipc.readNotificationState).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(NOTIFICATION_STATE);
  });

  it("useSetNotification installs/removes via set_notification and invalidates the state", async () => {
    const qc = newClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSetNotification(), {
      wrapper: wrapperFor(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({ kind: "toolUse", on: true });
    });

    expect(ipc.setNotification).toHaveBeenCalledWith("toolUse", true);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.notifications,
    });
  });
});
