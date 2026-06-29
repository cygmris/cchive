/**
 * cchive brand mark — the "C-Key": the C of cchive bowing into a key (a broken
 * ring + a horizontal shaft with two downward teeth), on a 0 0 64 64 grid.
 *
 * - {@link LogoMark}: monochrome, paints in `currentColor` — use it inline
 *   (inherits text color), in `var(--accent)` for the wordmark lockup, or white
 *   on a colored tile.
 * - {@link LogoTile}: the macOS-style app icon — a clay-gradient 22% squircle
 *   with the mark in white.
 *
 * Both are `size`-driven and stay crisp from 16px to 48px (pure vector).
 */
import { useId } from "react";

type SvgProps = Omit<React.SVGProps<SVGSVGElement>, "width" | "height">;

interface LogoProps extends SvgProps {
  /** Rendered width/height in px. */
  size?: number;
  /** Accessible label. */
  title?: string;
}

/** The C-Key mark in `currentColor`. */
export function LogoMark({ size = 24, title = "cchive", ...rest }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label={title}
      {...rest}
    >
      <path
        d="M30 18.5A14 14 0 1 0 30 45.5"
        stroke="currentColor"
        strokeWidth={7.2}
        strokeLinecap="round"
      />
      <rect x="33" y="28.2" width="24" height="7.4" rx="3.7" fill="currentColor" />
      <rect x="50.5" y="35" width="6" height="9.5" rx="2.2" fill="currentColor" />
      <rect x="42" y="35" width="5" height="7" rx="2.2" fill="currentColor" />
    </svg>
  );
}

/** The clay-gradient app-icon tile with the mark in white. */
export function LogoTile({ size = 32, title = "cchive", ...rest }: LogoProps) {
  // Unique gradient id per instance so multiple tiles don't collide.
  const gradId = `cchive-tile-${useId()}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      {...rest}
    >
      <defs>
        {/* ~157° clay ramp (clay-300 → clay-500 → clay-600). */}
        <linearGradient
          id={gradId}
          x1="14"
          y1="2"
          x2="50"
          y2="62"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="var(--clay-300)" />
          <stop offset="0.52" stopColor="var(--clay-500)" />
          <stop offset="1" stopColor="var(--clay-600)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14.3" fill={`url(#${gradId})`} />
      {/* Inner top-light hairline. */}
      <rect
        width="64"
        height="64"
        rx="14.3"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1}
      />
      <g transform="translate(9.2 9.2) scale(0.71)" fill="none">
        <path
          d="M30 18.5A14 14 0 1 0 30 45.5"
          stroke="var(--on-accent)"
          strokeWidth={7.2}
          strokeLinecap="round"
        />
        <rect x="33" y="28.2" width="24" height="7.4" rx="3.7" fill="var(--on-accent)" />
        <rect x="50.5" y="35" width="6" height="9.5" rx="2.2" fill="var(--on-accent)" />
        <rect x="42" y="35" width="5" height="7" rx="2.2" fill="var(--on-accent)" />
      </g>
    </svg>
  );
}
