/**
 * Shell store tests — navigation and active-config selectors.
 *
 * `go()` moves the active screen; `switchTo()` re-points the active config and
 * closes the switcher, which the derived `selectActiveConfig` / `selectStatus`
 * selectors must reflect (account → store model, provider → its own model).
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  selectActiveConfig,
  selectStatus,
  useShellStore,
} from "./store";

beforeEach(() => {
  useShellStore.setState({
    activeScreen: "overview",
    paletteOpen: false,
    switcherOpen: false,
    activeConfigId: "claude-personal",
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

describe("switchTo", () => {
  it("re-points the active config and closes the switcher", () => {
    useShellStore.setState({ switcherOpen: true });
    useShellStore.getState().switchTo("prov-zai");
    expect(useShellStore.getState().activeConfigId).toBe("prov-zai");
    expect(useShellStore.getState().switcherOpen).toBe(false);
  });

  it("updates the derived active config to the chosen provider", () => {
    useShellStore.getState().switchTo("prov-zai");
    const active = selectActiveConfig(useShellStore.getState());
    expect(active.kind).toBe("provider");
    expect(active.config.id).toBe("prov-zai");
  });

  it("updates the derived status values (provider reports its own model)", () => {
    useShellStore.getState().switchTo("prov-zai");
    const status = selectStatus(useShellStore.getState());
    expect(status.name).toBe("GLM-4.6 · Z.ai");
    expect(status.model).toBe("glm-4.6");
  });

  it("status uses the account name + store model when an account is active", () => {
    useShellStore.getState().switchTo("claude-northwind");
    const status = selectStatus(useShellStore.getState());
    expect(status.name).toBe("Alex Rivera");
    expect(status.model).toBe(useShellStore.getState().model);
  });
});

describe("selectActiveConfig", () => {
  it("falls back to the first account for an unknown active id", () => {
    useShellStore.setState({ activeConfigId: "nope" });
    const active = selectActiveConfig(useShellStore.getState());
    expect(active.kind).toBe("account");
    expect(active.config.id).toBe("claude-personal");
  });
});
