/**
 * Input — the text field used across the Config Editor, Settings, and search
 * bars. A hairline `--border` wrapper that deepens to `--border-strong` and
 * shows a 3px `--ring-accent` ring on focus-within (focus is tracked on the
 * wrapper so the secret reveal toggle keeps the ring alive too).
 *
 * Variants:
 *  - `text`   — plain field.
 *  - `search` — leading search glyph.
 *  - `secret` — masked value (`••••••••••••`) with a show/hide eye toggle.
 *
 * Pass `mono` for machine text (keys, URLs, model ids, paths) so the value
 * renders verbatim in Geist Mono. Styling reads entirely from design tokens,
 * so it follows the active theme / accent / density.
 */
import { forwardRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Eye, EyeOff, Search } from "@/ui/icons";

export type InputVariant = "text" | "search" | "secret";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Visual treatment. @default "text" */
  variant?: InputVariant;
  /** Render the value in `--font-mono` (keys, URLs, paths, model ids). */
  mono?: boolean;
  /** Mark the field invalid (danger border + ring). */
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    variant = "text",
    mono = false,
    invalid = false,
    disabled = false,
    className,
    style,
    type,
    placeholder,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const isSecret = variant === "secret";
  const isSearch = variant === "search";
  const inputType = isSecret ? (revealed ? "text" : "password") : (type ?? "text");

  const borderColor = invalid
    ? "var(--danger)"
    : focused
      ? "var(--border-strong)"
      : "var(--border)";
  const ring = invalid
    ? "0 0 0 3px color-mix(in srgb, var(--danger) 26%, transparent)"
    : "var(--ring-accent)";

  return (
    <div
      className={cn(className)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        width: "100%",
        minHeight: "var(--field-h)",
        padding: "0 10px",
        background: "var(--surface)",
        border: `1px solid ${borderColor}`,
        borderRadius: "var(--radius-md)",
        boxShadow: focused && !disabled ? ring : "none",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "text",
        transition: "border-color .15s ease, box-shadow .15s ease",
        ...style,
      }}
    >
      {isSearch && (
        <Search
          size={15}
          aria-hidden
          style={{ color: "var(--text-3)", flexShrink: 0 }}
        />
      )}
      <input
        ref={ref}
        type={inputType}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        placeholder={
          isSecret && placeholder == null ? "••••••••••••" : placeholder
        }
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          border: "none",
          outline: "none",
          background: "transparent",
          color: "var(--text)",
          fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
          fontSize: mono ? "var(--fs-mono)" : "var(--fs-body)",
          lineHeight: 1.4,
          cursor: disabled ? "not-allowed" : "text",
        }}
        {...rest}
      />
      {isSecret && (
        <button
          type="button"
          tabIndex={disabled ? -1 : 0}
          disabled={disabled}
          aria-label={revealed ? "Hide value" : "Show value"}
          aria-pressed={revealed}
          onClick={() => setRevealed((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            width: 22,
            height: 22,
            padding: 0,
            border: "none",
            background: "transparent",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-3)",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {revealed ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
        </button>
      )}
    </div>
  );
});
