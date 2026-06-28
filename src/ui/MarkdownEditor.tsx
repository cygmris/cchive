/**
 * MarkdownEditor — the shared raw-`.md` editor modal.
 *
 * A `@/ui/Modal` hosting CodeMirror 6 (`@uiw/react-codemirror`) with the
 * `markdown()` language and a theme that reads entirely from the Clavis tokens,
 * so the editor chrome (surface, text, cursor, selection, gutter) tracks the
 * active light/dark theme via {@link useTheme}. A full-height mono editor for
 * agents/commands/skills bodies; Save returns the edited text, Cancel discards.
 *
 * Token-only styling; no secret handling — these resources are plain markdown.
 */
import { useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { Modal } from "@/ui/Modal";
import { Button } from "@/ui/Button";
import { useTheme } from "@/theme/ThemeProvider";

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

/**
 * Build a CodeMirror theme from the Clavis tokens. Values reference the CSS
 * custom properties directly, so a single extension renders correctly in both
 * light and dark — `dark` only flags CodeMirror's own base assumptions.
 */
function clavisTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: "var(--surface)",
        color: "var(--text)",
        fontSize: "var(--fs-mono)",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)",
        lineHeight: "var(--lh-mono)",
      },
      ".cm-content": {
        caretColor: "var(--accent)",
      },
      "&.cm-focused": {
        outline: "none",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--accent)",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        {
          backgroundColor: "var(--accent-tint)",
        },
      ".cm-activeLine": {
        backgroundColor: "var(--hover)",
      },
      ".cm-gutters": {
        backgroundColor: "var(--surface-2)",
        color: "var(--text-3)",
        border: "none",
        borderRight: "1px solid var(--border)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "var(--hover)",
        color: "var(--text-2)",
      },
      ".cm-selectionMatch": {
        backgroundColor: "var(--accent-tint)",
      },
    },
    { dark },
  );
}

export function MarkdownEditor({ title, value, onSave, onCancel }: MarkdownEditorProps) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState(value);

  const extensions = useMemo<Extension[]>(
    () => [markdown(), EditorView.lineWrapping],
    [],
  );
  const editorTheme = useMemo(() => clavisTheme(theme === "dark"), [theme]);

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
        <CodeMirror
          value={draft}
          onChange={setDraft}
          theme={editorTheme}
          extensions={extensions}
          height="60vh"
          autoFocus
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
          }}
        />
      </div>
    </Modal>
  );
}
