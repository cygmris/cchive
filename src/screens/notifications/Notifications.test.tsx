/**
 * NotificationsScreen tests — the desktop-notification-hook manager wired through
 * the (mocked) query layer: it renders the three toggle rows (Completion /
 * General / Tool-use) from the derived state, flipping a row installs or removes
 * the cchive-marked hook via `set_notification`, and "Test" fires a live preview
 * via `test_notification`.
 *
 * `@tauri-apps/api/core` is mocked true so the query layer hits the real backend
 * path, `@/lib/ipc` is mocked so every command (including `test_notification`) is
 * an observable spy, and `@tauri-apps/plugin-notification` is mocked so the Test
 * action never touches a real notification permission/toast under jsdom.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue("granted"),
  sendNotification: vi.fn(),
}));

vi.mock("@/lib/ipc", () => ({
  readNotificationState: vi.fn(),
  setNotification: vi.fn(),
  testNotification: vi.fn(),
}));

import * as ipc from "@/lib/ipc";
import { NotificationsScreen } from "./index";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import type { NotificationState } from "@/lib/types";

// Completion + General installed, Tool-use off — exercises both switch states.
const STATE: NotificationState = {
  completion: true,
  general: true,
  toolUse: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  (ipc.readNotificationState as Mock).mockResolvedValue(STATE);
  (ipc.setNotification as Mock).mockResolvedValue(undefined);
  (ipc.testNotification as Mock).mockResolvedValue(undefined);
});

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <NotificationsScreen />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("NotificationsScreen", () => {
  it("renders the three rows from the derived state", async () => {
    renderScreen();

    expect(await screen.findByText("Completion notifications")).toBeInTheDocument();
    expect(screen.getByText("General notifications")).toBeInTheDocument();
    expect(screen.getByText("Tool-use notifications")).toBeInTheDocument();

    // The switches reflect the real installed state once it loads from disk.
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Completion notifications" }),
      ).toBeChecked(),
    );
    expect(
      screen.getByRole("switch", { name: "General notifications" }),
    ).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Tool-use notifications" }),
    ).not.toBeChecked();
  });

  it("toggling an off row on calls set_notification(kind, true)", async () => {
    const user = userEvent.setup();
    renderScreen();

    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Tool-use notifications" }),
      ).not.toBeChecked(),
    );
    await user.click(
      screen.getByRole("switch", { name: "Tool-use notifications" }),
    );

    await waitFor(() =>
      expect(ipc.setNotification).toHaveBeenCalledWith("toolUse", true),
    );
  });

  it("toggling an on row off calls set_notification(kind, false)", async () => {
    const user = userEvent.setup();
    renderScreen();

    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Completion notifications" }),
      ).toBeChecked(),
    );
    await user.click(
      screen.getByRole("switch", { name: "Completion notifications" }),
    );

    await waitFor(() =>
      expect(ipc.setNotification).toHaveBeenCalledWith("completion", false),
    );
  });

  it("Test fires a live preview for that row via test_notification(kind)", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("General notifications");
    await user.click(
      screen.getByRole("button", { name: "Test General notifications" }),
    );

    await waitFor(() =>
      expect(ipc.testNotification).toHaveBeenCalledWith("general"),
    );
    expect(ipc.testNotification).toHaveBeenCalledTimes(1);
  });
});
