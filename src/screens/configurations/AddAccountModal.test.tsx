/**
 * AddAccountModal tests — capturing the current account calls
 * `add_account_from_active`, and when the captured email is already saved the
 * toast says "updated" (the dedupe message) rather than "added".
 *
 * `@tauri-apps/api/core` is mocked true so the mutation runs against the real
 * query layer, and `@/lib/ipc` is mocked so the capture command is observable.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

vi.mock("@/lib/ipc", () => ({
  listAccounts: vi.fn(),
  addAccountFromActive: vi.fn(),
  getActiveIdentity: vi.fn(),
}));

import * as ipc from "@/lib/ipc";
import { AddAccountModal } from "./AddAccountModal";
import { queryKeys } from "@/lib/queries";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import { useShellStore } from "@/lib/store";
import type { AccountMeta } from "@/lib/types";

beforeEach(() => {
  vi.clearAllMocks();
  useShellStore.setState({ addAccountOpen: true });
  (ipc.listAccounts as Mock).mockResolvedValue([]);
});

function renderModal() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <AddAccountModal />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { qc, ...utils };
}

describe("AddAccountModal", () => {
  it("captures the current account and reports it as added", async () => {
    const captured: AccountMeta = {
      id: "acc-new",
      label: "New",
      email: "new@x.dev",
      tier: "Max 5×",
      lastUsed: null,
    };
    (ipc.addAccountFromActive as Mock).mockResolvedValue(captured);

    const user = userEvent.setup();
    renderModal();

    await screen.findByText("Add this account");
    await user.click(
      screen.getByRole("button", { name: /capture current account/i }),
    );

    await waitFor(() =>
      expect(ipc.addAccountFromActive).toHaveBeenCalledTimes(1),
    );
    expect(await screen.findByText("Account added")).toBeInTheDocument();
    // Closes the shared modal flag on success.
    await waitFor(() =>
      expect(useShellStore.getState().addAccountOpen).toBe(false),
    );
  });

  it("reports an existing email as updated (dedupe message)", async () => {
    const existing: AccountMeta = {
      id: "acc-1",
      label: "Personal",
      email: "dup@x.dev",
      tier: "Max 5×",
      lastUsed: null,
    };
    // Same email already in the list → the capture should be a refresh.
    (ipc.listAccounts as Mock).mockResolvedValue([existing]);
    (ipc.addAccountFromActive as Mock).mockResolvedValue({
      ...existing,
      tier: "Max 20×",
    });

    const user = userEvent.setup();
    const { qc } = renderModal();
    // Seed the cache so the dedupe check sees the existing email synchronously.
    qc.setQueryData(queryKeys.accounts, [existing]);

    await screen.findByText("Add this account");
    await user.click(
      screen.getByRole("button", { name: /capture current account/i }),
    );

    expect(await screen.findByText("Account updated")).toBeInTheDocument();
    expect(screen.queryByText("Account added")).not.toBeInTheDocument();
  });
});
