/**
 * Clavis StatTile — a single headline metric.
 *
 * A small medium-weight label + an optional accent-tinted icon chip on top,
 * then a large Geist-Mono-Light numeral (`--fs-stat`, 30px) below. Renders a
 * real `<button>` so the whole tile is a keyboard-accessible navigation target;
 * with `onClick` it gains a pointer cursor + hover wash and a focus ring.
 *
 * Lay out in a 4-up grid at `--card-gap`; pre-format big numbers (K/M/B) before
 * passing `value`.
 */
import type * as React from "react";
import { cn } from "@/lib/cn";

export interface StatTileProps {
  /** Metric name, e.g. "Tokens today". */
  label: string;
  /** Formatted value, e.g. "246.1K" — rendered in Geist Mono Light. */
  value: React.ReactNode;
  /** Optional icon shown (at 14px) in the accent-tinted chip. */
  icon?: React.ReactNode;
  /** Makes the whole tile a target into the related screen. */
  onClick?: () => void;
  /** Extra classes merged onto the tile. */
  className?: string;
}

export function StatTile({
  label,
  value,
  icon,
  onClick,
  className,
}: StatTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-2.5 text-left",
        "rounded-2xl border border-border bg-surface",
        "px-4 pt-4 pb-3.5", // 16px 16px 14px (top / x / bottom)
        "shadow-[var(--shadow-card)]",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:shadow-[var(--ring-accent)]",
        onClick ? "cursor-pointer hover:bg-surface-2" : "cursor-default",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium leading-none text-text-2">
          {label}
        </span>
        {icon && (
          <span
            className={cn(
              "flex h-[26px] w-[26px] items-center justify-center",
              "rounded-md bg-accent-tint text-accent",
              "[&_svg]:h-[14px] [&_svg]:w-[14px]",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <span className="font-mono text-[length:var(--fs-stat)] font-light leading-none tracking-[var(--ls-stat)] text-text">
        {value}
      </span>
    </button>
  );
}
