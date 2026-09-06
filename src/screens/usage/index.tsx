/**
 * Usage screen — Claude (`useUsage`), Codex (`useCodexUsage`), Grok
 * (`useGrokUsage`). Header: All | Claude | Codex | Grok plus 30/7.
 * All is a labelled fold (By agent); other panes stay separate.
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
import { useCodexUsage, useGrokUsage, useUsage } from "@/lib/queries";
import type {
  DayPoint,
  GrokCredits,
  GrokUsageSummary,
  HeatCell,
  UsageSummary,
} from "@/lib/types";

type Range = "30" | "7";
type Agent = "all" | "claude" | "codex" | "grok";

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

function codexDaysAsOutput(summary: GrokUsageSummary): DayPoint[] {
  return summary.perDay.map((d) => ({
    date: d.date,
    output: d.output,
    input: d.input,
    cacheRead: d.cacheRead,
  }));
}

/** All pane daily series: output/input/cacheRead summed per date. */
export function foldAllDays(
  claude: UsageSummary,
  grok: GrokUsageSummary,
  codex: GrokUsageSummary,
): DayPoint[] {
  const grokByDate = new Map(grok.perDay.map((d) => [d.date, d]));
  const codexByDate = new Map(codex.perDay.map((d) => [d.date, d]));
  const claudeByDate = new Map(claude.perDay.map((d) => [d.date, d]));
  const dates = new Set<string>();
  for (const d of claude.perDay) dates.add(d.date);
  for (const d of grok.perDay) dates.add(d.date);
  for (const d of codex.perDay) dates.add(d.date);
  return [...dates].sort().map((date) => {
    const c = claudeByDate.get(date);
    const g = grokByDate.get(date);
    const x = codexByDate.get(date);
    return {
      date,
      output: (c?.output ?? 0) + (g?.output ?? 0) + (x?.output ?? 0),
      input: (c?.input ?? 0) + (g?.input ?? 0) + (x?.input ?? 0),
      cacheRead: (c?.cacheRead ?? 0) + (g?.cacheRead ?? 0) + (x?.cacheRead ?? 0),
    };
  });
}

function heatLevel(tokens: number, max: number): HeatCell["level"] {
  if (tokens === 0 || max === 0) return 0;
  const frac = tokens / max;
  if (frac <= 0.25) return 1;
  if (frac <= 0.5) return 2;
  if (frac <= 0.75) return 3;
  return 4;
}

function mergeHeatmaps(series: HeatCell[][]): HeatCell[] {
  const byDate = new Map<string, number>();
  const order: string[] = [];
  for (const cells of series) {
    for (const cell of cells) {
      if (!byDate.has(cell.date)) order.push(cell.date);
      byDate.set(cell.date, (byDate.get(cell.date) ?? 0) + cell.tokens);
    }
  }
  const max = Math.max(0, ...byDate.values());
  return order.map((date) => {
    const tokens = byDate.get(date) ?? 0;
    return { date, tokens, level: heatLevel(tokens, max) };
  });
}

/** Weekly Grok credit bar. Missing billing → a one-liner, not a fake 0%. */
function CreditReadout({
  credits,
  unavailable = "Weekly credit percent is unavailable until grok fetches billing.",
}: {
  credits: GrokCredits | null;
  unavailable?: string;
}) {
  if (!credits) {
    return (
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--fs-body-sm)",
          color: "var(--text-3)",
        }}
      >
        {unavailable}
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
      aria-label="Weekly credits"
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

function CodexPane({
  summary,
  rangeDays,
}: {
  summary: GrokUsageSummary;
  rangeDays: number;
}) {
  return (
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
          value={formatTokens(summary.totals.input)}
          icon={<Dot color="var(--info)" />}
        />
        <StatTile
          label="Output tokens"
          value={formatTokens(summary.totals.output)}
          icon={<Dot color="var(--success)" />}
        />
        <StatTile
          label="Cache read"
          value={formatTokens(summary.totals.cacheRead)}
          icon={<Dot color="var(--warning)" />}
        />
        <StatTile
          label="Est. cost"
          value={formatUsd(summary.totals.costUsd)}
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
        {summary.unknownModels && summary.unknownModels.length > 0
          ? `Cost is estimated from OpenAI list rates (standard, short context) · ${
              summary.unknownModels.length
            } model${summary.unknownModels.length === 1 ? "" : "s"} unpriced.`
          : "Cost is estimated from OpenAI list rates (standard, short context)."}
      </div>
      <CreditReadout
        credits={summary.credits}
        unavailable="Weekly percent is unavailable until a Codex session writes rate_limits."
      />
      <Card>
        <CardHeading title="Output tokens per day" subtitle={`Last ${rangeDays} days`} />
        <OutputBars data={codexDaysAsOutput(summary)} />
      </Card>
      {summary.perModel.length > 0 && (
        <Card>
          <CardHeading title="By model" subtitle="Last range · list-rate estimate" />
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
            {summary.perModel.map((m) => (
              <div
                key={m.model}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                }}
              >
                <span>{m.model}</span>
                <span>
                  {formatUsd(m.costUsd)} · {formatTokens(m.tokens)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card>
        <CardHeading title="Activity" subtitle="Daily token usage · past year" />
        <Heatmap cells={summary.heatmap} />
      </Card>
    </>
  );
}

function AllPane({
  claude,
  grok,
  codex,
  rangeDays,
}: {
  claude: UsageSummary;
  grok: GrokUsageSummary;
  codex: GrokUsageSummary;
  rangeDays: number;
}) {
  const days = foldAllDays(claude, grok, codex);
  const rows = [
    {
      name: "Claude",
      cost: claude.estCostUsd,
      tokens: claude.totals.input + claude.totals.output,
    },
    { name: "Codex", cost: codex.totals.costUsd, tokens: codex.totals.tokens },
    { name: "Grok", cost: grok.totals.costUsd, tokens: grok.totals.tokens },
  ];
  return (
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
          value={formatTokens(
            claude.totals.input + grok.totals.input + codex.totals.input,
          )}
          icon={<Dot color="var(--info)" />}
        />
        <StatTile
          label="Output tokens"
          value={formatTokens(
            claude.totals.output + grok.totals.output + codex.totals.output,
          )}
          icon={<Dot color="var(--success)" />}
        />
        <StatTile
          label="Cache read"
          value={formatTokens(
            claude.totals.cacheRead + grok.totals.cacheRead + codex.totals.cacheRead,
          )}
          icon={<Dot color="var(--warning)" />}
        />
        <StatTile
          label="Est. cost"
          value={formatUsd(claude.estCostUsd + grok.totals.costUsd + codex.totals.costUsd)}
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
        Cost sums Claude estimates, Codex OpenAI list rates, and Grok ticks.
      </div>
      <Card>
        <CardHeading title="By agent" subtitle="This range · not a silent mix" />
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
          {rows.map((r) => (
            <div
              key={r.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "var(--space-3)",
              }}
            >
              <span>{r.name}</span>
              <span>
                {formatUsd(r.cost)} · {formatTokens(r.tokens)}
              </span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeading title="Output tokens per day" subtitle={`Last ${rangeDays} days`} />
        <OutputBars data={days} />
      </Card>
      <Card>
        <CardHeading title="Activity" subtitle="Daily token usage · past year" />
        <Heatmap cells={mergeHeatmaps([claude.heatmap, grok.heatmap, codex.heatmap])} />
      </Card>
    </>
  );
}

export function UsageScreen() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("30");
  const [agent, setAgent] = useState<Agent>("claude");
  const rangeDays = range === "30" ? 30 : 7;
  const wantGrok = agent === "grok" || agent === "all";
  const wantCodex = agent === "codex" || agent === "all";
  const claude = useUsage(rangeDays);
  const grok = useGrokUsage(rangeDays, wantGrok);
  const codex = useCodexUsage(rangeDays, wantCodex);
  const data = claude.data;
  const grokData = grok.data;
  const codexData = codex.data;
  const isPending =
    agent === "all"
      ? claude.isPending ||
        data == null ||
        grok.isPending ||
        grokData == null ||
        codex.isPending ||
        codexData == null
      : agent === "grok"
        ? grok.isPending || grokData == null
        : agent === "codex"
          ? codex.isPending || codexData == null
          : claude.isPending || data == null;
  const isFetching =
    agent === "all"
      ? claude.isFetching || grok.isFetching || codex.isFetching
      : agent === "grok"
        ? grok.isFetching
        : agent === "codex"
          ? codex.isFetching
          : claude.isFetching;
  function refresh() {
    if (agent === "all") {
      void claude.refetch();
      void grok.refetch();
      void codex.refetch();
    } else if (agent === "grok") void grok.refetch();
    else if (agent === "codex") void codex.refetch();
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
              { value: "all", label: "All" },
              { value: "claude", label: "Claude" },
              { value: "codex", label: "Codex" },
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
        ) : agent === "all" && data && grokData && codexData ? (
          <AllPane
            claude={data}
            grok={grokData}
            codex={codexData}
            rangeDays={rangeDays}
          />
        ) : agent === "codex" && codexData ? (
          <CodexPane summary={codexData} rangeDays={rangeDays} />
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
