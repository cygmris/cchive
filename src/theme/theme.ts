/**
 * Theme engine internals — accent presets and the DOM application layer.
 *
 * The provider keeps {theme, accent, density} in React state; this module is
 * the thin, framework-agnostic bridge that mirrors that state onto
 * `<html>` (attributes + the `--accent` custom property) and runs the brief
 * color cross-fade when the theme flips. All styling still flows from
 * tokens.css — we only flip the attributes/vars that file keys off.
 */
import type { AccentName, Density, Theme } from "@/lib/types";

/**
 * The five swappable accent presets the product exposes as a Tweak.
 * Values are the brand hexes; every emphasis color in tokens.css derives from
 * `--accent` via color-mix, so swapping this one var retints the whole system.
 */
export const ACCENTS: Record<AccentName, string> = {
  clay: "#d97757",
  blue: "#4b6bfb",
  green: "#2f8f63",
  violet: "#7c6cf0",
  ember: "#c2410c",
};

/** Duration of the theme color cross-fade. */
export const THEME_TRANSITION_MS = 300;

const TRANSITION_ATTR = "data-theme-transition";
const TRANSITION_STYLE_ID = "cchive-theme-transition";

/**
 * Mirror the current theme/accent/density onto `<html>`.
 *
 * - `data-theme` drives the light/dark token blocks.
 * - `data-density` drives the comfortable/compact token block.
 * - `--accent` is set inline from {@link ACCENTS}; derived tokens follow it.
 *
 * Idempotent and instant — calling it repeatedly with the same values is a
 * no-op for the user, so the provider can apply on every state change safely.
 */
export function applyTheme(theme: Theme, accent: AccentName, density: Density): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-density", density);
  root.style.setProperty("--accent", ACCENTS[accent]);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Inject the one-time stylesheet that enables the cross-fade while active. */
function ensureTransitionStyle(): void {
  if (document.getElementById(TRANSITION_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = TRANSITION_STYLE_ID;
  const t = `${THEME_TRANSITION_MS}ms ease`;
  // Scoped to the brief window the attribute is present, so it never slows
  // down component-level hover/press transitions.
  style.textContent =
    `[${TRANSITION_ATTR}], [${TRANSITION_ATTR}] * {` +
    ` transition: background-color ${t}, color ${t}, border-color ${t},` +
    ` fill ${t}, stroke ${t}, box-shadow ${t} !important; }`;
  document.head.appendChild(style);
}

let transitionTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Run `swap` (a theme change) wrapped in a ~0.3s color cross-fade. Honors
 * `prefers-reduced-motion` by applying instantly. The reflow between enabling
 * the transition and the swap guarantees the change animates from the painted
 * state rather than jumping.
 */
export function withThemeTransition(swap: () => void): void {
  if (typeof document === "undefined" || prefersReducedMotion()) {
    swap();
    return;
  }
  const root = document.documentElement;
  ensureTransitionStyle();
  root.setAttribute(TRANSITION_ATTR, "");
  void root.offsetWidth; // force reflow → establishes the transition baseline
  swap();
  if (transitionTimer) clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => {
    root.removeAttribute(TRANSITION_ATTR);
    transitionTimer = undefined;
  }, THEME_TRANSITION_MS + 30);
}
