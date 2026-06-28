/**
 * AgentsScreen tests — the sub-agents manager wired through the generic
 * Collection and the (mocked) query layer: it lists this machine's
 * `~/.claude/agents/*.md` agents with their model badges, and the per-row Edit
 * action loads the resource and saves the edited markdown via `save_resource`.
 *
 * `@tauri-apps/api/core` is mocked true so the query layer hits the real backend
 * path, `@/lib/ipc` is mocked so every command is an observable spy, and the
 * CodeMirror-backed `MarkdownEditor` is stubbed (it doesn't render in jsdom) with
 * a minimal modal that honours the same `value`/`onSave`/`onCancel` contract.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

vi.mock("@/lib/ipc", () => ({
  listResources: vi.fn(),
  getResource: vi.fn(),
  saveResource: vi.fn(),
  deleteResource: vi.fn(),
  setSkillEnabled: vi.fn(),
}));

// CodeMirror doesn't render under jsdom; stand in a minimal editor exposing the
// title + a Save/Cancel that drive the same onSave(value)/onCancel contract.
vi.mock("@/ui/MarkdownEditor", () => ({
  MarkdownEditor: ({
    title,
    value,
    onSave,
    onCancel,
  }: {
    title: React.ReactNode;
    value: string;
    onSave: (value: string) => void;
    onCancel: () => void;
  }) => (
    <div role="dialog" aria-label="Markdown editor">
      <div>{title}</div>
      <button type="button" onClick={() => onSave(value)}>
        Save
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  ),
}));

import * as ipc from "@/lib/ipc";
import { AgentsScreen } from "./index";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import type { Resource, ResourceDetail } from "@/lib/types";

const AGENTS: Resource[] = [
  {
    kind: "agent",
    name: "code-reviewer",
    description: "Reviews diffs for correctness and style.",
    bodyLines: 42,
    model: "sonnet",
    source: null,
    enabled: null,
    path: "/home/me/.claude/agents/code-reviewer.md",
    argsHint: null,
    tools: "Read, Edit, Bash",
  },
  {
    kind: "agent",
    name: "planner",
    description: "Breaks a goal into a task plan.",
    bodyLines: 64,
    model: "opus",
    source: null,
    enabled: null,
    path: "/home/me/.claude/agents/planner.md",
    argsHint: null,
    tools: "Read",
  },
  {
    kind: "agent",
    name: "doc-writer",
    description: "Drafts and updates documentation.",
    bodyLines: 27,
    model: "haiku",
    source: null,
    enabled: null,
    path: "/home/me/.claude/agents/doc-writer.md",
    argsHint: null,
    tools: "Read, Edit",
  },
];

const CODE_REVIEWER_DETAIL: ResourceDetail = {
  ...AGENTS[0],
  raw: "---\nname: code-reviewer\nmodel: sonnet\n---\n\nYou review diffs.\n",
};

beforeEach(() => {
  vi.clearAllMocks();
  (ipc.listResources as Mock).mockResolvedValue(AGENTS);
  (ipc.getResource as Mock).mockResolvedValue(CODE_REVIEWER_DETAIL);
  (ipc.saveResource as Mock).mockResolvedValue(undefined);
  (ipc.deleteResource as Mock).mockResolvedValue(undefined);
});

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <AgentsScreen />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("AgentsScreen", () => {
  it("lists the agents from the query layer with their model badges", async () => {
    renderScreen();

    expect(await screen.findByText("code-reviewer")).toBeInTheDocument();
    expect(screen.getByText("planner")).toBeInTheDocument();
    expect(screen.getByText("doc-writer")).toBeInTheDocument();

    // The card tag is the categorical model badge (sonnet / opus / haiku).
    expect(screen.getByText("sonnet")).toBeInTheDocument();
    expect(screen.getByText("opus")).toBeInTheDocument();
    expect(screen.getByText("haiku")).toBeInTheDocument();
  });

  it("Edit opens the editor and Save calls save_resource with the loaded markdown", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("code-reviewer");
    // The Edit action lives in the table row / detail pane, not the card.
    await user.click(screen.getByRole("radio", { name: "Table view" }));
    await user.click(screen.getByRole("button", { name: "Edit code-reviewer" }));

    // The editor loaded the resource's raw `.md` via get_resource.
    await waitFor(() =>
      expect(ipc.getResource).toHaveBeenCalledWith("agent", "code-reviewer"),
    );
    expect(
      await screen.findByText("Edit agent · code-reviewer"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(ipc.saveResource).toHaveBeenCalledWith(
        "agent",
        "code-reviewer",
        CODE_REVIEWER_DETAIL.raw,
      ),
    );
  });
});
