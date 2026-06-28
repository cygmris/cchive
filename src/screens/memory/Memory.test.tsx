/**
 * Memory screen tests — the `CLAUDE.md` editor wired through the (mocked) query
 * layer. These assert behavior, not markup detail:
 *
 *  - the header shows the resolved `CLAUDE.md` path and the editor is seeded with
 *    the content, both from a mocked `useMemory`;
 *  - Save writes the live draft for the active scope via `write_memory`;
 *  - the scope selector lists Global plus every project from `useProjects`.
 *
 * `@tauri-apps/api/core` is mocked true so the query layer takes the real backend
 * path, `@/lib/ipc` is mocked so every command is an observable spy, and the
 * CodeMirror-backed `CodeEditor` is stubbed (it doesn't render in jsdom) with a
 * minimal textarea honouring the same `value`/`onChange`/`onSave` contract.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

vi.mock("@/lib/ipc", () => ({
  readMemory: vi.fn(),
  writeMemory: vi.fn(),
  listProjects: vi.fn(),
}));

// CodeMirror doesn't render under jsdom; stand in a minimal editor exposing the
// document text + the same onChange/onSave contract the screen drives.
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
import { MemoryScreen } from "./index";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import { useShellStore } from "@/lib/store";
import type { MemoryDoc, Project } from "@/lib/types";

const GLOBAL_MEMORY: MemoryDoc = {
  path: "/home/me/.claude/CLAUDE.md",
  content: "# My memory\n\n- Prefer the smallest change.\n",
};

const PROJECTS: Project[] = [
  {
    path: "/home/me/code/alpha",
    name: "alpha",
    hasLocalSettings: true,
    lastActivity: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  useShellStore.setState({ activeScreen: "memory", editingMemoryProject: null });
  (ipc.readMemory as Mock).mockResolvedValue(GLOBAL_MEMORY);
  (ipc.writeMemory as Mock).mockResolvedValue(undefined);
  (ipc.listProjects as Mock).mockResolvedValue(PROJECTS);
});

function renderMemory() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <MemoryScreen />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("MemoryScreen", () => {
  it("renders the resolved path and seeds the editor from useMemory", async () => {
    renderMemory();

    expect(await screen.findByText(GLOBAL_MEMORY.path)).toBeInTheDocument();
    const editor = (await screen.findByLabelText("editor")) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe(GLOBAL_MEMORY.content));
  });

  it("lists Global plus every project in the scope selector", async () => {
    renderMemory();
    await screen.findByText(GLOBAL_MEMORY.path);

    const selector = screen.getByLabelText("Memory scope");
    expect(selector).toHaveTextContent("Global");
    expect(selector).toHaveTextContent("alpha");
  });

  it("Save writes the live draft for the active (global) scope", async () => {
    const user = userEvent.setup();
    renderMemory();
    const editor = (await screen.findByLabelText("editor")) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe(GLOBAL_MEMORY.content));

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(ipc.writeMemory).toHaveBeenCalledTimes(1));
    expect(ipc.writeMemory).toHaveBeenCalledWith(
      { kind: "global" },
      GLOBAL_MEMORY.content,
    );
  });

  it("Save persists edited text", async () => {
    const user = userEvent.setup();
    renderMemory();
    const editor = (await screen.findByLabelText("editor")) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe(GLOBAL_MEMORY.content));

    const next = "# Edited memory\n";
    fireEvent.change(editor, { target: { value: next } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(ipc.writeMemory).toHaveBeenCalledTimes(1));
    expect(ipc.writeMemory).toHaveBeenCalledWith({ kind: "global" }, next);
  });
});
