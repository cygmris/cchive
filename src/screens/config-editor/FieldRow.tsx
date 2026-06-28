/**
 * FieldRow — one editable setting in the Config Editor, rendered generically
 * from a {@link FieldDef}.
 *
 * Layout (design §4): a mono label + honest description on the left, a 300px-wide
 * control on the right, and an inline danger error underneath when present. The
 * control is chosen by `field.control`:
 *  - `text` / `number` → a mono {@link Input} (number validated on Save).
 *  - `secret`          → a masked {@link Input} (show/hide built in). It NEVER
 *                        renders the stored token: the field starts empty, shows
 *                        a "set / not set" status from {@link hasToken}, and only
 *                        a freshly-typed value is submitted (an empty field leaves
 *                        the vaulted key untouched).
 *  - `bool`            → a {@link Select} (Default / true / false).
 *  - `enum`            → a {@link Select} of the field's options.
 *
 * The value is a plain string (the editor keeps every field as a string and
 * converts on Save); `""` means "unset".
 */
import { Input } from "@/ui/Input";
import { Select } from "@/ui/Select";
import type { FieldDef } from "./schema";

export interface FieldRowProps {
  field: FieldDef;
  /** Current string value (`""` = unset). */
  value: string;
  /** Update this field's value. */
  onChange: (value: string) => void;
  /** Inline validation error to show under the control. */
  error?: string;
  /** Secret control only: whether a token already exists in the vault. */
  hasToken?: boolean;
  /** Hairline divider above the row (every row but the first). */
  divider?: boolean;
}

/** The "set / not set" status line beneath the secret control. */
function SecretStatus({ typed, hasToken }: { typed: boolean; hasToken: boolean }) {
  const { text, color } = typed
    ? { text: "A new key will be saved.", color: "var(--accent)" }
    : hasToken
      ? { text: "Set — leave blank to keep the current key.", color: "var(--success)" }
      : { text: "Not set.", color: "var(--text-3)" };
  return (
    <span
      style={{
        marginTop: 4,
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-body-sm)",
        lineHeight: "var(--lh-body-sm)",
        color,
      }}
    >
      {text}
    </span>
  );
}

export function FieldRow({
  field,
  value,
  onChange,
  error,
  hasToken = false,
  divider = false,
}: FieldRowProps) {
  const invalid = error != null;
  const controlId = `field-${field.key}`;

  function renderControl() {
    switch (field.control) {
      case "secret":
        return (
          <Input
            id={controlId}
            variant="secret"
            mono
            value={value}
            invalid={invalid}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case "bool":
      case "enum":
        return (
          <Select
            id={controlId}
            options={[...(field.options ?? [])]}
            value={value}
            invalid={invalid}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case "number":
        return (
          <Input
            id={controlId}
            mono
            inputMode="numeric"
            value={value}
            invalid={invalid}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      default:
        return (
          <Input
            id={controlId}
            mono
            value={value}
            invalid={invalid}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--space-6)",
        padding: "var(--space-3_5) 0",
        borderTop: divider ? "1px solid var(--border)" : "none",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <label
          htmlFor={controlId}
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-mono)",
            fontWeight: "var(--weight-medium)",
            color: "var(--text)",
            wordBreak: "break-word",
          }}
        >
          {field.label}
        </label>
        <p
          style={{
            margin: "3px 0 0",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-body-sm)",
            lineHeight: "var(--lh-body-sm)",
            color: "var(--text-2)",
          }}
        >
          {field.description}
        </p>
        {field.control === "secret" && (
          <SecretStatus typed={value.trim() !== ""} hasToken={hasToken} />
        )}
        {error != null && (
          <p
            role="alert"
            style={{
              margin: "4px 0 0",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-body-sm)",
              lineHeight: "var(--lh-body-sm)",
              color: "var(--danger)",
            }}
          >
            {error}
          </p>
        )}
      </div>
      <div style={{ width: 300, flexShrink: 0 }}>{renderControl()}</div>
    </div>
  );
}
