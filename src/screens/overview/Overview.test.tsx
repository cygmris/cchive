/**
 * Overview screen tests — the real landing screen composed purely over the
 * (mocked) query layer: the active-connection hero (account + provider variants
 * from `get_active_identity`), the four deep-linking stat tiles (counts from
 * accounts / enabled MCP / enabled skills / today's usage, each navigating via
 * `go`), the charts row (Output tokens + Tokens by model from `read_usage`), and
 * the recent-activity feed (`read_activity`, entries + empty state).
 *
 * `@tauri-apps/api/core` is mocked true so the query layer takes the real backend
 * path, `@/lib/ipc` is mocked so every command is an observable spy, and the
 * shell store's `go` action is swapped for a spy so navigation is asserted
 * without driving the real router. Behaviour, not implementation.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

vi.mock("@/lib/ipc", () => ({
  getActiveIdentity: vi.fn(),
  listProviders: vi.fn(),
  listAccounts: vi.fn(),
  listMcpServers: vi.fn(),
  listResources: vi.fn(),
  readUsage: vi.fn(),
  readActivity: vi.fn(),
}));

import * as ipc from "@/lib/ipc";
import { OverviewScreen } from "./index";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { useShellStore } from "@/lib/store";
import type {
  AccountMeta,
  ActiveIdentity,
  ActivityEntry,
  McpServer,
  ProviderMeta,
  Resource,
  UsageSummary,
} from "@/lib/types";

const ACCOUNT_IDENTITY: ActiveIdentity = {
  kind: "account",
  label: "Alex Rivera",
  email: "alex@gmail.com",
  tier: "Max 5×",
  model: "claude-sonnet-4-5",
  expiresAt: null,
};

const PROVIDER_IDENTITY: ActiveIdentity = {
  kind: "provider",
  label: "Z.ai",
  email: null,
  tier: null,
  model: "glm-4.6",
  expiresAt: null,
};

const PROVIDERS: ProviderMeta[] = [
  {
    id: "zai",
    label: "Z.ai",
    baseUrl: "https://api.z.ai/api/anthropic",
    model: "glm-4.6",
  },
];

// Three accounts → the "Claude accounts" tile reads 3.
const ACCOUNTS: AccountMeta[] = [
  { id: "a1", label: "Personal", email: "alex@gmail.com", tier: "Max 5×", lastUsed: null },
  { id: "a2", label: "Northwind", email: "alex@northwind.io", tier: "Max 20×", lastUsed: null },
  { id: "a3", label: "Side", email: "alex@side.dev", tier: "Pro", lastUsed: null },
];

// Two enabled + one disabled → the "MCP servers" tile reads 2.
const SERVERS: McpServer[] = [
  { name: "context7", transport: "stdio", command: "npx", args: ["-y"], env: null, url: null, scope: "user", enabled: true, toolsHint: null },
  { name: "exa", transport: "http", command: null, args: null, env: null, url: "https://mcp.exa.dev", scope: "user", enabled: true, toolsHint: null },
  { name: "serena", transport: "stdio", command: "uvx", args: null, env: null, url: null, scope: "user", enabled: false, toolsHint: null },
];

// One enabled + one disabled → the "Skills" tile reads 1.
const SKILLS: Resource[] = [
  { kind: "skill", name: "pdf-forms", description: "Fill PDFs.", bodyLines: 30, model: null, source: "Personal", enabled: true, path: "/s/pdf-forms/SKILL.md", argsHint: null, tools: null },
  { kind: "skill", name: "slack-digest", description: "Summarize Slack.", bodyLines: 18, model: null, source: "Plugin", enabled: false, path: "/s/slack-digest/SKILL.md", argsHint: null, tools: null },
];

// Today's output (the newest perDay entry) is 246_100 → "246.1K". perModel
// deliberately omits glm-4.6 so the provider hero's model badge stays unique.
const USAGE: UsageSummary = {
  rangeDays: 30,
  totals: { input: 1_000, output: 500, cacheCreation: 100, cacheRead: 4_000 },
  estCostUsd: 1.23,
  unknownModels: [],
  perDay: [
    { date: "2026-06-27", output: 120_000, input: 40_000, cacheRead: 90_000 },
    { date: "2026-06-28", output: 246_100, input: 50_000, cacheRead: 95_000 },
  ],
  perModel: [
    { model: "claude-sonnet-4-5", tokens: 3_100_000 },
    { model: "claude-haiku-4-5", tokens: 310_000 },
  ],
  heatmap: [],
};

const ACTIVITY: ActivityEntry[] = [
  { kind: "account", message: "Switched account to Personal", timestamp: Date.now() - 2 * 3_600_000 },
  { kind: "skill", message: "Enabled skill design-review", timestamp: Date.now() - 26 * 3_600_000 },
];

const go = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useShellStore.setState({ go, activeScreen: "overview", editingProviderId: null });
  (ipc.getActiveIdentity as Mock).mockResolvedValue(ACCOUNT_IDENTITY);
  (ipc.listProviders as Mock).mockResolvedValue(PROVIDERS);
  (ipc.listAccounts as Mock).mockResolvedValue(ACCOUNTS);
  (ipc.listMcpServers as Mock).mockResolvedValue(SERVERS);
  (ipc.listResources as Mock).mockResolvedValue(SKILLS);
  (ipc.readUsage as Mock).mockResolvedValue(USAGE);
  (ipc.readActivity as Mock).mockResolvedValue(ACTIVITY);
});

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <OverviewScreen />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("OverviewScreen hero", () => {
  it("renders the account variant from the active identity", async () => {
    renderScreen();

    // The eyebrow paints before the query settles, so await the resolved name.
    expect(await screen.findByText("Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("Active account")).toBeInTheDocument();
    expect(screen.getByText("alex@gmail.com")).toBeInTheDocument();
    expect(screen.getByText("Claude Max 5×")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Manage account" }),
    ).toBeInTheDocument();
  });

  it("renders the provider variant when the identity is a provider", async () => {
    (ipc.getActiveIdentity as Mock).mockResolvedValue(PROVIDER_IDENTITY);
    renderScreen();

    expect(await screen.findByText("Active configuration")).toBeInTheDocument();
    expect(screen.getByText("Z.ai")).toBeInTheDocument();
    expect(
      screen.getByText("https://api.z.ai/api/anthropic"),
    ).toBeInTheDocument();
    // The model id badge (perModel omits glm-4.6, so this is unique).
    expect(screen.getByText("glm-4.6")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit config" }),
    ).toBeInTheDocument();
  });

  it("shows the org alongside the email in the hero sub when present", async () => {
    (ipc.getActiveIdentity as Mock).mockResolvedValue({
      ...ACCOUNT_IDENTITY,
      org: "Northwind Labs",
    });
    renderScreen();

    expect(
      await screen.findByText("alex@gmail.com · Northwind Labs"),
    ).toBeInTheDocument();
  });
});

describe("OverviewScreen stat tiles", () => {
  it("shows the counts derived from the mocked queries", async () => {
    renderScreen();

    // The tiles paint "—" until each query settles, so await each resolved count.
    const accounts = await screen.findByRole("button", {
      name: /Claude accounts/,
    });
    expect(await within(accounts).findByText("3")).toBeInTheDocument();

    const mcp = screen.getByRole("button", { name: /MCP servers/ });
    expect(await within(mcp).findByText("2")).toBeInTheDocument();

    const skills = screen.getByRole("button", { name: /Skills/ });
    expect(await within(skills).findByText("1")).toBeInTheDocument();

    const tokens = screen.getByRole("button", { name: /Tokens today/ });
    expect(await within(tokens).findByText("246.1K")).toBeInTheDocument();
  });

  it("navigates to the matching screen when a tile is clicked", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: /Claude accounts/ }),
    );
    expect(go).toHaveBeenCalledWith("configs");

    await user.click(screen.getByRole("button", { name: /MCP servers/ }));
    expect(go).toHaveBeenCalledWith("mcp");

    await user.click(screen.getByRole("button", { name: /Skills/ }));
    expect(go).toHaveBeenCalledWith("skills");

    await user.click(screen.getByRole("button", { name: /Tokens today/ }));
    expect(go).toHaveBeenCalledWith("usage");
  });
});

describe("OverviewScreen charts", () => {
  it("renders both chart cards from the mocked usage", async () => {
    renderScreen();

    // The ranked model bars only paint once the usage query settles.
    expect(await screen.findByText("claude-sonnet-4-5")).toBeInTheDocument();
    expect(screen.getByText("claude-haiku-4-5")).toBeInTheDocument();
    expect(screen.getByText("Output tokens")).toBeInTheDocument();
    expect(screen.getByText("Tokens by model")).toBeInTheDocument();
  });
});

describe("OverviewScreen activity feed", () => {
  it("lists the mocked recent-activity entries", async () => {
    renderScreen();

    expect(
      await screen.findByText("Switched account to Personal"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enabled skill design-review"),
    ).toBeInTheDocument();
  });

  it("shows the empty state when there is no activity", async () => {
    (ipc.readActivity as Mock).mockResolvedValue([]);
    renderScreen();

    expect(
      await screen.findByText("No recent activity yet."),
    ).toBeInTheDocument();
  });
});
