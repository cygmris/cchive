/**
 * Usage screen — local consumption for Claude (projects jsonl via
 * {@link useUsage}) or Grok (session updates.jsonl via {@link useGrokUsage}).
 * The two series are never added together.
 *
 * Header (sticky flex row) carries Claude|Grok, a 30/7-day range
 * {@link SegmentedControl}, and a refresh {@link IconButton}. Claude branch:
 * four tiles (input/output/cache-read/est-cost) + output-per-day + heatmap.
 * Grok branch: est-cost/tokens/cache-read/calls + weekly credit bar + tokens
 * per day + per-model + heatmap.
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
import type { DayPoint, GrokCredits, GrokUsageSummary } from "@/lib/types";

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

/** Weekly Grok credit bar. Missing billing → a one-liner, not a fake 0%. */
function CreditReadout({ credits }: { credits: GrokCredits | null }) {
  if (!credits) {
    return (
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--fs-body-sm)",
          color: "var(--text-3)",
        }}
      >
        Weekly credit percent is unavailable until grok fetches billing.
      </div>
    );
  }
  const pct = Number.isFinite(credits.percent) ? credits.percent : 0;
  const clamped = Math.max(0, Math.min(100, pct));
  const stale = (credits.ageMinutes ?? 0) > 45;
  const end = credits.periodEnd ? credits.periodEnd.slice(0, 10) : "";
  const meta = [
    credits.subscriptionTier,
    end ? `resets ${end}` : "",
    stale ? "stale" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      role="meter"
      aria-label="Weekly Grok credits"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "var(--space-3)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-body-sm)",
            color: "var(--text-2)",
          }}
        >
          Weekly credits{" "}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-mono)",
              color: "var(--text)",
            }}
          >
            {pct.toFixed(0)}%
          </span>
        </span>
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-body-sm)",
            color: stale ? "var(--warning)" : "var(--text-3)",
          }}
        >
          {meta}
        </span>
      </div>
      <div
        aria-hidden
        style={{
          height: 6,
          borderRadius: "var(--radius-pill)",
          background: "var(--surface-2)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: "100%",
            background: stale ? "var(--warning)" : "var(--accent)",
            borderRadius: "var(--radius-pill)",
          }}
        />
      </div>
    </div>
  );
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
      {/* Flex header, not an absolute overlay: ScreenHeader's opaque sticky
          layer paints on top of absolute siblings in WebKitGTK, so the
          Claude|Grok radios existed in the DOM but could not be seen or
          clicked in the native app. Collection uses the same row. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 6,
          background: "var(--app-bg)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <ScreenHeader
            title={t("header.usage.title")}
            description={t("header.usage.description")}
          />
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-6) var(--gutter) 0 0",
            flexShrink: 0,
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
            <CreditReadout credits={grokData.credits} />
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
