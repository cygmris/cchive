/**
 * CommandPalette tests — substring filtering and real keyboard navigation.
 *
 * Opening is driven by the store (`paletteOpen`). Typing narrows the flat action
 * list; ArrowDown moves the selection and Enter activates it (here: navigate to
 * Configurations) and closes; Esc closes without acting.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette } from "./CommandPalette";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { useShellStore } from "@/lib/store";

beforeEach(() => {
  useShellStore.setState({
    activeScreen: "overview",
    paletteOpen: true,
    switcherOpen: false,
    activeConfigId: "claude-personal",
  });
});

function renderPalette() {
  return render(
    <ThemeProvider>
      <CommandPalette />
    </ThemeProvider>,
  );
}

describe("CommandPalette", () => {
  it("filters the action list down as the query narrows", async () => {
    const user = userEvent.setup();
    renderPalette();

    const before = screen.getAllByRole("option").length;
    expect(before).toBeGreaterThan(1);

    const input = screen.getByRole("textbox", { name: /search commands/i });
    await user.type(input, "overview");

    const options = screen.getAllByRole("option");
    expect(options.length).toBeLessThan(before);
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent(/overview/i);
  });

  it("shows a 'No results' row when nothing matches", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.type(
      screen.getByRole("textbox", { name: /search commands/i }),
      "zzzzz",
    );
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("navigates with ArrowDown + Enter and closes", async () => {
    const user = userEvent.setup();
    renderPalette();

    const input = screen.getByRole("textbox", { name: /search commands/i });
    input.focus();
    // Index 0 is "Overview"; one step down lands on "Configurations".
    await user.keyboard("{ArrowDown}{Enter}");

    expect(useShellStore.getState().activeScreen).toBe("configs");
    expect(useShellStore.getState().paletteOpen).toBe(false);
  });

  it("closes on Escape without navigating", async () => {
    const user = userEvent.setup();
    renderPalette();

    const input = screen.getByRole("textbox", { name: /search commands/i });
    input.focus();
    await user.keyboard("{Escape}");

    expect(useShellStore.getState().paletteOpen).toBe(false);
    expect(useShellStore.getState().activeScreen).toBe("overview");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
