/**
 * Radio — the selection indicator used in the account / provider configuration
 * rows. When active it becomes a 5px clay ring around an `--on-accent` center;
 * inactive it's a 2px `--border-strong` hairline circle.
 *
 * Controlled via `checked`; `onChange` fires when the control is activated
 * (selecting). Renders a real `<button role="radio">`, so Space/Enter select it
 * for free. Icon-only, so pass an `aria-label` / `aria-labelledby` for a name.
 */
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface RadioProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type"> {
  /** Selected state. @default false */
  checked?: boolean;
  /** Called when the radio is activated (selected). */
  onChange?: () => void;
  /** @default false */
  disabled?: boolean;
}

export function Radio({
  checked = false,
  onChange,
  disabled = false,
  className,
  ...rest
}: RadioProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.()}
      className={cn(
        "box-border inline-block h-[18px] w-[18px] shrink-0 rounded-full p-0 outline-none",
        "cursor-pointer transition-[border-color,border-width] duration-150 ease-out",
        "focus-visible:shadow-[var(--ring-accent)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-[5px] border-accent bg-on-accent"
          : "border-2 border-border-strong bg-transparent",
        className,
      )}
      {...rest}
    />
  );
}
