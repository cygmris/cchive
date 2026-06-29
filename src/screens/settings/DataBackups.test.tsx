/**
 * Data & backups + Test-latency UI tests — the two S15 surfaces wired through the
 * (mocked) query layer:
 *
 *  - the Settings "Data & backups" Card: Export calls `export_config` and toasts
 *    where the secret-free JSON was saved; Import calls `import_config` and toasts
 *    the {@link ImportSummary} counts; the Backups list renders the rotating
 *    snapshots newest-first and a confirm-guarded Restore calls `restore_backup`;
 *  - the config-editor "Test latency" action: it calls `test_latency` with the
 *    provider's base URL (no auth header) and shows the round-trip ms.
 *
 * `@tauri-apps/api/core` is mocked so the query layer takes the real backend path
 * (no demo fallback) and `@/lib/ipc` is mocked so every command — including the
 * one the export/import dialog would normally drive — is an observable spy (the
 * native dialog never runs). `@tauri-apps/api/app` + `@tauri-apps/plugin-opener`
 * are mocked so the Settings version row + issue link don't reach for a Tauri
 * runtime under jsdom.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("1.0.0"),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ipc", () => ({
  getAutostart: vi.fn(),
  setAutostart: vi.fn(),
  listBackups: vi.fn(),
  exportConfig: vi.fn(),
  importConfig: vi.fn(),
  restoreBackup: vi.fn(),
  appendActivity: vi.fn(),
  getProvider: vi.fn(),
  saveProvider: vi.fn(),
  deleteProvider: vi.fn(),
  testLatency: vi.fn(),
}));

import * as ipc from "@/lib/ipc";
import { SettingsScreen } from "./index";
import { ConfigEditorScreen } from "@/screens/config-editor";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import { useShellStore } from "@/lib/store";
import type { BackupEntry, ImportSummary, ProviderConfigView } from "@/lib/types";

/** Two rotating snapshots, newest-first (matching the real `list` order). */
const BACKUPS: BackupEntry[] = [
  {
    id: "settings.json.1717200000000.bak",
    original: "settings.json",
    timestamp: 1_717_200_000_000,
    size: 2_048,
  },
  {
    id: ".claude.json.1717100000000.bak",
    original: ".claude.json",
    timestamp: 1_717_100_000_000,
    size: 512,
  },
];

const IMPORT_SUMMARY: ImportSummary = {
  providersAdded: 1,
  providersUpdated: 0,
  prefsApplied: 2,
};

/** A saved provider with a base URL the latency action probes (no token needed). */
const VIEW: ProviderConfigView = {
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
  hasToken: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  useShellStore.setState({ editingProviderId: "prov-1" });
  (ipc.getAutostart as Mock).mockResolvedValue(false);
  (ipc.setAutostart as Mock).mockResolvedValue(undefined);
  (ipc.listBackups as Mock).mockResolvedValue(BACKUPS);
  (ipc.exportConfig as Mock).mockResolvedValue("/home/me/cchive-config.json");
  (ipc.importConfig as Mock).mockResolvedValue(IMPORT_SUMMARY);
  (ipc.restoreBackup as Mock).mockResolvedValue(undefined);
  (ipc.appendActivity as Mock).mockResolvedValue(undefined);
  (ipc.getProvider as Mock).mockResolvedValue(VIEW);
  (ipc.saveProvider as Mock).mockResolvedValue(VIEW);
  (ipc.deleteProvider as Mock).mockResolvedValue(undefined);
  (ipc.testLatency as Mock).mockResolvedValue({ ms: 128, ok: true, status: 200 });
});

function renderSettings() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <SettingsScreen />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

function renderEditor() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <ConfigEditorScreen />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("Data & backups card", () => {
  it("Export calls export_config and toasts where the JSON was saved", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: /Export/ }));

    await waitFor(() => expect(ipc.exportConfig).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Configuration exported")).toBeInTheDocument();
    expect(screen.getByText(/cchive-config\.json/)).toBeInTheDocument();
  });

  it("Import calls import_config and toasts the summary counts", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: /Import/ }));

    await waitFor(() => expect(ipc.importConfig).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Configuration imported")).toBeInTheDocument();
    // The summary counts are surfaced verbatim in the success toast.
    expect(
      screen.getByText("1 added, 0 updated, 2 preferences applied."),
    ).toBeInTheDocument();
  });

  it("renders the backups newest-first from the query", async () => {
    renderSettings();

    expect(await screen.findByText("settings.json")).toBeInTheDocument();
    expect(screen.getByText(".claude.json")).toBeInTheDocument();
  });

  it("Restore confirms first, then calls restore_backup with the backup id", async () => {
    // A single backup keeps the trigger unambiguous before the confirm opens.
    (ipc.listBackups as Mock).mockResolvedValue([BACKUPS[0]]);
    const user = userEvent.setup();
    renderSettings();
    await screen.findByText("settings.json");

    // Opening the confirm popover must not restore on its own.
    await user.click(screen.getByRole("button", { name: "Restore" }));
    const dialog = await screen.findByRole("dialog");
    expect(ipc.restoreBackup).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Restore" }));

    await waitFor(() =>
      expect(ipc.restoreBackup).toHaveBeenCalledWith(BACKUPS[0].id),
    );
  });
});

describe("config-editor Test-latency action", () => {
  it("Test latency calls test_latency with the base URL and shows the ms", async () => {
    const user = userEvent.setup();
    renderEditor();

    const probe = await screen.findByRole("button", { name: /Test latency/ });
    await user.click(probe);

    await waitFor(() =>
      expect(ipc.testLatency).toHaveBeenCalledWith(
        "https://api.z.ai/api/anthropic",
      ),
    );
    expect(await screen.findByText("128 ms")).toBeInTheDocument();
  });
});
