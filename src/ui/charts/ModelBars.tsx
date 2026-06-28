/**
 * ModelBars — ranked tokens-by-model horizontal bars.
 *
 * One row per {@link ModelTotal}: the model id (mono, truncated), its compact
 * formatted token value, and an accent fill bar whose width is that model's
 * share of the largest model's tokens (so the leader fills the track and the
 * rest scale down). The fill is `var(--accent)` over a `--surface-2` track, so
 * the chart retints with the accent and follows the theme — no hardcoded hex.
 * Token-only (no per-kind breakdown); fills its container width (responsive).
 */
import type { ModelTotal } from "@/lib/types";

/** Compact token label, e.g. `0` / `310K` / `3.1M` / `1.3B`. */
function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export interface ModelBarsProps {
  /** Models ranked by token count (desc). */
  data: ModelTotal[];
  className?: string;
}

export function ModelBars({ data, className }: ModelBarsProps) {
  const max = data.reduce((m, d) => Math.max(m, d.tokens), 0);
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        width: "100%",
      }}
    >
      {data.map((row) => {
        const pct = max > 0 ? (row.tokens / max) * 100 : 0;
        return (
          <div key={row.model} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "var(--space-3)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--fs-mono-sm)",
                  color: "var(--text-2)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.model}
              </span>
              <span
                style={{
                  flexShrink: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--fs-mono-sm)",
                  color: "var(--text)",
                }}
              >
                {formatTokens(row.tokens)}
              </span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: "var(--radius-pill)",
                background: "var(--surface-2)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  borderRadius: "var(--radius-pill)",
                  background: "var(--accent)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
