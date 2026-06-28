/**
 * Projects — per-project `.claude/settings.local.json` editor (master-detail).
 *
 * The left list is every project discovered from `~/.claude.json` ({@link
 * useProjects}); selecting one loads its `.claude/settings.local.json` into the
 * shared inline {@link CodeEditor} (json mode) seeded from {@link
 * useProjectSettings}. Save validates the JSON first — invalid text shows an
 * inline error and blocks the write — then persists atomically via {@link
 * useSaveProjectSettings}. An "Edit CLAUDE.md" link jumps to the Memory screen
 * scoped to that project (via the `editingMemoryProject` store hand-off). When
 * there are no projects, an empty state is shown.
 *
 * Token-only styling; full-height mono editor; the content is the user's own
 * local settings — never a credential.
 */
import { useEffect, useState } from "react";
import { Button } from "@/ui/Button";
import { CodeEditor } from "@/ui/CodeEditor";
import { ScreenHeader } from "@/app/ScreenHeader";
import { Book, Folder } from "@/ui/icons";
import { useToast } from "@/ui/Toast";
import {
  useProjects,
  useProjectSettings,
  useSaveProjectSettings,
} from "@/lib/queries";
import { useShellStore } from "@/lib/store";
import type { Project } from "@/lib/types";

/** Centered muted note (loading / empty bodies). */
function CenteredNote({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-1)",
        textAlign: "center",
        color: "var(--text-3)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ fontSize: "var(--fs-body)", color: "var(--text-2)" }}>
        {title}
      </div>
      {detail != null && (
        <div style={{ fontSize: "var(--fs-body-sm)" }}>{detail}</div>
      )}
    </div>
  );
}

/** A small square folder glyph chip for a project row. */
function FolderChip() {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: 28,
        height: 28,
        borderRadius: 7,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        color: "var(--text-3)",
      }}
    >
      <Folder size={15} />
    </span>
  );
}

/** One selectable project row in the left list. */
function ProjectRow({
  project,
  selected,
  onSelect,
}: {
  project: Project;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      style={{
        display: "flex",
        width: "100%",
        alignItems: "center",
        gap: 10,
        padding: "9px 11px",
        border: "none",
        borderRadius: 9,
        textAlign: "left",
        cursor: "pointer",
        background: selected ? "var(--accent-tint)" : "transparent",
        transition: "background-color .15s ease",
      }}
    >
      <FolderChip />
      <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12.5,
            fontWeight: "var(--weight-semibold)",
            color: "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {project.name}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-3)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {project.path}
        </span>
      </span>
    </button>
  );
}

/** The right pane: the JSON editor for one project's `.claude/settings.local.json`. */
function ProjectDetail({ project }: { project: Project }) {
  const { toast } = useToast();
  const go = useShellStore((s) => s.go);
  const setEditingMemoryProject = useShellStore(
    (s) => s.setEditingMemoryProject,
  );
  const settings = useProjectSettings(project.path);
  const saveSettings = useSaveProjectSettings();

  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed once when the settings arrive; the component is keyed by path, so a new
  // selection remounts and reseeds from its own settings.
  useEffect(() => {
    if (settings.data && draft === null) setDraft(settings.data.raw);
  }, [settings.data, draft]);

  function handleSave(text: string) {
    try {
      JSON.parse(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON.");
      return;
    }
    setError(null);
    saveSettings.mutate(
      { path: project.path, raw: text },
      {
        onSuccess: () =>
          toast({
            title: "Settings saved",
            description: `${project.name}/.claude/settings.local.json`,
            variant: "success",
          }),
        onError: (err) =>
          toast({
            title: "Couldn't save settings",
            description: err.message,
            variant: "danger",
          }),
      },
    );
  }

  function editMemory() {
    setEditingMemoryProject(project.path);
    go("memory");
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-2xl)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      {/* File header: path | Edit CLAUDE.md + Save -------------------------- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          padding: "9px 12px",
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            fontWeight: "var(--weight-medium)",
            color: "var(--text-2)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          .claude/settings.local.json
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            flexShrink: 0,
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            icon={<Book size={15} />}
            onClick={editMemory}
          >
            Edit CLAUDE.md
          </Button>
          <Button
            size="sm"
            loading={saveSettings.isPending}
            onClick={() => handleSave(draft ?? "")}
          >
            Save
          </Button>
        </div>
      </div>

      {/* Inline JSON validation error -------------------------------------- */}
      {error != null && (
        <div
          role="alert"
          style={{
            padding: "8px 12px",
            background: "color-mix(in srgb, var(--danger) 12%, transparent)",
            borderBottom: "1px solid var(--border)",
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            color: "var(--danger)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {error}
        </div>
      )}

      {/* JSON editor ------------------------------------------------------- */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <CodeEditor
          language="json"
          value={draft ?? ""}
          onChange={(v) => {
            setDraft(v);
            if (error != null) setError(null);
          }}
          onSave={handleSave}
          height="100%"
        />
      </div>
    </div>
  );
}

export function ProjectsScreen() {
  const projects = useProjects();
  const items = projects.data ?? [];
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Default the selection to the first project, and re-clamp if the list changes
  // so the right pane never points at a project that is gone.
  useEffect(() => {
    if (items.length === 0) {
      if (selectedPath != null) setSelectedPath(null);
      return;
    }
    if (selectedPath == null || !items.some((p) => p.path === selectedPath)) {
      setSelectedPath(items[0].path);
    }
  }, [items, selectedPath]);

  const selected = items.find((p) => p.path === selectedPath) ?? null;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <ScreenHeader
        title="Projects"
        description="Per-project configuration for every folder you've run Claude Code in."
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          gap: "var(--space-4)",
          padding: "0 var(--gutter) var(--space-6)",
          overflow: "hidden",
        }}
      >
        {projects.isLoading ? (
          <CenteredNote title="Loading projects…" />
        ) : items.length === 0 ? (
          <CenteredNote
            title="No projects yet"
            detail="Projects appear here once you've run Claude Code in a folder."
          />
        ) : (
          <>
            {/* Left: selectable project list -------------------------------- */}
            <div
              role="listbox"
              aria-label="Projects"
              style={{
                width: 300,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: 6,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-2xl)",
                boxShadow: "var(--shadow-card)",
                overflowY: "auto",
              }}
            >
              {items.map((project) => (
                <ProjectRow
                  key={project.path}
                  project={project}
                  selected={project.path === selectedPath}
                  onSelect={() => setSelectedPath(project.path)}
                />
              ))}
            </div>

            {/* Right: the selected project's settings editor ---------------- */}
            {selected && (
              <ProjectDetail key={selected.path} project={selected} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
