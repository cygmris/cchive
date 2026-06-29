/**
 * Global keyboard shortcuts for the shell.
 *
 *  - **⌘K / Ctrl+K** toggles the command palette (and `preventDefault`s the
 *    browser's default, e.g. focus-search).
 *  - **Escape** closes whichever overlay is open (command palette and/or the
 *    account switcher popover).
 *
 * A single `keydown` listener is attached to `window` once on mount and removed
 * on unmount (no handler leaks). Actions are pulled from the store via
 * `getState()` so the effect never re-binds when state changes.
 */
import { useEffect } from "react";
import { useShellStore } from "@/lib/store";

export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        useShellStore.getState().togglePalette();
        return;
      }
      if (e.key === "Escape") {
        const state = useShellStore.getState();
        if (state.paletteOpen) state.closePalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
