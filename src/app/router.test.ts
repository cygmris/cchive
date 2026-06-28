/**
 * Router + registry tests — the navigation contract.
 *
 * Locks three guarantees: every `Screen` (incl. `editor`) resolves to a
 * component in the registry, `isScreen` only accepts known keys, and an unknown
 * key falls back to Overview. `NAV` drives the sidebar and must exclude `editor`.
 */
import { describe, expect, it } from "vitest";
import { NAV, defaultScreen, isScreen } from "./router";
import { registry, getScreen } from "@/screens/registry";
import { SCREENS } from "@/lib/shell-types";

describe("registry", () => {
  it("resolves a component for every Screen", () => {
    for (const screen of SCREENS) {
      expect(registry[screen]).toBeTypeOf("function");
    }
  });

  it("includes the editor screen (reached from actions, not the nav)", () => {
    expect(registry.editor).toBeTypeOf("function");
  });

  it("getScreen returns the registered component for a known key", () => {
    for (const screen of SCREENS) {
      expect(getScreen(screen)).toBe(registry[screen]);
    }
  });

  it("falls back to Overview for an unknown key", () => {
    expect(getScreen("does-not-exist")).toBe(registry.overview);
    expect(getScreen("")).toBe(registry.overview);
  });
});

describe("isScreen", () => {
  it("accepts every known screen key", () => {
    for (const screen of SCREENS) {
      expect(isScreen(screen)).toBe(true);
    }
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isScreen("gallery")).toBe(false);
    expect(isScreen("Overview")).toBe(false); // case-sensitive
    expect(isScreen(123)).toBe(false);
    expect(isScreen(null)).toBe(false);
    expect(isScreen(undefined)).toBe(false);
    expect(isScreen({})).toBe(false);
  });
});

describe("NAV", () => {
  it("lists the 12 sidebar destinations and excludes editor", () => {
    expect(NAV).toHaveLength(12);
    expect(NAV.some((item) => item.screen === "editor")).toBe(false);
  });

  it("only references real screens, grouped into main/customize/system", () => {
    for (const item of NAV) {
      expect(isScreen(item.screen)).toBe(true);
      expect(["main", "customize", "system"]).toContain(item.group);
    }
  });

  it("defaults to the overview screen", () => {
    expect(defaultScreen).toBe("overview");
    expect(isScreen(defaultScreen)).toBe(true);
  });
});
