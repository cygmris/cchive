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
  listCodexAccounts: vi.fn(),
  getActiveCodexIdentity: vi.fn(),
  addCodexAccountFromActive: vi.fn(),
  switchCodexAccount: vi.fn(),
  removeCodexAccount: vi.fn(),
}));

import * as ipc from "@/lib/ipc";
import { ConfigurationsScreen } from "./index";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import { useShellStore } from "@/lib/store";
import type {
  AccountMeta,
  ActiveIdentity,
  CodexAccountMeta,
  CodexIdentity,
  ProviderMeta,
} from "@/lib/types";

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

// A live account identity whose email matches no saved account → uncaptured.
const UNCAPTURED_ACTIVE: ActiveIdentity = {
  kind: "account",
  label: "Fresh Login",
  email: "fresh@new.dev",
  tier: "Max 5×",
  model: "claude-sonnet-4-5",
  expiresAt: null,
};

// A live account identity that matches ACCOUNTS[0] by email → already captured.
const CAPTURED_ACTIVE: ActiveIdentity = {
  kind: "account",
  label: "Personal",
  email: "me@personal.dev",
  tier: "Max 5×",
  model: "claude-sonnet-4-5",
  expiresAt: null,
};

const NO_OVERRIDE = {
  oauthTokenSet: false,
  anthropicVars: [],
  configDirOverride: null,
};

const CODEX_ACCOUNTS: CodexAccountMeta[] = [
  {
    id: "codex-1",
    label: "Ada Codex",
    email: "ada@codex.dev",
    plan: "ChatGPT Pro",
    lastUsed: null,
  },
  {
    id: "codex-2",
    label: "Studio Codex",
    email: "studio@codex.dev",
    plan: "ChatGPT Plus",
    lastUsed: null,
  },
];

const CODEX_NONE: CodexIdentity = {
  kind: "none",
  label: "No Codex account",
  email: null,
  plan: null,
  expiresAt: null,
};

// The explicit add-account trigger; swapped for a spy so the capture path is
// observable without rendering the (shell-owned) modal.
const openAddAccount = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useShellStore.setState({
    activeScreen: "configs",
    paletteOpen: false,
    addAccountOpen: false,
    openAddAccount,
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
  (ipc.listCodexAccounts as Mock).mockResolvedValue(CODEX_ACCOUNTS);
  (ipc.getActiveCodexIdentity as Mock).mockResolvedValue(CODEX_NONE);
  (ipc.switchCodexAccount as Mock).mockResolvedValue(CODEX_NONE);
  (ipc.removeCodexAccount as Mock).mockResolvedValue(undefined);
  (ipc.addCodexAccountFromActive as Mock).mockResolvedValue(CODEX_ACCOUNTS[0]);
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

  it("names the detected account in the empty state and captures it on click", async () => {
    const user = userEvent.setup();
    (ipc.listAccounts as Mock).mockResolvedValue([]);
    (ipc.getActiveIdentity as Mock).mockResolvedValue(UNCAPTURED_ACTIVE);
    renderScreen();

    expect(
      await screen.findByText("You're signed in as fresh@new.dev"),
    ).toBeInTheDocument();

    // Two "Add current account" buttons share the name (section header + empty
    // state); both open the explicit modal, so clicking the empty-state one
    // (last in the DOM) proves the capture affordance triggers openAddAccount.
    const buttons = screen.getAllByRole("button", {
      name: "Add current account",
    });
    await user.click(buttons[buttons.length - 1]);
    expect(openAddAccount).toHaveBeenCalled();
  });

  it("shows the uncaptured-active banner when other accounts already exist", async () => {
    (ipc.getActiveIdentity as Mock).mockResolvedValue(UNCAPTURED_ACTIVE);
    renderScreen();

    expect(
      await screen.findByText("Add the account you're signed into"),
    ).toBeInTheDocument();
    expect(screen.getByText("fresh@new.dev")).toBeInTheDocument();
  });

  it("shows neither the concrete empty copy nor the banner once captured", async () => {
    (ipc.getActiveIdentity as Mock).mockResolvedValue(CAPTURED_ACTIVE);
    renderScreen();

    // The saved rows still render…
    expect(await screen.findByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
    // …but the capture prompts are absent.
    expect(
      screen.queryByText("Add the account you're signed into"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/You're signed in as/)).not.toBeInTheDocument();
  });

  it("renders Codex accounts with plan + email and no token", async () => {
    renderScreen();

    expect(await screen.findByText("Ada Codex")).toBeInTheDocument();
    expect(screen.getByText("Studio Codex")).toBeInTheDocument();
    expect(screen.getByText("ada@codex.dev")).toBeInTheDocument();
    expect(screen.getByText("ChatGPT Pro")).toBeInTheDocument();
    // The section is labelled and never surfaces a token-shaped value.
    expect(screen.getByText("Codex accounts")).toBeInTheDocument();
    expect(screen.queryByText(/sk-/)).not.toBeInTheDocument();
    expect(screen.queryByText(/id_token|access_token/)).not.toBeInTheDocument();
  });

  it("selecting a Codex account row triggers a Codex switch", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByText("Studio Codex"));

    await waitFor(() =>
      expect(ipc.switchCodexAccount).toHaveBeenCalledWith("codex-2"),
    );
  });

  it("captures the live Codex account from the section header", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Ada Codex");
    await user.click(
      screen.getByRole("button", { name: "Add current Codex account" }),
    );

    await waitFor(() =>
      expect(ipc.addCodexAccountFromActive).toHaveBeenCalled(),
    );
  });
});
