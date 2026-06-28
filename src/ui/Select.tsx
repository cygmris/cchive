/**
 * Select — a native `<select>` reskinned to the design tokens (radius md,
 * hairline border that deepens to `--border-strong` + `--ring-accent` on
 * focus, custom chevron). Native keeps it fully keyboard- and
 * screen-reader-accessible for free; the OS owns the option popup while the
 * trigger follows the active theme / accent / density.
 *
 * Pass `mono` for machine-text option values (model ids, paths). A
 * `placeholder` renders as a disabled, unselectable first option.
 */
import { forwardRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ChevronDown } from "@/ui/icons";

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Options to render. */
  options: SelectOption[];
  /** Placeholder shown as a disabled first option (use with `value=""`). */
  placeholder?: string;
  /** Render option text in `--font-mono` (model ids, paths). */
  mono?: boolean;
  /** Mark the field invalid (danger border). */
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    options,
    placeholder,
    mono = false,
    invalid = false,
    disabled = false,
    className,
    style,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);

  const borderColor = invalid
    ? "var(--danger)"
    : focused
      ? "var(--border-strong)"
      : "var(--border)";

  return (
    <div
      className={cn(className)}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: "100%",
        ...style,
      }}
    >
      <select
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
          width: "100%",
          height: "var(--field-h)",
          padding: "0 30px 0 10px",
          background: "var(--surface)",
          border: `1px solid ${borderColor}`,
          borderRadius: "var(--radius-md)",
          boxShadow: focused && !disabled ? "var(--ring-accent)" : "none",
          color: "var(--text)",
          fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
          fontSize: mono ? "var(--fs-mono)" : "var(--fs-body)",
          lineHeight: 1.4,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          outline: "none",
          transition: "border-color .15s ease, box-shadow .15s ease",
        }}
        {...rest}
      >
        {placeholder != null && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={15}
        aria-hidden
        style={{
          position: "absolute",
          right: 9,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--text-3)",
          pointerEvents: "none",
          opacity: disabled ? 0.5 : 1,
        }}
      />
    </div>
  );
});
