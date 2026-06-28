/**
 * IPC client tests — assert each wrapper invokes the right command name with the
 * right payload, and that the Tauri guard throws in a plain browser.
 *
 * `@tauri-apps/api/core` is mocked: `invoke` is a spy and `isTauri` is toggled so
 * both the happy path (runtime present) and the guard (runtime absent) are covered.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, isTauriMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
}));

import * as ipc from "./ipc";
import type { ProviderMeta } from "./types";

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  isTauriMock.mockReturnValue(true);
});

describe("ipc wrappers call invoke with the right command name", () => {
  it("listAccounts -> list_accounts", async () => {
    await ipc.listAccounts();
    expect(invokeMock).toHaveBeenCalledWith("list_accounts");
  });

  it("getActiveIdentity -> get_active_identity", async () => {
    await ipc.getActiveIdentity();
    expect(invokeMock).toHaveBeenCalledWith("get_active_identity");
  });

  it("addAccountFromActive -> add_account_from_active", async () => {
    await ipc.addAccountFromActive();
    expect(invokeMock).toHaveBeenCalledWith("add_account_from_active");
  });

  it("switchAccount -> switch_account with { id }", async () => {
    await ipc.switchAccount("acc-1");
    expect(invokeMock).toHaveBeenCalledWith("switch_account", { id: "acc-1" });
  });

  it("removeAccount -> remove_account with { id }", async () => {
    await ipc.removeAccount("acc-2");
    expect(invokeMock).toHaveBeenCalledWith("remove_account", { id: "acc-2" });
  });

  it("listProviders -> list_providers", async () => {
    await ipc.listProviders();
    expect(invokeMock).toHaveBeenCalledWith("list_providers");
  });

  it("applyProvider -> apply_provider with { meta, env }", async () => {
    const meta: ProviderMeta = {
      id: "prov-zai",
      label: "Z.ai",
      baseUrl: "https://provider.test/anthropic",
      model: "glm-4.6",
    };
    const env = { ANTHROPIC_BASE_URL: "https://provider.test/anthropic" };
    await ipc.applyProvider(meta, env);
    expect(invokeMock).toHaveBeenCalledWith("apply_provider", { meta, env });
  });

  it("clearProvider -> clear_provider", async () => {
    await ipc.clearProvider();
    expect(invokeMock).toHaveBeenCalledWith("clear_provider");
  });

  it("readSettingsSummary -> read_settings_summary", async () => {
    await ipc.readSettingsSummary();
    expect(invokeMock).toHaveBeenCalledWith("read_settings_summary");
  });

  it("detectEnvOverrides -> detect_env_overrides", async () => {
    await ipc.detectEnvOverrides();
    expect(invokeMock).toHaveBeenCalledWith("detect_env_overrides");
  });
});

describe("Tauri guard", () => {
  it("throws and never invokes when not running under Tauri", () => {
    isTauriMock.mockReturnValue(false);
    expect(() => ipc.listAccounts()).toThrow(/requires the Tauri runtime/);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
