/**
 * IconButton — a square, quiet button for a single glyph (sign-out, edit,
 * overflow menus, toolbar actions). Radius `md` (8px), transparent at rest,
 * picking up the neutral `--hover` wash + `--text` ink on hover. Set `danger`
 * to redden the glyph on hover (the destructive sign-out/delete affordance).
 *
 * A real `<button>` — keyboard-activatable (Enter/Space). Icon-only, so always
 * pass an `aria-label` for an accessible name.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type IconButtonSize = "sm" | "md";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The glyph to render (a sized icon node). */
  icon: ReactNode;
  /** Square footprint. @default "md" (30px); `sm` is 28px. */
  size?: IconButtonSize;
  /** Redden the glyph on hover, for destructive actions. @default false */
  danger?: boolean;
}

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  md: "h-[30px] w-[30px]",
  sm: "h-7 w-7",
};

export function IconButton({
  icon,
  size = "md",
  danger = false,
  type = "button",
  disabled = false,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        "rounded-md border-none bg-transparent text-text-3 outline-none",
        "cursor-pointer transition duration-150 ease-out",
        "hover:bg-hover",
        danger ? "hover:text-danger" : "hover:text-text",
        "focus-visible:shadow-[var(--ring-accent)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
