/**
 * CommandsScreen — the slash-commands manager (design §8). Renders this
 * machine's `~/.claude/commands/*.md` custom commands through the generic,
 * domain-agnostic {@link Collection}: this screen only supplies a
 * {@link CollectionConfig} — a Terminal glyph, the `/`-prefixed name, the
 * line-count meta (NO tag, NO toggle — commands have neither), the detail
 * properties (Argument-hint / Path) and a read-only `<name>.md` body preview.
 * "Add command" and the per-row / per-detail Edit / Delete actions drive the
 * shared {@link useResourceEditor} (MarkdownEditor + the resource mutations).
 */
import { useState } from "react";

import { IconButton } from "@/ui/IconButton";
import { Pencil, Terminal, Trash } from "@/ui/icons";
import { useResources } from "@/lib/queries";
import type { Resource } from "@/lib/types";
import { Collection } from "@/screens/_collection/Collection";
import type { CollectionConfig, CollectionView } from "@/screens/_collection/types";
import { useResourceEditor } from "@/screens/_collection/useResourceEditor";

/** A `<name>.md`-shaped preview/stub, reconstructed from the parsed meta. */
function commandMarkdown(command: Resource): string {
  const lines = ["---"];
  if (command.description) lines.push(`description: ${command.description}`);
  if (command.argsHint) lines.push(`argument-hint: ${command.argsHint}`);
  lines.push("---", "", "Target: $ARGUMENTS", "");
  return lines.join("\n");
}

export function CommandsScreen() {
  const commands = useResources("command");
  const items = commands.data ?? [];

  const [view, setView] = useState<CollectionView>("card");
  const [query, setQuery] = useState("");

  const ed = useResourceEditor({
    kind: "command",
    noun: "command",
    items,
    starter: (name) =>
      `---\ndescription: \nargument-hint: [file]\n---\n\n# /${name}\n\nTarget: $ARGUMENTS\n`,
    demoBody: commandMarkdown,
  });

  /** Edit + Delete affordances, shared by the table row and the detail pane. */
  function actions(command: Resource) {
    return (
      <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
        <IconButton
          size="sm"
          icon={<Pencil size={15} />}
          aria-label={`Edit ${command.name}`}
          onClick={() => ed.openEdit(command)}
        />
        <IconButton
          size="sm"
          danger
          icon={<Trash size={15} />}
          aria-label={`Delete ${command.name}`}
          onClick={() => ed.confirmDelete(command)}
        />
      </div>
    );
  }

  const config: CollectionConfig<Resource> = {
    icon: () => <Terminal size={16} />,
    name: (c) => c.name,
    description: (c) => c.description ?? "",
    meta: (c) => `${c.bodyLines} lines`,
    columns: [
      {
        label: "Name",
        render: (c) => (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: "var(--weight-semibold)",
              color: "var(--text)",
            }}
          >
            {c.name}
          </span>
        ),
      },
      {
        label: "Description",
        render: (c) => (
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--text-2)" }}>
            {c.description ?? ""}
          </span>
        ),
      },
      {
        label: "Lines",
        render: (c) => (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
            {c.bodyLines}
          </span>
        ),
      },
      { label: "", render: (c) => actions(c) },
    ],
    detail: (c) => ({
      props: [
        { label: "Argument hint", value: c.argsHint ?? "—" },
        { label: "Path", value: c.path },
        { label: "Manage", value: actions(c) },
      ],
      preview: { name: `${c.name.replace(/^\//, "")}.md`, body: commandMarkdown(c) },
    }),
    addLabel: "Add command",
  };

  return (
    <>
      <Collection
        title="Commands"
        description="Custom slash commands available in every Claude Code session."
        items={items}
        config={config}
        view={view}
        onViewChange={setView}
        query={query}
        onQueryChange={setQuery}
        onAdd={ed.openAdd}
      />
      {ed.editor}
    </>
  );
}
