/**
 * Switch — the clay toggle for a single instantly-applied setting (MCP servers,
 * notification types, experimental flags). Round track + knob: on = `--accent`,
 * off = `--border-strong`, with a ~0.18s ease motion on both the track tint and
 * the knob slide.
 *
 * Controlled: pass `checked` + `onChange(next)`. Renders a real
 * `<button role="switch">`, so Space/Enter toggle it for free. Geometry is per
 * size (px, matching the design grid); all colors come from tokens.
 */
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type SwitchSize = "sm" | "md";

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type"> {
  /** On/off state. @default false */
  checked?: boolean;
  /** Called with the next boolean when toggled. */
  onChange?: (next: boolean) => void;
  /** Track footprint. @default "md" (40×23); `sm` is 34×20. */
  size?: SwitchSize;
  /** @default false */
  disabled?: boolean;
}

interface SwitchGeometry {
  width: number;
  height: number;
  knob: number;
  pad: number;
  travel: number;
}

const SIZES: Record<SwitchSize, SwitchGeometry> = {
  md: { width: 40, height: 23, knob: 18, pad: 2.5, travel: 17 },
  sm: { width: 34, height: 20, knob: 16, pad: 2, travel: 14 },
};

export function Switch({
  checked = false,
  onChange,
  size = "md",
  disabled = false,
  className,
  ...rest
}: SwitchProps) {
  const geo = SIZES[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      style={{ width: geo.width, height: geo.height, padding: geo.pad }}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border-none outline-none",
        "cursor-pointer transition-colors duration-[180ms] ease-out",
        "focus-visible:shadow-[var(--ring-accent)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-accent" : "bg-border-strong",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden
        style={{
          width: geo.knob,
          height: geo.knob,
          transform: checked ? `translateX(${geo.travel}px)` : "translateX(0)",
        }}
        className="block rounded-full bg-on-accent shadow-[var(--shadow-knob)] transition-transform duration-[180ms] ease-out"
      />
    </button>
  );
}
