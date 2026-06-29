/**
 * Window shell tests — the lazy-screen routing contract.
 *
 * The Window resolves the active screen through the `React.lazy` registry and
 * renders it behind a single `Suspense` boundary. This locks the runtime
 * behaviour the code-split depends on: while a screen's chunk is still loading
 * the calm `ScreenFallback` (the lone spinning loader) holds the main region,
 * and once the chunk resolves the real screen content paints in its place.
 * Screen unit tests import their components directly and are unaffected by the
 * lazy split; only the shell has to be Suspense-aware — which is what this
 * asserts.
 *
 * `experimental` is the probe screen: it's self-contained (cchive-local prefs,
 * no IPC/query), so the test exercises the lazy boundary itself rather than a
 * screen's data layer. The shell mounts under the app's provider stack so the
 * Sidebar/StatusBar render exactly as they do in production.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Window } from "./Window";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import { useShellStore } from "@/lib/store";

beforeEach(() => {
  useShellStore.setState({ activeScreen: "experimental" });
});

function renderWindow() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <Window />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("Window lazy-screen routing", () => {
  it("holds the ScreenFallback while the lazy chunk loads, then renders the screen", async () => {
    renderWindow();
    const main = screen.getByRole("main");

    // While the experimental chunk is still resolving, the main region shows the
    // calm fallback (the single spinning loader) and none of the screen content.
    expect(main.querySelector(".animate-spin")).not.toBeNull();
    expect(within(main).queryByText("Agent Teams")).toBeNull();

    // Once the lazy import resolves, the real screen paints behind Suspense…
    expect(await within(main).findByText("Agent Teams")).toBeInTheDocument();
    // …and the fallback spinner is gone.
    expect(main.querySelector(".animate-spin")).toBeNull();
  });
});
