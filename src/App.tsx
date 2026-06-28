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
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import { Window } from "@/app/Window";
import { CommandPalette } from "@/app/CommandPalette";
import { useGlobalShortcuts } from "@/app/useGlobalShortcuts";
import { Gallery } from "@/screens/_gallery/Gallery";

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
  return (
    <>
      <Window />
      <CommandPalette />
    </>
  );
}

export default function App() {
  const hash = useHash();
  const showGallery = hash === "#/gallery";

  return (
    <ThemeProvider>
      <ToastProvider>{showGallery ? <Gallery /> : <Shell />}</ToastProvider>
    </ThemeProvider>
  );
}
