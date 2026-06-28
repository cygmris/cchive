/**
 * useResourceEditor — the shared add / edit / delete wiring behind the three
 * markdown-resource screens (agents, commands, skills). It owns the
 * {@link MarkdownEditor} modal state and the mutation plumbing that is identical
 * across the three families, so each screen contributes only its
 * `CollectionConfig` + a starter template + an off-Tauri demo body.
 *
 * - **Add**: prompts for a name, validates it (mirrors the Rust `safe_stem`
 *   rules + a duplicate check), then opens the editor seeded with `starter`.
 * - **Edit**: loads the verbatim `.md` via {@link getResource} (falling back to
 *   `demoBody` in a plain browser) and opens the editor on it.
 * - **Save**: {@link useSaveResource} (atomic write), toast on success/failure.
 * - **Delete**: confirms, then {@link useDeleteResource} (skill → whole folder).
 *
 * Touches ONLY the agents/commands/skills resources via the typed hooks — never
 * a credential.
 */
import { useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";

import { getResource } from "@/lib/ipc";
import { useDeleteResource, useSaveResource } from "@/lib/queries";
import type { Resource, ResourceKind } from "@/lib/types";
import { MarkdownEditor } from "@/ui/MarkdownEditor";
import { useToast } from "@/ui/Toast";

/** Per-family knobs the shared editor needs. */
export interface ResourceEditorOptions {
  kind: ResourceKind;
  /** Human noun for prompts/toasts, e.g. `"agent"`. */
  noun: string;
  /** Already-loaded items, for the add-time duplicate check. */
  items: Resource[];
  /** Starter markdown for a brand-new resource of this kind. */
  starter: (name: string) => string;
  /** Off-Tauri stand-in body so editing renders in a plain browser. */
  demoBody: (item: Resource) => string;
}

/** What a screen drives its row/detail/header actions with. */
export interface ResourceEditorApi {
  /** Prompt for a name, validate, then open the editor on a starter template. */
  openAdd: () => void;
  /** Load the resource's `.md` and open the editor on it. */
  openEdit: (item: Resource) => void;
  /** Confirm, then delete the resource. */
  confirmDelete: (item: Resource) => void;
  /** The editor modal (mounted when open, else `null`). */
  editor: ReactNode;
}

/** The on-disk stem for a display name (commands carry a leading `/`). */
function toStem(name: string): string {
  return name.trim().replace(/^\/+/, "").trim();
}

/** Mirror the Rust `safe_stem` rejections + a duplicate check. */
function validateName(
  raw: string,
  items: Resource[],
): { stem: string } | { error: string } {
  const stem = toStem(raw);
  if (!stem) return { error: "Name can't be empty." };
  if (/[/\\]/.test(stem) || stem.includes("..")) {
    return { error: "Name can't contain “/”, “\\” or “..”." };
  }
  const clash = items.some((it) => toStem(it.name).toLowerCase() === stem.toLowerCase());
  if (clash) return { error: `“${stem}” already exists.` };
  return { stem };
}

interface Draft {
  /** On-disk stem (no leading slash). */
  stem: string;
  title: ReactNode;
  value: string;
}

export function useResourceEditor({
  kind,
  noun,
  items,
  starter,
  demoBody,
}: ResourceEditorOptions): ResourceEditorApi {
  const { toast } = useToast();
  const save = useSaveResource();
  const remove = useDeleteResource();
  const [draft, setDraft] = useState<Draft | null>(null);

  function openAdd() {
    const input = window.prompt(`Name for the new ${noun}:`);
    if (input == null) return; // cancelled
    const result = validateName(input, items);
    if ("error" in result) {
      toast({ title: `Invalid ${noun} name`, description: result.error, variant: "danger" });
      return;
    }
    setDraft({
      stem: result.stem,
      title: `New ${noun} · ${result.stem}`,
      value: starter(result.stem),
    });
  }

  function openEdit(item: Resource) {
    const stem = toStem(item.name);
    const open = (value: string) =>
      setDraft({ stem, title: `Edit ${noun} · ${item.name}`, value });

    if (!isTauri()) {
      open(demoBody(item));
      return;
    }
    getResource(kind, item.name)
      .then((detail) => open(detail.raw))
      .catch((error: unknown) =>
        toast({
          title: `Couldn't open ${noun}`,
          description: error instanceof Error ? error.message : String(error),
          variant: "danger",
        }),
      );
  }

  function onSave(value: string) {
    if (!draft) return;
    const stem = draft.stem;
    save.mutate(
      { kind, name: stem, raw: value },
      {
        onSuccess: () => {
          setDraft(null);
          toast({ title: `${noun[0].toUpperCase()}${noun.slice(1)} saved`, description: stem, variant: "success" });
        },
        onError: (error) =>
          toast({ title: `Couldn't save ${noun}`, description: error.message, variant: "danger" }),
      },
    );
  }

  function confirmDelete(item: Resource) {
    const stem = toStem(item.name);
    if (!window.confirm(`Delete “${item.name}”? This removes it from disk.`)) return;
    remove.mutate(
      { kind, name: stem },
      {
        onSuccess: () =>
          toast({ title: `${noun[0].toUpperCase()}${noun.slice(1)} deleted`, description: stem, variant: "success" }),
        onError: (error) =>
          toast({ title: `Couldn't delete ${noun}`, description: error.message, variant: "danger" }),
      },
    );
  }

  const editor = draft ? (
    <MarkdownEditor
      key={draft.stem}
      title={draft.title}
      value={draft.value}
      onSave={onSave}
      onCancel={() => setDraft(null)}
    />
  ) : null;

  return { openAdd, openEdit, confirmDelete, editor };
}
