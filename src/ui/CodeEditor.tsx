/**
 * CodeEditor — the shared inline CodeMirror editor.
 *
 * A non-modal CodeMirror 6 (`@uiw/react-codemirror`) surface used everywhere a
 * raw file is edited (Memory's `CLAUDE.md`, Projects' `settings.local.json`, and
 * the {@link MarkdownEditor} modal wrapper). The `language` prop selects
 * `markdown()` (with line wrapping) or `json()`; a `Mod-s` keymap calls
 * {@link CodeEditorProps.onSave} with the live document. Chrome (surface, text,
 * cursor, selection, gutter) reads entirely from the Clavis tokens, so it tracks
 * the active light/dark theme via {@link useTheme}.
 *
 * Token-only styling; full-height mono; no secret handling.
 */
import { useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { useTheme } from "@/theme/ThemeProvider";

export type CodeEditorLanguage = "markdown" | "json";

export interface CodeEditorProps {
  /** Which CodeMirror language mode to load. */
  language: CodeEditorLanguage;
  /** Current document text (controlled). */
  value: string;
  /** Called on every edit with the full text. */
  onChange: (value: string) => void;
  /** Called with the live text when `Mod-s` (⌘S / Ctrl-S) is pressed. */
  onSave?: (value: string) => void;
  /** Focus the editor on mount. */
  autoFocus?: boolean;
  /** CodeMirror height; defaults to full-height inline use. */
  height?: string;
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
        height: "100%",
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

export function CodeEditor({
  language,
  value,
  onChange,
  onSave,
  autoFocus,
  height = "100%",
}: CodeEditorProps) {
  const { theme } = useTheme();

  // Keep the latest onSave without re-creating the keymap extension on every
  // render; the keymap reads the live document so the text is always current.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const extensions = useMemo<Extension[]>(() => {
    const lang =
      language === "json"
        ? [json()]
        : [markdown(), EditorView.lineWrapping];
    const saveKeymap = Prec.highest(
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: (view) => {
            onSaveRef.current?.(view.state.doc.toString());
            return true;
          },
        },
      ]),
    );
    return [...lang, saveKeymap];
  }, [language]);

  const editorTheme = useMemo(() => clavisTheme(theme === "dark"), [theme]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={editorTheme}
      extensions={extensions}
      height={height}
      autoFocus={autoFocus}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
      }}
    />
  );
}
