/**
 * Button — the clay action button.
 *
 * Four variants map to the product: clay `primary` (the one filled action,
 * ≤1 per row), outlined `secondary` (pairs with primary on `--surface`),
 * quiet `ghost` (tertiary/inline), and `danger` (destructive only). Two sizes:
 * `md` (34px, default) and `sm` (28px, dense rows/toolbars).
 *
 * Styling reads entirely from the design tokens (via the Tailwind `@theme`
 * mapping), so it retints with the active accent + theme. Full state matrix:
 * hover (primary → `--accent-hover` ≈ brightness 1.05; secondary → surface
 * well; ghost → neutral `--hover` wash; danger → brightness 1.05), press
 * (primary/secondary land on `--accent-press` / pressed feel), focus-visible
 * (3px `--ring-accent`), and disabled (50% opacity, `not-allowed`).
 *
 * A real `<button>` — keyboard-activatable (Enter/Space) for free. Pass
 * `loading` to show a spinner and block interaction without losing width.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Loader } from "@/ui/icons";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual emphasis. @default "primary" */
  variant?: ButtonVariant;
  /** Control height. @default "md" */
  size?: ButtonSize;
  /** Leading icon node (16–18px). Replaced by a spinner while `loading`. */
  icon?: ReactNode;
  /** Trailing icon node (16–18px). */
  trailingIcon?: ReactNode;
  /** Show a spinner and block interaction (kept width, `aria-busy`). */
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-on-accent border-transparent hover:bg-accent-hover active:bg-accent-press",
  secondary:
    "bg-surface text-text border-border-strong hover:bg-surface-2 active:bg-surface-2",
  ghost:
    "bg-transparent text-text-2 border-transparent hover:bg-hover hover:text-text active:bg-hover",
  danger:
    "bg-danger text-on-accent border-transparent hover:brightness-105 active:brightness-95",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "h-[var(--control-h)] px-[15px] text-[12.5px]",
  sm: "h-[var(--control-h-sm)] px-3 text-[11.5px]",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  trailingIcon,
  loading = false,
  disabled = false,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const spinnerSize = size === "sm" ? 14 : 16;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center gap-[7px] whitespace-nowrap",
        "rounded-lg border font-sans font-semibold outline-none",
        "cursor-pointer transition duration-150 ease-out",
        "focus-visible:shadow-[var(--ring-accent)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader className="animate-spin" size={spinnerSize} aria-hidden />
      ) : (
        icon
      )}
      {children}
      {trailingIcon}
    </button>
  );
}
