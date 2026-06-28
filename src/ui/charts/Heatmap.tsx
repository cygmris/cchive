/**
 * Heatmap — a GitHub-style contribution grid of daily token usage.
 *
 * Renders a 53-weeks × 7-days SVG grid from a trailing-year {@link HeatCell}
 * series (oldest → newest). Each cell is filled by its `level` (0..4) using five
 * `color-mix` steps off `--accent`, so the whole grid retints with the active
 * accent and follows light/dark via the surface tokens — no hardcoded hex. A
 * `<title>` gives every cell a native tooltip (date + token count); weekday
 * labels (Mon/Wed/Fri) sit in the left gutter and a "Less … More" legend sits
 * below. The SVG scales to its container width (responsive, no layout shift).
 */
import { cn } from "@/lib/cn";
import type { HeatCell } from "@/lib/types";

/** Five fills for levels 0..4, all derived from `--accent` (token-only). */
const LEVEL_FILL = [
  "color-mix(in srgb, var(--accent) 7%, var(--surface-2))",
  "color-mix(in srgb, var(--accent) 26%, var(--surface))",
  "color-mix(in srgb, var(--accent) 48%, var(--surface))",
  "color-mix(in srgb, var(--accent) 72%, var(--surface))",
  "var(--accent)",
] as const;

const CELL = 11; // cell edge, px
const GAP = 3; // gap between cells, px
const STEP = CELL + GAP; // grid pitch
const LABEL_W = 26; // left gutter for weekday labels
const ROWS = 7; // Sun..Sat

/** Local day-of-week (0 = Sun) from a `YYYY-MM-DD` string, TZ-safe. */
function dayOfWeek(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Compact token label, e.g. `0` / `4.2K` / `1.3M`. */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const WEEKDAY_LABELS: ReadonlyArray<[row: number, text: string]> = [
  [1, "Mon"],
  [3, "Wed"],
  [5, "Fri"],
];

export interface HeatmapProps {
  /** Trailing-year cells, oldest → newest. */
  cells: HeatCell[];
  className?: string;
}

export function Heatmap({ cells, className }: HeatmapProps) {
  if (cells.length === 0) {
    return (
      <div
        className={cn(className)}
        style={{ height: ROWS * STEP, color: "var(--text-3)" }}
      />
    );
  }

  const firstDow = dayOfWeek(cells[0].date);
  const cols = Math.ceil((firstDow + cells.length) / ROWS);
  const width = LABEL_W + cols * STEP;
  const height = ROWS * STEP;

  return (
    <div className={cn(className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label="Daily token usage heatmap for the past year"
        style={{ maxWidth: width, display: "block" }}
      >
        {WEEKDAY_LABELS.map(([row, text]) => (
          <text
            key={text}
            x={0}
            y={row * STEP + CELL - 1}
            fontSize={9}
            fontFamily="var(--font-mono)"
            fill="var(--text-3)"
          >
            {text}
          </text>
        ))}
        {cells.map((cell, i) => {
          const slot = firstDow + i;
          const col = Math.floor(slot / ROWS);
          const row = slot % ROWS;
          const level = Math.max(0, Math.min(4, cell.level));
          return (
            <rect
              key={cell.date}
              x={LABEL_W + col * STEP}
              y={row * STEP}
              width={CELL}
              height={CELL}
              rx={2}
              fill={LEVEL_FILL[level]}
            >
              <title>{`${cell.date} · ${fmtTokens(cell.tokens)} tokens`}</title>
            </rect>
          );
        })}
      </svg>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 6,
          marginTop: 8,
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-mono-sm)",
          color: "var(--text-3)",
        }}
      >
        <span>Less</span>
        {LEVEL_FILL.map((fill, i) => (
          <span
            key={i}
            aria-hidden
            style={{
              width: CELL,
              height: CELL,
              borderRadius: 2,
              background: fill,
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
