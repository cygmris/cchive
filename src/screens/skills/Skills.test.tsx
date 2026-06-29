/**
 * SkillsScreen tests — the agent-skills manager wired through the generic
 * Collection and the (mocked) query layer: it lists this machine's
 * `~/.claude/skills/<name>/SKILL.md` skills with their source badges + an
 * enable/disable Switch, the toggle moves a skill via `set_skill_enabled`, and
 * Delete confirms before calling `delete_resource`.
 *
 * `@tauri-apps/api/core` is mocked true so the query layer hits the real backend
 * path, `@/lib/ipc` is mocked so every command is an observable spy, and the
 * CodeMirror-backed `MarkdownEditor` is stubbed (it doesn't render in jsdom).
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

// CodeMirror doesn't render under jsdom; stand in a minimal editor.
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
import { SkillsScreen } from "./index";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui/Toast";
import type { Resource } from "@/lib/types";

const SKILLS: Resource[] = [
  {
    kind: "skill",
    name: "pdf-forms",
    description: "Fill and parse PDF forms.",
    bodyLines: 30,
    model: null,
    source: "Personal",
    enabled: true,
    path: "/home/me/.claude/skills/pdf-forms/SKILL.md",
    argsHint: null,
    tools: null,
  },
  {
    kind: "skill",
    name: "design-review",
    description: "Review UI against the design tokens.",
    bodyLines: 24,
    model: null,
    source: "Project",
    enabled: true,
    path: "/home/me/.claude/skills/design-review/SKILL.md",
    argsHint: null,
    tools: null,
  },
  {
    kind: "skill",
    name: "slack-digest",
    description: "Summarize Slack channels on demand.",
    bodyLines: 18,
    model: null,
    source: "Plugin",
    enabled: false,
    path: "/home/me/.cchive/disabled-skills/slack-digest/SKILL.md",
    argsHint: null,
    tools: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  (ipc.listResources as Mock).mockResolvedValue(SKILLS);
  (ipc.saveResource as Mock).mockResolvedValue(undefined);
  (ipc.deleteResource as Mock).mockResolvedValue(undefined);
  (ipc.setSkillEnabled as Mock).mockResolvedValue(undefined);
});

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <SkillsScreen />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("SkillsScreen", () => {
  it("lists the skills from the query layer with their source badges + toggles", async () => {
    renderScreen();

    expect(await screen.findByText("pdf-forms")).toBeInTheDocument();
    expect(screen.getByText("design-review")).toBeInTheDocument();
    expect(screen.getByText("slack-digest")).toBeInTheDocument();

    // The card tag is the categorical source badge (Personal / Project / Plugin).
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Plugin")).toBeInTheDocument();

    // Each card carries an enable/disable Switch.
    expect(
      screen.getByRole("switch", { name: "Toggle pdf-forms" }),
    ).toBeInTheDocument();
  });

  it("flipping a skill toggle calls set_skill_enabled", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("pdf-forms");
    // pdf-forms is enabled → toggling it off should disable it.
    await user.click(screen.getByRole("switch", { name: "Toggle pdf-forms" }));

    await waitFor(() =>
      expect(ipc.setSkillEnabled).toHaveBeenCalledWith("pdf-forms", false),
    );
  });

  it("Delete confirms before calling delete_resource", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("pdf-forms");
    // The Delete action lives in the table row / detail pane, not the card.
    await user.click(screen.getByRole("radio", { name: "Table view" }));
    await user.click(screen.getByRole("button", { name: "Delete pdf-forms" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(ipc.deleteResource).toHaveBeenCalledWith("skill", "pdf-forms"),
    );
    confirmSpy.mockRestore();
  });

  it("does not delete when the confirm is cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("pdf-forms");
    await user.click(screen.getByRole("radio", { name: "Table view" }));
    await user.click(screen.getByRole("button", { name: "Delete pdf-forms" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(ipc.deleteResource).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
