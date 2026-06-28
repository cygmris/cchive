/**
 * McpScreen tests — the MCP manager wired through the generic Collection and the
 * (mocked) query layer: it lists this machine's global servers, "Add server"
 * opens the form and saves the assembled input, the per-row toggle moves a
 * server via `set_mcp_enabled`, and Remove confirms before calling
 * `delete_mcp_server`.
 *
 * `@tauri-apps/api/core` is mocked true so the query layer hits the real backend
 * path, and `@/lib/ipc` is mocked so every command is an observable spy.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

vi.mock("@/lib/ipc", () => ({
  listMcpServers: vi.fn(),
  saveMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
  setMcpEnabled: vi.fn(),
}));

import * as ipc from "@/lib/ipc";
import { McpScreen } from "./index";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import type { McpServer } from "@/lib/types";

const SERVERS: McpServer[] = [
  {
    name: "context7",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
    env: null,
    url: null,
    scope: "user",
    enabled: true,
    toolsHint: "resolve-library-id, query-docs",
  },
  {
    name: "exa",
    transport: "http",
    command: null,
    args: null,
    env: null,
    url: "https://mcp.exa.dev",
    scope: "user",
    enabled: false,
    toolsHint: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  (ipc.listMcpServers as Mock).mockResolvedValue(SERVERS);
  (ipc.saveMcpServer as Mock).mockResolvedValue(SERVERS[0]);
  (ipc.deleteMcpServer as Mock).mockResolvedValue(undefined);
  (ipc.setMcpEnabled as Mock).mockResolvedValue(undefined);
});

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <McpScreen />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("McpScreen", () => {
  it("lists the global servers from the query layer", async () => {
    renderScreen();

    expect(await screen.findByText("context7")).toBeInTheDocument();
    expect(screen.getByText("exa")).toBeInTheDocument();
  });

  it("Add server opens the form and saves the assembled input", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("context7");
    await user.click(screen.getByRole("button", { name: "Add server" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "new-server");
    await user.type(within(dialog).getByLabelText("Command"), "npx");
    await user.click(within(dialog).getByRole("button", { name: "Add server" }));

    await waitFor(() =>
      expect(ipc.saveMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "new-server",
          transport: "stdio",
          command: "npx",
          scope: "user",
        }),
      ),
    );
  });

  it("flipping a server toggle calls set_mcp_enabled", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("context7");
    // context7 is enabled → toggling it off should disable it.
    await user.click(screen.getByRole("switch", { name: "Toggle context7" }));

    await waitFor(() =>
      expect(ipc.setMcpEnabled).toHaveBeenCalledWith("context7", false),
    );
  });

  it("Remove confirms before calling delete_mcp_server", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("context7");
    // The Remove action lives in the table row / detail pane, not the card.
    await user.click(screen.getByRole("radio", { name: "Table view" }));
    await user.click(screen.getByRole("button", { name: "Remove context7" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(ipc.deleteMcpServer).toHaveBeenCalledWith("context7"),
    );
    confirmSpy.mockRestore();
  });

  it("does not delete when the confirm is cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("context7");
    await user.click(screen.getByRole("radio", { name: "Table view" }));
    await user.click(screen.getByRole("button", { name: "Remove context7" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(ipc.deleteMcpServer).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
