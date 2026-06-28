/**
 * Memory — the `CLAUDE.md` editor.
 *
 * Edits the global user memory (`~/.claude/CLAUDE.md`) or a selected project's
 * `CLAUDE.md`, chosen via the scope selector. The body is the shared inline
 * {@link CodeEditor} in markdown mode, seeded from {@link useMemory}(scope);
 * Save (button or ⌘S inside the editor) writes atomically via
 * {@link useSaveMemory}. Switching scope with unsaved edits warns first.
 *
 * Arriving from the Projects screen's "Edit CLAUDE.md" link, the one-shot
 * `editingMemoryProject` store value preselects that project's scope and is then
 * cleared so a later manual visit defaults back to Global.
 *
 * Token-only styling; full-height mono editor; the content is plain markdown —
 * never a credential.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/Button";
import { Select } from "@/ui/Select";
import { Modal } from "@/ui/Modal";
import { CodeEditor } from "@/ui/CodeEditor";
import { useToast } from "@/ui/Toast";
import { useMemory, useProjects, useSaveMemory } from "@/lib/queries";
import { useShellStore } from "@/lib/store";
import type { MemoryScope } from "@/lib/types";

/** Stable key fragment for a scope, so reseeds + comparisons target one doc. */
function scopeKey(scope: MemoryScope): string {
  return scope.kind === "global" ? "global" : `project:${scope.path}`;
}

export function MemoryScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const projects = useProjects();
  const saveMemory = useSaveMemory();

  // Seed the initial scope from the one-shot Projects → Memory request (if any),
  // then clear it so a later manual visit to Memory defaults to Global.
  const [scope, setScope] = useState<MemoryScope>(() => {
    const path = useShellStore.getState().editingMemoryProject;
    return path != null ? { kind: "project", path } : { kind: "global" };
  });
  useEffect(() => {
    if (useShellStore.getState().editingMemoryProject != null) {
      useShellStore.getState().setEditingMemoryProject(null);
    }
  }, []);

  const memory = useMemory(scope);

  // `draft` is the live editor text; `baseline` is the last loaded/saved text, so
  // `dirty` drives the unsaved-changes guard. `seededRef` tracks which scope the
  // draft was seeded from so editing within a scope never re-clobbers the buffer.
  const [draft, setDraft] = useState("");
  const [baseline, setBaseline] = useState("");
  const seededRef = useRef<string | null>(null);
  const [pendingScope, setPendingScope] = useState<MemoryScope | null>(null);

  useEffect(() => {
    const data = memory.data;
    if (!data) return;
    const key = scopeKey(scope);
    if (seededRef.current !== key) {
      seededRef.current = key;
      setDraft(data.content);
      setBaseline(data.content);
    }
  }, [memory.data, scope]);

  const dirty = draft !== baseline;

  function requestScope(value: string) {
    const next: MemoryScope =
      value === "global" ? { kind: "global" } : { kind: "project", path: value };
    if (scopeKey(next) === scopeKey(scope)) return;
    if (dirty) {
      setPendingScope(next);
      return;
    }
    setScope(next);
  }

  function handleSave(text: string) {
    saveMemory.mutate(
      { scope, content: text },
      {
        onSuccess: () => {
          setBaseline(text);
          toast({
            title: "Memory saved",
            description: memory.data?.path,
            variant: "success",
          });
        },
        onError: (error) =>
          toast({
            title: "Couldn't save memory",
            description: error.message,
            variant: "danger",
          }),
      },
    );
  }

  const scopeValue = scope.kind === "global" ? "global" : scope.path;
  const scopeOptions = [
    { label: "Global", value: "global" },
    ...(projects.data ?? []).map((p) => ({ label: p.name, value: p.path })),
  ];

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header: title + mono path | scope selector + Save -------------------- */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "var(--space-4)",
          padding: "var(--space-6) var(--gutter) var(--space-3_5)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-title)",
              fontWeight: "var(--weight-semibold)",
              letterSpacing: "var(--ls-title)",
              color: "var(--text)",
            }}
          >
            {t("header.memory.title")}
          </div>
          <div
            style={{
              marginTop: 3,
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-mono)",
              color: "var(--text-2)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {memory.data?.path ?? "…"}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            flexShrink: 0,
          }}
        >
          <Select
            options={scopeOptions}
            value={scopeValue}
            onChange={(e) => requestScope(e.target.value)}
            aria-label="Memory scope"
            style={{ width: 200 }}
          />
          <Button
            size="sm"
            loading={saveMemory.isPending}
            onClick={() => handleSave(draft)}
          >
            {t("common.save")}
          </Button>
        </div>
      </header>

      {/* Editor card: toolbar row + full-height markdown editor --------------- */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          margin: "0 var(--gutter) var(--space-6)",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-2xl)",
          boxShadow: "var(--shadow-card)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "9px 14px",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: "var(--weight-medium)",
              color: "var(--text-2)",
            }}
          >
            Markdown
          </span>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 10.5,
              color: "var(--text-3)",
            }}
          >
            Auto-saves on ⌘S
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <CodeEditor
            key={scopeKey(scope)}
            language="markdown"
            value={draft}
            onChange={setDraft}
            onSave={handleSave}
            height="100%"
          />
        </div>
      </div>

      {/* Unsaved-changes guard on scope switch ------------------------------- */}
      {pendingScope && (
        <Modal
          open
          onClose={() => setPendingScope(null)}
          title="Discard unsaved changes?"
          footer={
            <>
              <Button variant="ghost" onClick={() => setPendingScope(null)}>
                Keep editing
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const next = pendingScope;
                  setPendingScope(null);
                  setScope(next);
                }}
              >
                Discard
              </Button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            You have unsaved edits to{" "}
            <code style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
              {memory.data?.path}
            </code>
            . Switching scope will discard them.
          </p>
        </Modal>
      )}
    </div>
  );
}
