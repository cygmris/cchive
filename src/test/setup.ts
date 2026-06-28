/**
 * Vitest global setup — Testing Library matchers, auto-cleanup, and the two
 * browser APIs jsdom omits that our components rely on.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// SegmentedControl observes its container to keep the active pill aligned;
// jsdom has no ResizeObserver, so provide an inert stub.
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

// The command palette scrolls the selected row into view as the cursor moves;
// jsdom doesn't implement Element.scrollIntoView, so provide an inert stub.
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView !== "function"
) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}

// The theme cross-fade probes prefers-reduced-motion; jsdom has no matchMedia.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}
