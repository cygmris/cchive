/**
 * Sidebar tests — active-state styling, Editor → Configurations affinity, and
 * the footer account card.
 *
 * The active nav item is marked `aria-current="page"`, driven by the store's
 * `activeScreen`. Configurations stays the active item when the Config Editor
 * (`editor`, absent from the nav) is open. Clicking a nav item navigates. The
 * footer account card is a display-forward button: it shows the active identity
 * and navigates to Configurations — it no longer opens an inline switch popover.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "./Sidebar";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import { useShellStore } from "@/lib/store";
import { setLanguage } from "@/i18n";

beforeEach(() => {
  useShellStore.setState({
    activeScreen: "overview",
    paletteOpen: false,
  });
});

function renderSidebar() {
  // The shell mounts under a QueryClient like the real app. The footer account
  // card reads the active identity from the store (which queries hydrate in
  // production), so the footer tests set `activeIdentity` directly.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <Sidebar />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

const navItem = (name: string) => screen.getByRole("button", { name });

describe("Sidebar", () => {
  it("marks the active item for the current screen", () => {
    useShellStore.setState({ activeScreen: "mcp" });
    renderSidebar();

    expect(navItem("MCP")).toHaveAttribute("aria-current", "page");
    expect(navItem("Overview")).not.toHaveAttribute("aria-current");
  });

  it("keeps Configurations active when the Config Editor is open", () => {
    useShellStore.setState({ activeScreen: "editor" });
    renderSidebar();

    expect(navItem("Configurations")).toHaveAttribute("aria-current", "page");
    expect(navItem("Overview")).not.toHaveAttribute("aria-current");
  });

  it("navigates when a nav item is clicked", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(navItem("Projects"));
    expect(useShellStore.getState().activeScreen).toBe("projects");
    expect(navItem("Projects")).toHaveAttribute("aria-current", "page");
  });

  it("localizes the nav labels when the language changes", async () => {
    renderSidebar();
    try {
      expect(navItem("Overview")).toBeInTheDocument();

      await act(async () => {
        await setLanguage("zh-Hans");
      });

      expect(
        await screen.findByRole("button", { name: "概览" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Overview" })).toBeNull();
    } finally {
      // Restore the baseline so the other Sidebar tests still see English labels.
      await act(async () => {
        await setLanguage("en");
      });
    }
  });
});

describe("Sidebar footer account card", () => {
  const footerCard = () =>
    screen.getByRole("button", { name: "View accounts in Configurations" });

  it("navigates to Configurations and opens no switch popover when clicked", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(footerCard());

    // Display + navigate: the click routes to Configurations…
    expect(useShellStore.getState().activeScreen).toBe("configs");
    // …and no inline switch popover/menu is mounted (switching lives in
    // Configurations + the tray now).
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryAllByRole("menuitemradio")).toHaveLength(0);
    expect(footerCard()).not.toHaveAttribute("aria-haspopup");
  });

  it("renders the active identity label and avatar", () => {
    useShellStore.setState({
      activeIdentity: {
        kind: "account",
        label: "Ada Lovelace",
        email: "ada@example.com",
        tier: "Max",
        model: "—",
        mcpEnabledCount: 0,
        skillsEnabledCount: 0,
        tokensToday: "0",
      },
    });
    renderSidebar();

    const card = footerCard();
    // The active identity label still renders…
    expect(within(card).getByText("Ada Lovelace")).toBeInTheDocument();
    // …and the AccountAvatar still shows its gradient initials disc ("AL").
    expect(within(card).getByText("AL")).toBeInTheDocument();
  });
});
