/**
 * Sidebar tests — active-state styling and Editor → Configurations affinity.
 *
 * The active nav item is marked `aria-current="page"`, driven by the store's
 * `activeScreen`. Configurations stays the active item when the Config Editor
 * (`editor`, absent from the nav) is open. Clicking a nav item navigates.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "./Sidebar";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import { useShellStore } from "@/lib/store";

beforeEach(() => {
  useShellStore.setState({
    activeScreen: "overview",
    paletteOpen: false,
    switcherOpen: false,
  });
});

function renderSidebar() {
  // The footer's AccountSwitcher reads the query layer, so the tree needs a
  // QueryClient just like the real app (queries resolve to the demo seed here).
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
});
