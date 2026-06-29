/**
 * SettingsScreen tests — the preference controls fan out to their owning layers:
 * the Language select calls i18n `setLanguage`, the accent swatches + density
 * toggle call the S1 theme setters (`setAccent` / `setDensity` on a spied
 * `useTheme`), "Report an issue" calls the Tauri opener, and the version row
 * renders the resolved app version.
 *
 * `@/i18n` keeps its real init (so the labels resolve from the English baseline)
 * with `setLanguage` swapped for a spy; `@/theme/ThemeProvider` is mocked so
 * `useTheme` is a spy; `@tauri-apps/plugin-opener` and `@tauri-apps/api/app` are
 * mocked so the opener and version are observable without a Tauri runtime.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/i18n")>();
  return { ...actual, setLanguage: vi.fn() };
});

vi.mock("@/theme/ThemeProvider", () => ({
  useTheme: vi.fn(),
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("1.2.3"),
}));

import { setLanguage } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ToastProvider } from "@/ui/Toast";
import { SettingsScreen } from "./index";

const ISSUE_URL = "https://github.com/cygmris/cchive/issues/new";

let setTheme: Mock;
let setAccent: Mock;
let setDensity: Mock;

beforeEach(() => {
  vi.clearAllMocks();
  setTheme = vi.fn();
  setAccent = vi.fn();
  setDensity = vi.fn();
  (useTheme as Mock).mockReturnValue({
    theme: "light",
    accent: "clay",
    density: "comfortable",
    setTheme,
    setAccent,
    setDensity,
  });
});

/**
 * The screen reads the autostart query (added in S14), so it needs a
 * QueryClientProvider — off-Tauri that query resolves to the demo `false`.
 */
function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <SettingsScreen />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("SettingsScreen", () => {
  it("the language select calls setLanguage with the chosen tag", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.selectOptions(screen.getByLabelText("Language"), "fr");

    expect(setLanguage).toHaveBeenCalledWith("fr");
  });

  it("clicking an accent swatch calls setAccent with that accent", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole("radio", { name: "Blue" }));

    expect(setAccent).toHaveBeenCalledWith("blue");
  });

  it("the density toggle calls setDensity", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole("radio", { name: "Compact" }));

    expect(setDensity).toHaveBeenCalledWith("compact");
  });

  it('"Report an issue" opens the issue URL via the opener', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole("button", { name: /Report an issue/ }));

    expect(openUrl).toHaveBeenCalledWith(ISSUE_URL);
  });

  it("renders the resolved app version", async () => {
    renderScreen();

    expect(await screen.findByText("cchive v1.2.3")).toBeInTheDocument();
  });
});
