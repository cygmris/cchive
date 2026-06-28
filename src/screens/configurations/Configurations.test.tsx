/**
 * Configurations screen tests — the keyring renders accounts/providers from the
 * (mocked) query layer, selecting an account switches, sign-out confirms before
 * removing, the empty state appears with no accounts, and the env-override banner
 * shows only when the override is present.
 *
 * `@tauri-apps/api/core` is mocked so the query layer talks to the real backend
 * path, and `@/lib/ipc` is mocked so every command is an observable spy.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

vi.mock("@/lib/ipc", () => ({
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

import * as ipc from "@/lib/ipc";
import { ConfigurationsScreen } from "./index";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import { useShellStore } from "@/lib/store";
import type { AccountMeta, ActiveIdentity, ProviderMeta } from "@/lib/types";

const ACCOUNTS: AccountMeta[] = [
  {
    id: "acc-1",
    label: "Personal",
    email: "me@personal.dev",
    tier: "Max 5×",
    lastUsed: null,
  },
  {
    id: "acc-2",
    label: "Team",
    email: "me@team.dev",
    tier: "Max 20×",
    lastUsed: null,
  },
];

const PROVIDERS: ProviderMeta[] = [
  {
    id: "prov-zai",
    label: "Z.ai",
    baseUrl: "https://api.z.ai/api/anthropic",
    model: "glm-4.6",
  },
];

const NO_ACTIVE: ActiveIdentity = {
  kind: "none",
  label: "—",
  email: null,
  tier: null,
  model: null,
  expiresAt: null,
};

const NO_OVERRIDE = {
  oauthTokenSet: false,
  anthropicVars: [],
  configDirOverride: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  useShellStore.setState({
    activeScreen: "configs",
    paletteOpen: false,
    switcherOpen: false,
    addAccountOpen: false,
  });
  (ipc.listAccounts as Mock).mockResolvedValue(ACCOUNTS);
  (ipc.listProviders as Mock).mockResolvedValue(PROVIDERS);
  (ipc.getActiveIdentity as Mock).mockResolvedValue(NO_ACTIVE);
  (ipc.detectEnvOverrides as Mock).mockResolvedValue(NO_OVERRIDE);
  (ipc.readSettingsSummary as Mock).mockResolvedValue({
    model: null,
    hasEnv: false,
    topLevelKeys: [],
  });
  (ipc.switchAccount as Mock).mockResolvedValue({
    identity: NO_ACTIVE,
    applyNote: "",
  });
  (ipc.removeAccount as Mock).mockResolvedValue(undefined);
  (ipc.applyProvider as Mock).mockResolvedValue(undefined);
});

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <ConfigurationsScreen />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("ConfigurationsScreen", () => {
  it("renders accounts and providers from the query layer", async () => {
    renderScreen();

    expect(await screen.findByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("me@personal.dev")).toBeInTheDocument();
    expect(screen.getByText("Z.ai")).toBeInTheDocument();
    expect(screen.getByText("https://api.z.ai/api/anthropic")).toBeInTheDocument();
  });

  it("selecting an account row triggers a switch", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByText("Team"));

    await waitFor(() =>
      expect(ipc.switchAccount).toHaveBeenCalledWith("acc-2"),
    );
  });

  it("sign-out asks for confirmation then removes the account", async () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValue(true);
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Personal");
    await user.click(
      screen.getByRole("button", { name: "Sign out Personal" }),
    );

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(ipc.removeAccount).toHaveBeenCalledWith("acc-1"),
    );
    confirmSpy.mockRestore();
  });

  it("does not remove when the confirm is cancelled", async () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValue(false);
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Personal");
    await user.click(
      screen.getByRole("button", { name: "Sign out Personal" }),
    );

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(ipc.removeAccount).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("shows the empty state when there are no accounts", async () => {
    (ipc.listAccounts as Mock).mockResolvedValue([]);
    renderScreen();

    expect(
      await screen.findByText(/No Claude accounts captured yet/i),
    ).toBeInTheDocument();
  });

  it("shows the env-override banner only when the override is present", async () => {
    (ipc.detectEnvOverrides as Mock).mockResolvedValue({
      ...NO_OVERRIDE,
      oauthTokenSet: true,
    });
    renderScreen();

    expect(
      await screen.findByText(/Switching is overridden by an environment variable/i),
    ).toBeInTheDocument();
  });

  it("hides the env-override banner when no override is set", async () => {
    renderScreen();

    await screen.findByText("Personal");
    expect(
      screen.queryByText(/Switching is overridden by an environment variable/i),
    ).not.toBeInTheDocument();
  });
});
