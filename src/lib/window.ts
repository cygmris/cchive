/**
 * Window-control helpers for the frameless Clavis window.
 *
 * The shipped app runs inside Tauri with the native OS chrome hidden
 * (`decorations:false`), so the custom traffic-light controls + drag region
 * drive the window through `@tauri-apps/api/window`. In a plain browser
 * (`vite dev`, the component gallery, unit tests) there is no Tauri runtime, so
 * each helper degrades to a logged no-op — the shell still renders and stays
 * clickable. Every Tauri call is guarded by {@link isTauri}.
 */
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Detaches a previously-attached listener. */
export type Unlisten = () => void;

type TauriWindow = ReturnType<typeof getCurrentWindow>;

/** Run `fn` against the current Tauri window, or log a no-op in the browser. */
function withWindow(
  action: string,
  fn: (win: TauriWindow) => Promise<void>,
): void {
  if (!isTauri()) {
    console.debug(`[window] ${action} ignored — not running under Tauri`);
    return;
  }
  void fn(getCurrentWindow()).catch((err) => {
    console.debug(`[window] ${action} failed`, err);
  });
}

/** Minimize the window to the dock/taskbar. */
export function minimizeWindow(): void {
  withWindow("minimize", (win) => win.minimize());
}

/** Toggle between maximized and restored. */
export function toggleMaximizeWindow(): void {
  withWindow("toggleMaximize", (win) => win.toggleMaximize());
}

/** Close the window (quits the app when it is the last window). */
export function closeWindow(): void {
  withWindow("close", (win) => win.close());
}

/** Begin an OS-level window drag — call from a drag-region pointer-down. */
export function startDrag(): void {
  withWindow("startDragging", (win) => win.startDragging());
}

/**
 * Subscribe to maximize/restore changes. `handler` receives the current
 * maximized state whenever the window resizes, plus once with the initial
 * state. Returns an unsubscribe function. In a browser this is a no-op that
 * returns a no-op unsubscribe.
 */
export function onMaximizeChange(
  handler: (maximized: boolean) => void,
): Unlisten {
  if (!isTauri()) {
    console.debug("[window] onMaximizeChange ignored — not running under Tauri");
    return () => {};
  }
  const win = getCurrentWindow();
  let unlisten: Unlisten | undefined;
  let disposed = false;

  void win
    .onResized(() => {
      void win.isMaximized().then(handler).catch(() => {});
    })
    .then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    })
    .catch((err) => {
      console.debug("[window] onMaximizeChange failed", err);
    });

  // Emit the initial state.
  void win.isMaximized().then(handler).catch(() => {});

  return () => {
    disposed = true;
    unlisten?.();
  };
}
