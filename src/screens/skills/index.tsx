/**
 * SkillsScreen — the agent-skills manager (design §9). Renders this machine's
 * `~/.claude/skills/<name>/SKILL.md` skills (plus any toggled-off ones parked in
 * the Clavis stash) through the generic, domain-agnostic {@link Collection}: this
 * screen only supplies a {@link CollectionConfig} — a Sparkles glyph, a source
 * Badge tag (Personal=clay / Project=blue / Plugin=violet), an enable/disable
 * Switch (a stash folder round-trip that never loses the skill), the detail
 * properties (Source / Path / Status) and a read-only `SKILL.md` body preview.
 * The toggle goes through {@link useSkillEnabled}, which re-derives the status-bar
 * Skills count. "Add skill" and the per-row / per-detail Edit / Delete actions
 * drive the shared {@link useResourceEditor}.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Badge, SourceBadge, type SourceName } from "@/ui/Badge";
import { IconButton } from "@/ui/IconButton";
import { Pencil, Sparkles, Trash } from "@/ui/icons";
import { useResources, useSkillEnabled } from "@/lib/queries";
import type { Resource } from "@/lib/types";
import { useToast } from "@/ui/Toast";
import { Collection } from "@/screens/_collection/Collection";
import type { CollectionConfig, CollectionView } from "@/screens/_collection/types";
import { useResourceEditor } from "@/screens/_collection/useResourceEditor";

const SOURCE_NAMES = new Set<SourceName>(["personal", "project", "plugin"]);

/** Source tag: a categorical {@link SourceBadge} for the three sources, else a plain pill. */
function sourceTag(source: string | null): ReactNode {
  if (!source) return null;
  const key = source.toLowerCase();
  if (SOURCE_NAMES.has(key as SourceName)) {
    return <SourceBadge source={key as SourceName}>{source}</SourceBadge>;
  }
  return <Badge variant="neutral">{source}</Badge>;
}

/** A `SKILL.md`-shaped preview/stub, reconstructed from the parsed meta. */
function skillMarkdown(skill: Resource): string {
  const lines = ["---", `name: ${skill.name}`];
  if (skill.description) lines.push(`description: ${skill.description}`);
  lines.push("---", "", `Use this skill to ${skill.description ?? "…"}`, "");
  return lines.join("\n");
}

export function SkillsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const skills = useResources("skill");
  const setEnabled = useSkillEnabled();
  const items = skills.data ?? [];

  const [view, setView] = useState<CollectionView>("card");
  const [query, setQuery] = useState("");

  const ed = useResourceEditor({
    kind: "skill",
    noun: "skill",
    items,
    starter: (name) => `---\nname: ${name}\ndescription: \n---\n\nUse this skill to …\n`,
    demoBody: skillMarkdown,
  });

  function toggle(skill: Resource, on: boolean) {
    setEnabled.mutate(
      { name: skill.name, on },
      {
        onError: (error) =>
          toast({ title: "Couldn't update skill", description: error.message, variant: "danger" }),
      },
    );
  }

  /** Edit + Delete affordances, shared by the table row and the detail pane. */
  function actions(skill: Resource) {
    return (
      <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
        <IconButton
          size="sm"
          icon={<Pencil size={15} />}
          aria-label={`Edit ${skill.name}`}
          onClick={() => ed.openEdit(skill)}
        />
        <IconButton
          size="sm"
          danger
          icon={<Trash size={15} />}
          aria-label={`Delete ${skill.name}`}
          onClick={() => ed.confirmDelete(skill)}
        />
      </div>
    );
  }

  const config: CollectionConfig<Resource> = {
    icon: () => <Sparkles size={16} />,
    name: (s) => s.name,
    description: (s) => s.description ?? "",
    tag: (s) => sourceTag(s.source),
    toggle: (s) => ({
      on: s.enabled ?? false,
      onChange: (next) => toggle(s, next),
    }),
    columns: [
      {
        label: "Name",
        render: (s) => (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: "var(--weight-semibold)",
              color: "var(--text)",
            }}
          >
            {s.name}
          </span>
        ),
      },
      {
        label: "Description",
        render: (s) => (
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--text-2)" }}>
            {s.description ?? ""}
          </span>
        ),
      },
      { label: "Source", render: (s) => sourceTag(s.source) },
      { label: "", render: (s) => actions(s) },
    ],
    detail: (s) => ({
      props: [
        { label: "Source", value: s.source ?? "—" },
        { label: "Path", value: s.path },
        { label: "Status", value: (s.enabled ?? false) ? "Enabled" : "Disabled" },
        { label: "Manage", value: actions(s) },
      ],
      preview: { name: "SKILL.md", body: skillMarkdown(s) },
    }),
    addLabel: "Add skill",
  };

  return (
    <>
      <Collection
        title={t("header.skills.title")}
        description={t("header.skills.description")}
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
