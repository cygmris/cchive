/**
 * Clavis Card — the base surface for everything in the content area.
 *
 * A hairline `--border` on `--surface` with a near-flat warm `--shadow-card`;
 * the border does the visual work. Variants:
 *  - `hero`      raised feature card (radius 16 + `--shadow-raised`); use one per screen.
 *  - `accentBar` 2.5px inset accent left bar (the active-configuration banner).
 *  - `pad`       padding override; defaults to the density-reactive `--card-pad`.
 *
 * Never nest Cards (don't stack shadows) — put plain `<div>`s inside.
 */
import type * as React from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Raised feature card — bigger radius + lift. @default false */
  hero?: boolean;
  /** 2.5px inset accent left bar (active-config banner). @default false */
  accentBar?: boolean;
  /** Padding override; defaults to `--card-pad` (20px, density-reactive). */
  pad?: string | number;
}

/** Base content surface — hairline border + soft warm shadow. */
export function Card({
  hero = false,
  accentBar = false,
  pad,
  className,
  style,
  children,
  ...rest
}: CardProps) {
  const baseShadow = hero ? "var(--shadow-raised)" : "var(--shadow-card)";
  // The accent bar rides in front of the elevation shadow as an inset.
  const boxShadow = accentBar
    ? `inset 2.5px 0 0 var(--accent), ${baseShadow}`
    : baseShadow;

  return (
    <div
      className={cn(className)}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: hero ? "var(--radius-3xl)" : "var(--radius-2xl)",
        boxShadow,
        padding: pad != null ? pad : "var(--card-pad)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
