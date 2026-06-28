/**
 * Config Editor screen tests — the schema drives the whole form, so these assert
 * behavior against the (mocked) query layer rather than any markup detail:
 *
 *  - every section's fields render from `schema.ts`;
 *  - the section nav and the search box filter the visible fields;
 *  - typing updates the controlled form state;
 *  - Save validates (blocking on a bad URL / number / UUID) and otherwise calls
 *    `saveProvider` with the composed payload — sending a token ONLY when one was
 *    typed;
 *  - Delete asks for confirmation, then calls `deleteProvider` and navigates back;
 *  - the secret control never renders a stored token and only reflects set/not-set.
 *
 * `@tauri-apps/api/core` is mocked so the query layer takes the real backend path,
 * and `@/lib/ipc` is mocked so every command is an observable spy. No token value
 * is ever seeded into the view fixture — the editor must surface only `hasToken`.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

vi.mock("@/lib/ipc", () => ({
  listAccounts: vi.fn(),
  getActiveIdentity: vi.fn(),
  addAccountFromActive: vi.fn(),
  switchAccount: vi.fn(),
  removeAccount: vi.fn(),
  listProviders: vi.fn(),
  getProvider: vi.fn(),
  saveProvider: vi.fn(),
  deleteProvider: vi.fn(),
  applyProvider: vi.fn(),
  clearProvider: vi.fn(),
  readSettingsSummary: vi.fn(),
  detectEnvOverrides: vi.fn(),
}));

import * as ipc from "@/lib/ipc";
import { ConfigEditorScreen } from "./index";
import { SECTIONS } from "./schema";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import { useShellStore } from "@/lib/store";
import type { ProviderConfigView } from "@/lib/types";

/** A saved provider with a vaulted token — the view NEVER carries the value. */
const VIEW: ProviderConfigView = {
  id: "prov-1",
  title: "Z.ai",
  brand: "zai",
  env: {
    baseUrl: "https://api.z.ai/api/anthropic",
    model: "glm-4.6",
    defaultSonnet: "",
    defaultHaiku: "",
    maxThinkingTokens: null,
    maxOutputTokens: null,
    httpsProxy: null,
    disableTelemetry: null,
  },
  config: {
    cleanupPeriodDays: null,
    includeCoAuthoredBy: null,
    outputStyle: null,
    forceLoginMethod: null,
    forceLoginOrgUuid: null,
    enableAllProjectMcpServers: null,
    enabledMcpServers: null,
  },
  hasToken: true,
};

/** The exact env/config payload the editor should compose from VIEW (no token). */
const VIEW_INPUT = {
  id: VIEW.id,
  title: VIEW.title,
  brand: VIEW.brand,
  env: VIEW.env,
  config: VIEW.config,
};

beforeEach(() => {
  vi.clearAllMocks();
  useShellStore.setState({
    activeScreen: "editor",
    editingProviderId: "prov-1",
    paletteOpen: false,
    switcherOpen: false,
    addAccountOpen: false,
  });
  (ipc.getProvider as Mock).mockResolvedValue(VIEW);
  (ipc.saveProvider as Mock).mockResolvedValue(VIEW);
  (ipc.deleteProvider as Mock).mockResolvedValue(undefined);
});

function renderEditor() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <ConfigEditorScreen />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

/** All field labels declared in the schema, across every section. */
const ALL_LABELS = SECTIONS.flatMap((s) => s.fields.map((f) => f.label));

describe("ConfigEditorScreen — schema rendering", () => {
  it("renders every section's fields from the schema", async () => {
    renderEditor();

    // Wait for the loaded body (the first field) before asserting the rest.
    await screen.findByText(ALL_LABELS[0]);
    for (const label of ALL_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Sanity: that is genuinely all five sections' worth of fields.
    expect(ALL_LABELS.length).toBe(
      SECTIONS.reduce((n, s) => n + s.fields.length, 0),
    );
  });

  it("scopes the field area to the chosen section via the left nav", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByText("ANTHROPIC_BASE_URL");

    await user.click(screen.getByRole("button", { name: "General" }));

    expect(screen.getByText("Cleanup Period (days)")).toBeInTheDocument();
    expect(screen.queryByText("ANTHROPIC_BASE_URL")).not.toBeInTheDocument();
  });

  it("filters fields by the search query (label/description substring)", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByText("ANTHROPIC_BASE_URL");

    await user.type(screen.getByLabelText("Search settings"), "Cleanup");

    expect(screen.getByText("Cleanup Period (days)")).toBeInTheDocument();
    expect(screen.queryByText("ANTHROPIC_BASE_URL")).not.toBeInTheDocument();
  });

  it("shows a no-match note when nothing matches the search", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByText("ANTHROPIC_BASE_URL");

    await user.type(
      screen.getByLabelText("Search settings"),
      "zzz-no-such-setting",
    );

    expect(screen.getByText(/No settings match/i)).toBeInTheDocument();
  });
});

describe("ConfigEditorScreen — editing state", () => {
  it("reflects typed edits in the controlled control", async () => {
    const user = userEvent.setup();
    renderEditor();
    const model = (await screen.findByLabelText(
      "ANTHROPIC_MODEL",
    )) as HTMLInputElement;

    expect(model.value).toBe("glm-4.6");
    await user.clear(model);
    await user.type(model, "custom-model-1");

    expect(model.value).toBe("custom-model-1");
  });
});

describe("ConfigEditorScreen — Save", () => {
  it("composes the payload and sends NO token when none was typed", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByText("ANTHROPIC_BASE_URL");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(ipc.saveProvider).toHaveBeenCalledTimes(1));
    const [input, token] = (ipc.saveProvider as Mock).mock.calls[0];
    expect(input).toEqual(VIEW_INPUT);
    expect(token).toBeUndefined();
  });

  it("sends the token ONLY when one was entered", async () => {
    const user = userEvent.setup();
    renderEditor();
    const secret = await screen.findByLabelText("ANTHROPIC_AUTH_TOKEN");

    await user.type(secret, "sk-new-key-123");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(ipc.saveProvider).toHaveBeenCalledTimes(1));
    const [input, token] = (ipc.saveProvider as Mock).mock.calls[0];
    expect(input).toEqual(VIEW_INPUT);
    expect(token).toBe("sk-new-key-123");
  });

  it("blocks Save and shows an inline error on a malformed URL", async () => {
    const user = userEvent.setup();
    renderEditor();
    const url = await screen.findByLabelText("ANTHROPIC_BASE_URL");

    await user.clear(url);
    await user.type(url, "not a url");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(/Enter a valid http\(s\) URL\./i),
    ).toBeInTheDocument();
    expect(ipc.saveProvider).not.toHaveBeenCalled();
  });

  it("blocks Save on a non-numeric number field", async () => {
    const user = userEvent.setup();
    renderEditor();
    const thinking = await screen.findByLabelText("MAX_THINKING_TOKENS");

    await user.type(thinking, "lots");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(/Enter a whole number\./i),
    ).toBeInTheDocument();
    expect(ipc.saveProvider).not.toHaveBeenCalled();
  });

  it("blocks Save on a malformed Force Login Org UUID", async () => {
    const user = userEvent.setup();
    renderEditor();
    const uuid = await screen.findByLabelText("Force Login Org UUID");

    await user.type(uuid, "not-a-uuid");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(/Enter a valid UUID/i),
    ).toBeInTheDocument();
    expect(ipc.saveProvider).not.toHaveBeenCalled();
  });
});

describe("ConfigEditorScreen — Delete", () => {
  it("confirms first, then deletes and navigates back to Configurations", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByText("ANTHROPIC_BASE_URL");

    // Opening the confirm popover must not delete on its own.
    await user.click(
      screen.getByRole("button", { name: "Delete configuration" }),
    );
    const confirm = await screen.findByRole("button", { name: "Delete" });
    expect(ipc.deleteProvider).not.toHaveBeenCalled();

    await user.click(confirm);

    await waitFor(() =>
      expect(ipc.deleteProvider).toHaveBeenCalledWith("prov-1"),
    );
    await waitFor(() =>
      expect(useShellStore.getState().activeScreen).toBe("configs"),
    );
  });
});

describe("ConfigEditorScreen — secret control", () => {
  it("never renders a stored token and shows the set status", async () => {
    renderEditor();
    const secret = (await screen.findByLabelText(
      "ANTHROPIC_AUTH_TOKEN",
    )) as HTMLInputElement;

    expect(secret.value).toBe("");
    expect(
      screen.getByText(/Set — leave blank to keep the current key\./i),
    ).toBeInTheDocument();
  });

  it("reflects a freshly typed key in the status line", async () => {
    const user = userEvent.setup();
    renderEditor();
    const secret = await screen.findByLabelText("ANTHROPIC_AUTH_TOKEN");

    await user.type(secret, "sk-typed");

    expect(
      screen.getByText(/A new key will be saved\./i),
    ).toBeInTheDocument();
  });

  it("shows 'not set' for a brand-new draft with no vaulted token", async () => {
    useShellStore.setState({ editingProviderId: null });
    renderEditor();
    const secret = (await screen.findByLabelText(
      "ANTHROPIC_AUTH_TOKEN",
    )) as HTMLInputElement;

    expect(secret.value).toBe("");
    expect(screen.getByText(/Not set\./i)).toBeInTheDocument();
    // A new draft never loads a provider over IPC.
    expect(ipc.getProvider).not.toHaveBeenCalled();
  });
});
