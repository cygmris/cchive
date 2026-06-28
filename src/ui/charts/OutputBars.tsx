/**
 * OutputBars — daily output-tokens bar chart (Recharts).
 *
 * One bar per {@link DayPoint} over the active range. The most recent bar (today)
 * is solid `--accent`; the rest are the accent at ~62% so today reads as the
 * focal point. Colors are `color-mix`/`var(--accent)` strings, so the chart
 * retints with the accent and follows the theme — no hardcoded hex. The chart
 * fills its container width via `ResponsiveContainer` (responsive, fixed height,
 * no layout shift) and shows a token-styled per-bar tooltip on hover.
 */
import {
  Bar,
  BarChart,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BarShapeProps } from "recharts";
import type { DayPoint } from "@/lib/types";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** `2026-06-28` → `Jun 28` for axis ticks + the tooltip header. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}`;
}

/** Compact token label, e.g. `4.2K` / `1.3M`. */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const ACCENT_SOLID = "var(--accent)";
const ACCENT_SOFT = "color-mix(in srgb, var(--accent) 62%, transparent)";

/** Rounded top corners; kept on the custom bar shape (replaces `Bar.radius`). */
const BAR_RADIUS: [number, number, number, number] = [3, 3, 0, 0];

interface OutputTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DayPoint }>;
}

/** Token-styled tooltip: date header + `{fmt} output tokens`. */
function OutputTooltip({ active, payload }: OutputTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div
      style={{
        padding: "6px 9px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--shadow-raised)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--fs-body-sm)",
          color: "var(--text-3)",
        }}
      >
        {shortDate(point.date)}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-mono-sm)",
          color: "var(--text)",
        }}
      >
        {fmtTokens(point.output)} output tokens
      </div>
    </div>
  );
}

export interface OutputBarsProps {
  /** Per-day series over the range, oldest → newest. */
  data: DayPoint[];
  /** Chart height in px. @default 230 */
  height?: number;
  className?: string;
}

export function OutputBars({ data, height = 230, className }: OutputBarsProps) {
  const lastIndex = data.length - 1;
  return (
    <div className={className} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            interval="preserveStartEnd"
            minTickGap={28}
            tickLine={false}
            axisLine={false}
            tick={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              fill: "var(--text-3)",
            }}
          />
          <YAxis hide />
          <Tooltip
            content={<OutputTooltip />}
            cursor={{ fill: "var(--hover)" }}
          />
          {/* Per-bar color via the current `shape` API (Recharts deprecated
              `<Cell>`): today's bar is solid accent, the rest the soft accent. */}
          <Bar
            dataKey="output"
            maxBarSize={28}
            shape={(props: BarShapeProps) => (
              <Rectangle
                {...props}
                radius={BAR_RADIUS}
                fill={props.index === lastIndex ? ACCENT_SOLID : ACCENT_SOFT}
              />
            )}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
