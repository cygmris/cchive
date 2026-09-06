/**
 * Usage screen — token consumption parsed from the local Claude Code session
 * logs (`~/.claude/projects/**`), served by the {@link useUsage} query.
 *
 * Header (sticky) carries a 30/7-day range {@link SegmentedControl} and a
 * refresh {@link IconButton} that re-parses the logs on demand. Below: four
 * {@link StatTile}s (input/output/cache-read totals + an estimated cost) each
 * flagged by a semantic colored dot and rendered in Geist-Mono numerals; an
 * "Output tokens per day" {@link OutputBars} chart for the active range; and an
 * "Activity" {@link Heatmap} of the trailing year. Loading shows a quiet state;
 * an empty history flows through naturally as zeros + an empty grid. Styling is
 * token-only — the dots use the semantic tokens, everything else the accent.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ScreenHeader } from "@/app/ScreenHeader";
import { Card } from "@/ui/Card";
import { IconButton } from "@/ui/IconButton";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { StatTile } from "@/ui/StatTile";
import { Heatmap } from "@/ui/charts/Heatmap";
import { OutputBars } from "@/ui/charts/OutputBars";
import { Loader, Refresh } from "@/ui/icons";
import { useGrokUsage, useUsage } from "@/lib/queries";
import type { DayPoint, GrokUsageSummary } from "@/lib/types";

type Range = "30" | "7";
type Agent = "claude" | "grok";

/** Compact token label, e.g. `0` / `246.1K` / `84.2M` / `1.3B`. */
function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** USD label with cents, e.g. `$0.00` / `$128.40`. */
function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** A small semantic indicator dot, rendered inside the StatTile icon chip. */
function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 9,
        height: 9,
        borderRadius: "var(--radius-pill)",
        background: color,
        display: "inline-block",
      }}
    />
  );
}

/** Card title + optional subtitle, shared by the chart and heatmap cards. */
function CardHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: "var(--space-3_5)" }}>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--fs-heading)",
          fontWeight: "var(--weight-semibold)",
          letterSpacing: "var(--ls-heading)",
          color: "var(--text)",
        }}
      >
        {title}
      </div>
      {subtitle != null && (
        <div
          style={{
            marginTop: 2,
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-body-sm)",
            color: "var(--text-3)",
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

function grokDaysAsOutput(summary: GrokUsageSummary): DayPoint[] {
  return summary.perDay.map((d) => ({
    date: d.date,
    output: d.tokens,
    input: 0,
    cacheRead: 0,
  }));
}

function creditLine(summary: GrokUsageSummary): string | null {
  const c = summary.credits;
  if (!c) return null;
  const pct = Number.isFinite(c.percent) ? `${c.percent.toFixed(0)}%` : "—";
  const tier = c.subscriptionTier ?? "";
  const end = c.periodEnd ? c.periodEnd.slice(0, 10) : "";
  const parts = [pct, tier, end ? `resets ${end}` : ""].filter(Boolean);
  const stale = (c.ageMinutes ?? 0) > 45 ? " · stale" : "";
  return parts.join(" · ") + stale;
}

export function UsageScreen() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("30");
  const [agent, setAgent] = useState<Agent>("claude");
  const rangeDays = range === "30" ? 30 : 7;
  const claude = useUsage(rangeDays);
  const grok = useGrokUsage(rangeDays);
  const data = claude.data;
  const grokData = grok.data;
  const isPending =
    agent === "grok" ? grok.isPending || grokData == null : claude.isPending || data == null;
  const isFetching = agent === "grok" ? grok.isFetching : claude.isFetching;
  function refresh() {
    if (agent === "grok") void grok.refetch();
    else void claude.refetch();
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
      }}
    >
      {/* Sticky header: title/one-liner + range toggle + refresh. The sticky
          element is the absolute containing block for the controls cluster. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 6,
          background: "var(--app-bg)",
        }}
      >
        <ScreenHeader
          title={t("header.usage.title")}
          description={t("header.usage.description")}
        />
        <div
          style={{
            position: "absolute",
            top: "var(--space-6)",
            right: "var(--gutter)",
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <SegmentedControl<Agent>
            aria-label="Usage agent"
            size="sm"
            options={[
              { value: "claude", label: "Claude" },
              { value: "grok", label: "Grok" },
            ]}
            value={agent}
            onChange={setAgent}
          />
          <SegmentedControl<Range>
            aria-label="Usage range"
            size="sm"
            options={[
              { value: "30", label: "30 days" },
              { value: "7", label: "7 days" },
            ]}
            value={range}
            onChange={setRange}
          />
          <IconButton
            aria-label="Refresh usage"
            icon={<Refresh size={16} />}
            disabled={isFetching}
            onClick={refresh}
          />
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "var(--card-gap)",
          padding: "0 var(--gutter) var(--space-8)",
        }}
      >
        {isPending ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              color: "var(--text-3)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-body)",
            }}
          >
            <Loader size={15} className="animate-spin" />
            Reading session logs…
          </div>
        ) : agent === "grok" && grokData ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: "var(--card-gap)",
              }}
            >
              <StatTile
                label="Est. cost"
                value={formatUsd(grokData.totals.costUsd)}
                icon={<Dot color="var(--accent)" />}
              />
              <StatTile
                label="Tokens"
                value={formatTokens(grokData.totals.tokens)}
                icon={<Dot color="var(--info)" />}
              />
              <StatTile
                label="Cache read"
                value={formatTokens(grokData.totals.cacheRead)}
                icon={<Dot color="var(--warning)" />}
              />
              <StatTile
                label="Calls"
                value={formatTokens(grokData.totals.calls)}
                icon={<Dot color="var(--success)" />}
              />
            </div>
            <div
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "var(--fs-body-sm)",
                color: "var(--text-3)",
              }}
            >
              {creditLine(grokData) ??
                "Weekly credit percent is unavailable until grok fetches billing."}
            </div>
            <Card>
              <CardHeading
                title="Tokens per day"
                subtitle={`Last ${rangeDays} days`}
              />
              <OutputBars data={grokDaysAsOutput(grokData)} />
            </Card>
            {grokData.perModel.length > 0 && (
              <Card>
                <CardHeading title="By model" subtitle="Last range · cost from ticks" />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--fs-mono-sm)",
                    color: "var(--text-2)",
                  }}
                >
                  {grokData.perModel.map((m) => (
                    <div
                      key={m.model}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "var(--space-3)",
                      }}
                    >
                      <span>{m.model}</span>
                      <span>{formatUsd(m.costUsd)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <Card>
              <CardHeading
                title="Activity"
                subtitle="Daily token usage · past year"
              />
              <Heatmap cells={grokData.heatmap} />
            </Card>
          </>
        ) : data ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: "var(--card-gap)",
              }}
            >
              <StatTile
                label="Input tokens"
                value={formatTokens(data.totals.input)}
                icon={<Dot color="var(--info)" />}
              />
              <StatTile
                label="Output tokens"
                value={formatTokens(data.totals.output)}
                icon={<Dot color="var(--success)" />}
              />
              <StatTile
                label="Cache read"
                value={formatTokens(data.totals.cacheRead)}
                icon={<Dot color="var(--warning)" />}
              />
              <StatTile
                label="Est. cost"
                value={formatUsd(data.estCostUsd)}
                icon={<Dot color="var(--accent)" />}
              />
            </div>

            <div
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "var(--fs-body-sm)",
                color: "var(--text-3)",
              }}
            >
              {data.unknownModels.length > 0
                ? `Cost is estimated from a local pricing table · ${
                    data.unknownModels.length
                  } model${
                    data.unknownModels.length === 1 ? "" : "s"
                  } unpriced.`
                : "Cost is estimated from a local pricing table."}
            </div>

            <Card>
              <CardHeading
                title="Output tokens per day"
                subtitle={`Last ${rangeDays} days`}
              />
              <OutputBars data={data.perDay} />
            </Card>

            <Card>
              <CardHeading
                title="Activity"
                subtitle="Daily token usage · past year"
              />
              <Heatmap cells={data.heatmap} />
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
