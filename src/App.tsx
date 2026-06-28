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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import { Window } from "@/app/Window";
import { CommandPalette } from "@/app/CommandPalette";
import { useGlobalShortcuts } from "@/app/useGlobalShortcuts";
import { useActiveIdentity } from "@/lib/queries";
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

/** The application shell: window chrome + screen outlet + command palette. */
function Shell() {
  useGlobalShortcuts();
  // Hydrate the store's active-identity cache so the Sidebar card + StatusBar
  // reflect the live session (demo seed outside Tauri).
  useActiveIdentity();
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
