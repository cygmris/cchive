/**
 * Projects screen tests — the per-project `.claude/settings.local.json` editor
 * (master-detail) wired through the (mocked) query layer. These assert behavior:
 *
 *  - the left list renders every project from `useProjects`;
 *  - selecting one loads its settings via `read_project_settings` and seeds the
 *    editor with the raw JSON;
 *  - Save validates first — malformed JSON shows an inline error and never calls
 *    `write_project_settings`;
 *  - a valid Save persists the raw text via `write_project_settings`.
 *
 * `@tauri-apps/api/core` is mocked true so the query layer takes the real backend
 * path, `@/lib/ipc` is mocked so every command is an observable spy, and the
 * CodeMirror-backed `CodeEditor` is stubbed with a minimal textarea honouring the
 * same `value`/`onChange`/`onSave` contract.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

vi.mock("@/lib/ipc", () => ({
  listProjects: vi.fn(),
  readProjectSettings: vi.fn(),
  writeProjectSettings: vi.fn(),
}));

vi.mock("@/ui/CodeEditor", () => ({
  CodeEditor: ({
    value,
    onChange,
    onSave,
    language,
  }: {
    value: string;
    onChange: (value: string) => void;
    onSave?: (value: string) => void;
    language: string;
  }) => (
    <div data-testid="code-editor" data-language={language}>
      <textarea
        aria-label="editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" onClick={() => onSave?.(value)}>
        editor-save
      </button>
    </div>
  ),
}));

import * as ipc from "@/lib/ipc";
import { ProjectsScreen } from "./index";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import { useShellStore } from "@/lib/store";
import type { Project } from "@/lib/types";

const PROJECTS: Project[] = [
  {
    path: "/home/me/code/alpha",
    name: "alpha",
    hasLocalSettings: true,
    lastActivity: null,
  },
  {
    path: "/home/me/code/beta",
    name: "beta",
    hasLocalSettings: false,
    lastActivity: null,
  },
];

const SETTINGS_RAW = `{
  "permissions": {
    "allow": ["Read(./src/**)"],
    "deny": []
  }
}`;

beforeEach(() => {
  vi.clearAllMocks();
  useShellStore.setState({ activeScreen: "projects", editingMemoryProject: null });
  (ipc.listProjects as Mock).mockResolvedValue(PROJECTS);
  (ipc.readProjectSettings as Mock).mockImplementation((path: string) =>
    Promise.resolve({ path, raw: SETTINGS_RAW }),
  );
  (ipc.writeProjectSettings as Mock).mockResolvedValue(undefined);
});

function renderProjects() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <ProjectsScreen />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("ProjectsScreen", () => {
  it("lists every discovered project", async () => {
    renderProjects();

    expect(await screen.findByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.getByText("/home/me/code/alpha")).toBeInTheDocument();
    expect(screen.getByText("/home/me/code/beta")).toBeInTheDocument();
  });

  it("selecting a project loads its settings into the editor", async () => {
    const user = userEvent.setup();
    renderProjects();

    // The first project auto-selects, so seed-load fires for alpha on mount.
    await waitFor(() =>
      expect(ipc.readProjectSettings).toHaveBeenCalledWith(
        "/home/me/code/alpha",
      ),
    );

    await user.click(screen.getByText("beta"));

    await waitFor(() =>
      expect(ipc.readProjectSettings).toHaveBeenCalledWith("/home/me/code/beta"),
    );
    const editor = (await screen.findByLabelText("editor")) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe(SETTINGS_RAW));
  });

  it("blocks Save and shows an inline error on malformed JSON", async () => {
    const user = userEvent.setup();
    renderProjects();
    const editor = (await screen.findByLabelText("editor")) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe(SETTINGS_RAW));

    fireEvent.change(editor, { target: { value: "{ not valid json" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(ipc.writeProjectSettings).not.toHaveBeenCalled();
  });

  it("a valid Save writes the raw settings text", async () => {
    const user = userEvent.setup();
    renderProjects();
    const editor = (await screen.findByLabelText("editor")) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe(SETTINGS_RAW));

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(ipc.writeProjectSettings).toHaveBeenCalledTimes(1));
    expect(ipc.writeProjectSettings).toHaveBeenCalledWith(
      "/home/me/code/alpha",
      SETTINGS_RAW,
    );
  });
});
