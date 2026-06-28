/**
 * Theme-engine tests.
 *
 * Covers the three foundation guarantees:
 *  1. `applyTheme` mirrors {theme, accent, density} onto `<html>`.
 *  2. ThemeProvider persists changes and restores them on mount, using the
 *     non-Tauri prefs store (localStorage) as the test backend.
 *  3. Corrupt persisted prefs fall back to the documented defaults.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import { ACCENTS, applyTheme } from "./theme";
import { getPrefs, setPref } from "@/lib/prefs";
import { DEFAULT_THEME_PREFS } from "@/lib/types";

const LS_KEY = "clavis.theme";

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root().removeAttribute("data-theme");
  root().removeAttribute("data-density");
  root().style.removeProperty("--accent");
});

afterEach(() => {
  cleanup();
});

describe("applyTheme", () => {
  it("mirrors theme, density, and accent onto <html>", () => {
    applyTheme("dark", "ember", "compact");
    expect(root().getAttribute("data-theme")).toBe("dark");
    expect(root().getAttribute("data-density")).toBe("compact");
    expect(root().style.getPropertyValue("--accent")).toBe(ACCENTS.ember);

    applyTheme("light", "blue", "comfortable");
    expect(root().getAttribute("data-theme")).toBe("light");
    expect(root().getAttribute("data-density")).toBe("comfortable");
    expect(root().style.getPropertyValue("--accent")).toBe(ACCENTS.blue);
  });
});

describe("prefs persistence", () => {
  it("round-trips a written preference", async () => {
    await setPref("theme", "dark");
    await setPref("accent", "violet");
    await setPref("density", "compact");

    const prefs = await getPrefs();
    expect(prefs).toEqual({ theme: "dark", accent: "violet", density: "compact" });
  });

  it("falls back to defaults when stored prefs are corrupt", async () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ theme: "chartreuse", accent: "gold", density: "spacious" }),
    );
    const prefs = await getPrefs();
    expect(prefs).toEqual(DEFAULT_THEME_PREFS);
  });
});

describe("ThemeProvider", () => {
  it("restores persisted prefs on mount and applies them to the root", async () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ theme: "dark", accent: "green", density: "compact" }),
    );

    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    await waitFor(() => expect(result.current.theme).toBe("dark"));
    expect(result.current.accent).toBe("green");
    expect(result.current.density).toBe("compact");
    expect(root().getAttribute("data-theme")).toBe("dark");
    expect(root().getAttribute("data-density")).toBe("compact");
    expect(root().style.getPropertyValue("--accent")).toBe(ACCENTS.green);
  });

  it("setTheme / setAccent / setDensity update the root and persist", async () => {
    // Prime a non-default state and wait for hydration so the async restore
    // can't clobber the setters we call below.
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ theme: "dark", accent: "green", density: "compact" }),
    );
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    await waitFor(() => expect(result.current.theme).toBe("dark"));

    // The root must update for every setter (instant, synchronous DOM mirror).
    act(() => result.current.setTheme("light"));
    expect(root().getAttribute("data-theme")).toBe("light");
    // `prefs.setPref` is a read-modify-write of the whole record, so let each
    // write settle before the next to avoid clobbering — a user only flips one
    // tweak at a time anyway.
    await waitFor(async () => expect((await getPrefs()).theme).toBe("light"));

    act(() => result.current.setAccent("violet"));
    expect(root().style.getPropertyValue("--accent")).toBe(ACCENTS.violet);
    await waitFor(async () => expect((await getPrefs()).accent).toBe("violet"));

    act(() => result.current.setDensity("comfortable"));
    expect(root().getAttribute("data-density")).toBe("comfortable");
    await waitFor(async () => expect((await getPrefs()).density).toBe("comfortable"));

    // All three persisted together.
    expect(await getPrefs()).toEqual({
      theme: "light",
      accent: "violet",
      density: "comfortable",
    });
  });
});
