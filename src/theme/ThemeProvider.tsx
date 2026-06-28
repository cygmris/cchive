/**
 * ThemeProvider — applies and persists {theme, accent, density}.
 *
 * On mount it applies the defaults instantly (no flash), then hydrates from the
 * persisted prefs. Every change is mirrored onto `<html>` via attribute/CSS-var
 * swaps (no component remounts) and written back through `lib/prefs`. Switching
 * the theme runs a ~0.3s color cross-fade that respects reduced motion.
 *
 * Consume via {@link useTheme}: `{ theme, accent, density, setTheme, setAccent,
 * setDensity }`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getPrefs, setPref } from "@/lib/prefs";
import {
  DEFAULT_THEME_PREFS,
  type AccentName,
  type Density,
  type Theme,
} from "@/lib/types";
import { applyTheme, withThemeTransition } from "./theme";

interface ThemeContextValue {
  theme: Theme;
  accent: AccentName;
  density: Density;
  setTheme: (theme: Theme) => void;
  setAccent: (accent: AccentName) => void;
  setDensity: (density: Density) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME_PREFS.theme);
  const [accent, setAccentState] = useState<AccentName>(DEFAULT_THEME_PREFS.accent);
  const [density, setDensityState] = useState<Density>(DEFAULT_THEME_PREFS.density);

  // Latest accent/density for the theme setter, which applies imperatively
  // (inside the cross-fade) without re-creating its callback.
  const accentRef = useRef(accent);
  accentRef.current = accent;
  const densityRef = useRef(density);
  densityRef.current = density;

  // Mirror state → DOM on every change (and on first paint with the defaults).
  // Instant; the theme cross-fade is handled separately in setTheme.
  useLayoutEffect(() => {
    applyTheme(theme, accent, density);
  }, [theme, accent, density]);

  // Hydrate from persisted prefs once. Corrupt/missing prefs already resolve to
  // defaults inside getPrefs, so this never throws and never flashes a fade.
  useEffect(() => {
    let cancelled = false;
    void getPrefs().then((prefs) => {
      if (cancelled) return;
      setThemeState(prefs.theme);
      setAccentState(prefs.accent);
      setDensityState(prefs.density);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    withThemeTransition(() => applyTheme(next, accentRef.current, densityRef.current));
    setThemeState(next);
    void setPref("theme", next);
  }, []);

  const setAccent = useCallback((next: AccentName) => {
    setAccentState(next);
    void setPref("accent", next);
  }, []);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    void setPref("density", next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, accent, density, setTheme, setAccent, setDensity }),
    [theme, accent, density, setTheme, setAccent, setDensity],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the current theme state and setters. Must be used under ThemeProvider. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a <ThemeProvider>");
  }
  return ctx;
}
