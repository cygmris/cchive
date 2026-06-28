/**
 * MarkdownEditor — the shared raw-`.md` editor modal.
 *
 * A `@/ui/Modal` hosting the inline {@link CodeEditor} in `markdown` mode for
 * agents/commands/skills bodies. Save returns the edited text, Cancel discards;
 * `⌘S` inside the editor saves too. All CodeMirror setup and the Clavis token
 * theme live in `CodeEditor`, so this file is just the modal chrome.
 *
 * Token-only styling; no secret handling — these resources are plain markdown.
 */
import { useState } from "react";
import { Modal } from "@/ui/Modal";
import { Button } from "@/ui/Button";
import { CodeEditor } from "@/ui/CodeEditor";

export interface MarkdownEditorProps {
  /** Dialog heading (e.g. "Edit agent · reviewer"). */
  title: React.ReactNode;
  /** Initial markdown to edit. */
  value: string;
  /** Called with the edited markdown when Save is pressed. */
  onSave: (value: string) => void;
  /** Called when the editor is dismissed (Cancel, Esc, backdrop). */
  onCancel: () => void;
}

export function MarkdownEditor({ title, value, onSave, onCancel }: MarkdownEditorProps) {
  const [draft, setDraft] = useState(value);

  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(draft)}>
            Save
          </Button>
        </>
      }
    >
      <div
        style={{
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
        }}
      >
        <CodeEditor
          language="markdown"
          value={draft}
          onChange={setDraft}
          onSave={onSave}
          autoFocus
          height="60vh"
        />
      </div>
    </Modal>
  );
}
