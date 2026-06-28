/**
 * Shell-level counts test — `useGlobalData` hydrates the StatusBar from any screen.
 *
 * The status bar reads its MCP / Skills / tokens-today values from the shell
 * store, which the count queries hydrate as a side effect. `useGlobalData` mounts
 * those queries once at the shell root so the values populate regardless of which
 * screen the app booted into. Proven here by mounting ONLY the status bar (no MCP
 * / Skills / Usage / Overview screen) with the active screen set to a non-Overview
 * screen and the counts at their `0` placeholders — so any value the status bar
 * shows must have come from the shared cache via `useGlobalData`.
 *
 * `@tauri-apps/api/core` is mocked true so the query layer takes the real backend
 * path, and `@/lib/ipc` is mocked so the count commands resolve to fixtures.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

vi.mock("@/lib/ipc", () => ({
  listAccounts: vi.fn(),
  listMcpServers: vi.fn(),
  listResources: vi.fn(),
  readUsage: vi.fn(),
}));

import * as ipc from "@/lib/ipc";
import { StatusBar } from "./StatusBar";
import { useGlobalData } from "./useGlobalData";
import { useShellStore } from "@/lib/store";
import type { AccountMeta, McpServer, Resource, UsageSummary } from "@/lib/types";

const ACCOUNTS: AccountMeta[] = [
  { id: "a1", label: "Personal", email: "a@x.io", tier: "Max 5×", lastUsed: null },
];

// Two enabled + one disabled → the status bar MCP count reads 2.
const SERVERS: McpServer[] = [
  { name: "context7", transport: "stdio", command: "npx", args: null, env: null, url: null, scope: "user", enabled: true, toolsHint: null },
  { name: "exa", transport: "http", command: null, args: null, env: null, url: "https://mcp.exa.dev", scope: "user", enabled: true, toolsHint: null },
  { name: "serena", transport: "stdio", command: "uvx", args: null, env: null, url: null, scope: "user", enabled: false, toolsHint: null },
];

// One enabled + one disabled → the status bar Skills count reads 1.
const SKILLS: Resource[] = [
  { kind: "skill", name: "pdf-forms", description: "Fill PDFs.", bodyLines: 30, model: null, source: "Personal", enabled: true, path: "/s/pdf/SKILL.md", argsHint: null, tools: null },
  { kind: "skill", name: "slack-digest", description: "Slack.", bodyLines: 18, model: null, source: "Plugin", enabled: false, path: "/s/slack/SKILL.md", argsHint: null, tools: null },
];

// Today's output (the newest perDay entry) is 84_200 → "84.2K".
const USAGE: UsageSummary = {
  rangeDays: 30,
  totals: { input: 1_000, output: 500, cacheCreation: 100, cacheRead: 4_000 },
  estCostUsd: 1.23,
  unknownModels: [],
  perDay: [
    { date: "2026-06-27", output: 40_000, input: 10_000, cacheRead: 20_000 },
    { date: "2026-06-28", output: 84_200, input: 12_000, cacheRead: 22_000 },
  ],
  perModel: [],
  heatmap: [],
};

/** Mounts the shell-level data hook with ONLY the status bar — no count screen. */
function ShellHarness() {
  useGlobalData();
  return <StatusBar />;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Boot into a NON-Overview screen with the counts at their 0 placeholders, so
  // any value the status bar shows must come from the shell-level useGlobalData.
  useShellStore.setState({
    activeScreen: "settings",
    activeIdentity: {
      kind: "none",
      label: "No active config",
      email: null,
      tier: null,
      model: "—",
      mcpEnabledCount: 0,
      skillsEnabledCount: 0,
      tokensToday: "0",
    },
  });
  (ipc.listAccounts as Mock).mockResolvedValue(ACCOUNTS);
  (ipc.listMcpServers as Mock).mockResolvedValue(SERVERS);
  (ipc.listResources as Mock).mockResolvedValue(SKILLS);
  (ipc.readUsage as Mock).mockResolvedValue(USAGE);
});

function renderShell() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ShellHarness />
    </QueryClientProvider>,
  );
}

describe("useGlobalData → StatusBar", () => {
  it("populates the status-bar counts from the shared cache on a non-Overview screen", async () => {
    renderShell();

    // tokens-today is the most specific value; await it, then assert the counts.
    expect(await screen.findByText("84.2K")).toBeInTheDocument();
    expect(await screen.findByText("2")).toBeInTheDocument(); // enabled MCP servers
    expect(await screen.findByText("1")).toBeInTheDocument(); // enabled skills
  });
});
