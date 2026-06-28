/**
 * Shared frontend types for the Clavis design system.
 */

/** Color theme. Light is the default. */
export type Theme = "light" | "dark";

/** The five swappable accent presets (Tweak). Clay is the default. */
export type AccentName = "clay" | "blue" | "green" | "violet" | "ember";

/** Layout density (Tweak). Comfortable is the default. */
export type Density = "comfortable" | "compact";

/** Persisted theme preferences. */
export interface ThemePrefs {
  theme: Theme;
  accent: AccentName;
  density: Density;
}

/** The set of valid accent names, for runtime validation. */
export const ACCENT_NAMES: readonly AccentName[] = [
  "clay",
  "blue",
  "green",
  "violet",
  "ember",
];

/** Defaults applied when no prefs are stored or stored prefs are corrupt. */
export const DEFAULT_THEME_PREFS: ThemePrefs = {
  theme: "light",
  accent: "clay",
  density: "comfortable",
};
