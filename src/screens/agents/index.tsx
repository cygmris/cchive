/**
 * AgentsScreen — the sub-agents manager (design §7). Renders this machine's
 * `~/.claude/agents/*.md` sub-agents through the generic, domain-agnostic
 * {@link Collection}: this screen only supplies a {@link CollectionConfig} — a
 * Bot glyph, a model Badge tag (sonnet=clay / opus=violet / haiku=green), the
 * line-count meta (no toggle — agents have no enabled flag), the detail
 * properties (Model / Tools / Path) and a read-only `<name>.md` body preview.
 * "Add agent" and the per-row / per-detail Edit / Delete actions drive the shared
 * {@link useResourceEditor} (MarkdownEditor + the resource mutations).
 */
import { useState, type ReactNode } from "react";

import { Badge, ModelBadge, type ModelName } from "@/ui/Badge";
import { IconButton } from "@/ui/IconButton";
import { Bot, Pencil, Trash } from "@/ui/icons";
import { useResources } from "@/lib/queries";
import type { Resource } from "@/lib/types";
import { Collection } from "@/screens/_collection/Collection";
import type { CollectionConfig, CollectionView } from "@/screens/_collection/types";
import { useResourceEditor } from "@/screens/_collection/useResourceEditor";

const MODEL_KEYWORDS = new Set<ModelName>(["sonnet", "opus", "haiku"]);

/** Model tag: a categorical {@link ModelBadge} for the three families, else a plain pill. */
function modelTag(model: string | null): ReactNode {
  if (!model) return null;
  if (MODEL_KEYWORDS.has(model as ModelName)) return <ModelBadge model={model as ModelName} />;
  return <Badge variant="neutral">{model}</Badge>;
}

/** A `<name>.md`-shaped preview/stub, reconstructed from the parsed meta. */
function agentMarkdown(agent: Resource): string {
  const lines = ["---", `name: ${agent.name}`];
  if (agent.description) lines.push(`description: ${agent.description}`);
  if (agent.model) lines.push(`model: ${agent.model}`);
  if (agent.tools) lines.push(`tools: ${agent.tools}`);
  lines.push("---", "", `You are a focused ${agent.name}.`, "");
  return lines.join("\n");
}

export function AgentsScreen() {
  const agents = useResources("agent");
  const items = agents.data ?? [];

  const [view, setView] = useState<CollectionView>("card");
  const [query, setQuery] = useState("");

  const ed = useResourceEditor({
    kind: "agent",
    noun: "agent",
    items,
    starter: (name) =>
      `---\nname: ${name}\ndescription: \nmodel: sonnet\ntools: Read, Edit\n---\n\nYou are a focused ${name}.\n`,
    demoBody: agentMarkdown,
  });

  /** Edit + Delete affordances, shared by the table row and the detail pane. */
  function actions(agent: Resource) {
    return (
      <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
        <IconButton
          size="sm"
          icon={<Pencil size={15} />}
          aria-label={`Edit ${agent.name}`}
          onClick={() => ed.openEdit(agent)}
        />
        <IconButton
          size="sm"
          danger
          icon={<Trash size={15} />}
          aria-label={`Delete ${agent.name}`}
          onClick={() => ed.confirmDelete(agent)}
        />
      </div>
    );
  }

  const config: CollectionConfig<Resource> = {
    icon: () => <Bot size={16} />,
    name: (a) => a.name,
    description: (a) => a.description ?? "",
    tag: (a) => modelTag(a.model),
    meta: (a) => `${a.bodyLines} lines`,
    columns: [
      {
        label: "Name",
        render: (a) => (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: "var(--weight-semibold)",
              color: "var(--text)",
            }}
          >
            {a.name}
          </span>
        ),
      },
      {
        label: "Description",
        render: (a) => (
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--text-2)" }}>
            {a.description ?? ""}
          </span>
        ),
      },
      { label: "Model", render: (a) => modelTag(a.model) },
      {
        label: "Lines",
        render: (a) => (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
            {a.bodyLines}
          </span>
        ),
      },
      { label: "", render: (a) => actions(a) },
    ],
    detail: (a) => ({
      props: [
        { label: "Model", value: a.model ?? "—" },
        { label: "Tools", value: a.tools ?? "—" },
        { label: "Path", value: a.path },
        { label: "Manage", value: actions(a) },
      ],
      preview: { name: `${a.name}.md`, body: agentMarkdown(a) },
    }),
    addLabel: "Add agent",
  };

  return (
    <>
      <Collection
        title="Agents"
        description="Sub-agents Claude Code can delegate specialized work to."
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
