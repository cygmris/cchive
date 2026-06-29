/**
 * Shell store tests — navigation, overlay open-states, and the active-identity
 * cache the queries layer hydrates.
 *
 * `go()` moves the active screen; the palette / switcher / add-account toggles
 * flip their booleans; `setActiveIdentity()` merges a partial snapshot that the
 * derived `selectStatus` selector reflects (so Sidebar/StatusBar paint from it).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { selectStatus, useShellStore, type ActiveIdentityCache } from "./store";

const DEFAULT_IDENTITY: ActiveIdentityCache = {
  kind: "none",
  label: "No active config",
  email: null,
  tier: null,
  model: "—",
  mcpEnabledCount: 0,
  skillsEnabledCount: 0,
  tokensToday: "0",
};

beforeEach(() => {
  useShellStore.setState({
    activeScreen: "overview",
    paletteOpen: false,
    addAccountOpen: false,
    activeIdentity: { ...DEFAULT_IDENTITY },
  });
});

describe("go", () => {
  it("sets the active screen", () => {
    expect(useShellStore.getState().activeScreen).toBe("overview");
    useShellStore.getState().go("mcp");
    expect(useShellStore.getState().activeScreen).toBe("mcp");
    useShellStore.getState().go("settings");
    expect(useShellStore.getState().activeScreen).toBe("settings");
  });
});

describe("overlay open-states", () => {
  const s = () => useShellStore.getState();

  it("opens, closes and toggles the command palette", () => {
    s().openPalette();
    expect(s().paletteOpen).toBe(true);
    s().closePalette();
    expect(s().paletteOpen).toBe(false);
    s().togglePalette();
    expect(s().paletteOpen).toBe(true);
    s().togglePalette();
    expect(s().paletteOpen).toBe(false);
  });

  it("opens and closes the add-account modal", () => {
    expect(s().addAccountOpen).toBe(false);
    s().openAddAccount();
    expect(s().addAccountOpen).toBe(true);
    s().closeAddAccount();
    expect(s().addAccountOpen).toBe(false);
  });
});

describe("setActiveIdentity + selectStatus", () => {
  it("derives the status values from the default cache", () => {
    const status = selectStatus(useShellStore.getState());
    expect(status.name).toBe("No active config");
    expect(status.model).toBe("—");
    expect(status.mcpEnabledCount).toBe(0);
    expect(status.tokensToday).toBe("0");
  });

  it("hydrates the cache and reflects it in the status values", () => {
    useShellStore.getState().setActiveIdentity({
      kind: "account",
      label: "Alex Rivera",
      tier: "Max 20×",
      model: "claude-sonnet-4-5",
    });
    const status = selectStatus(useShellStore.getState());
    expect(status.name).toBe("Alex Rivera");
    expect(status.model).toBe("claude-sonnet-4-5");
  });

  it("merges partials without clobbering untouched fields", () => {
    useShellStore.getState().setActiveIdentity({ label: "Demo" });
    const identity = useShellStore.getState().activeIdentity;
    expect(identity.label).toBe("Demo");
    expect(identity.kind).toBe("none");
    expect(identity.model).toBe("—");
  });
});
