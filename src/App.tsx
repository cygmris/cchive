/**
 * Application root + dev hash router.
 *
 * Renders the Clavis shell — the frameless {@link Window} (sidebar + active
 * screen + status bar) plus the global {@link CommandPalette} — inside the
 * theme and toast providers. Global keyboard shortcuts (⌘K / Esc) are bound for
 * the shell via {@link useGlobalShortcuts}.
 *
 * `#/gallery` opens the developer-only component gallery for visual fidelity
 * checks. It is intentionally NOT part of the user navigation — there is no link
 * to it; you reach it only by typing the hash.
 */
import { useEffect, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import { Window } from "@/app/Window";
import { CommandPalette } from "@/app/CommandPalette";
import { useGlobalShortcuts } from "@/app/useGlobalShortcuts";
import { useGlobalData } from "@/app/useGlobalData";
import { queryKeys, useActiveIdentity } from "@/lib/queries";
import { AddAccountModal } from "@/screens/configurations/AddAccountModal";
import { Gallery } from "@/screens/_gallery/Gallery";

/**
 * One client for the whole app. Retries are off (a failed switch should surface
 * immediately, not after backoff) and refetch-on-focus is disabled because the
 * keyring only changes through our own mutations.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5_000 },
    mutations: { retry: false },
  },
});

/** Track the current location hash so `#/gallery` toggles without a reload. */
function useHash(): string {
  const [hash, setHash] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash,
  );
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

/**
 * Keep the in-app UI in sync with a tray quick-switch: the tray menu reuses the
 * same `core::switch` path and emits `clavis-switched` after it lands, so we
 * invalidate the queries a switch can change (who's active, the account/provider
 * lists, the recent-activity feed). Tauri-only; the listener is torn down on
 * unmount (and if the component unmounts before `listen` resolves).
 */
function useTraySwitchSync(): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: UnlistenFn | undefined;
    void listen("clavis-switched", () => {
      void qc.invalidateQueries({ queryKey: queryKeys.activeIdentity });
      void qc.invalidateQueries({ queryKey: queryKeys.accounts });
      void qc.invalidateQueries({ queryKey: queryKeys.providers });
      void qc.invalidateQueries({ queryKey: queryKeys.activity });
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [qc]);
}

/** The application shell: window chrome + screen outlet + command palette. */
function Shell() {
  useGlobalShortcuts();
  // Hydrate the store's active-identity cache so the Sidebar card + StatusBar
  // reflect the live session (demo seed outside Tauri).
  useActiveIdentity();
  // Prime the app-wide counts (MCP / Skills / tokens-today) once at the root so
  // the StatusBar + Overview tiles populate from the shared cache regardless of
  // the entry screen. Dedups with the screens' own hooks (no refetch storm).
  useGlobalData();
  // Mirror a tray quick-switch back into the in-app query cache.
  useTraySwitchSync();
  return (
    <>
      <Window />
      <CommandPalette />
      {/* Mounted once so both the Configurations screen and the sidebar
          switcher can open it via the shared `addAccountOpen` store flag. */}
      <AddAccountModal />
    </>
  );
}

export default function App() {
  const hash = useHash();
  const showGallery = hash === "#/gallery";

  return (
    <ThemeProvider>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          {showGallery ? <Gallery /> : <Shell />}
        </QueryClientProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
