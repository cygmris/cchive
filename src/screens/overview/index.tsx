/**
 * Overview — the real landing screen (replaces the S2 placeholder).
 *
 * Pure composition over the existing data layer (design §2): an active-connection
 * hero from {@link useActiveIdentity} (account vs provider variant), four
 * deep-linking {@link StatTile}s (accounts / enabled-MCP / enabled-skills /
 * tokens-today counts), a charts row ({@link OutputBars} + {@link ModelBars} from
 * {@link useUsage}), and a recent-activity feed ({@link useActivity}). Every value
 * is real query data; machine values render mono and the metrics use the big mono
 * numeral. Tiles + hero buttons deep-link via `go()`.
 *
 * Outside Tauri the query layer serves a clearly-labelled DEMO seed, so the screen
 * still renders in `vite dev` / the gallery.
 */
import { Badge, ProviderChip } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { StatTile } from "@/ui/StatTile";
import { OutputBars } from "@/ui/charts/OutputBars";
import { ModelBars } from "@/ui/charts/ModelBars";
import { Activity, BarChart, Book, Key, Server, Sparkles, User } from "@/ui/icons";
import { ScreenHeader } from "@/app/ScreenHeader";
import { AccountAvatar, initialsOf } from "@/app/AccountSwitcher";
import { brandForProvider } from "@/screens/configurations/ProviderRow";
import {
  useAccounts,
  useActiveIdentity,
  useActivity,
  useMcpServers,
  useProviders,
  useResources,
  useUsage,
} from "@/lib/queries";
import { useShellStore } from "@/lib/store";
import type { ActiveIdentity, ProviderMeta } from "@/lib/types";

/** The usage window the Overview charts + tokens-today tile read. */
const OVERVIEW_RANGE_DAYS = 30;

/** How many recent-activity entries the feed requests. */
const ACTIVITY_LIMIT = 6;

/** Compact token label, e.g. `0` / `246.1K` / `84.2M` / `1.3B`. */
function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Coarse relative-time label for the activity feed, e.g. `2h ago` / `Yesterday`. */
function relativeTime(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  return new Date(ts).toLocaleDateString();
}

/** The feed icon for an activity `kind` bucket. */
function ActivityIcon({ kind }: { kind: string }) {
  switch (kind) {
    case "account":
      return <User size={14} aria-hidden />;
    case "provider":
      return <Key size={14} aria-hidden />;
    case "mcp":
      return <Server size={14} aria-hidden />;
    case "skill":
      return <Sparkles size={14} aria-hidden />;
    case "memory":
      return <Book size={14} aria-hidden />;
    default:
      return <Activity size={14} aria-hidden />;
  }
}

/** Is `provider` the live active configuration? Match on label, else model. */
function providerIsActive(
  provider: ProviderMeta,
  identity: ActiveIdentity | undefined,
): boolean {
  if (!identity || identity.kind !== "provider") return false;
  if (identity.label === provider.label) return true;
  return Boolean(provider.model && identity.model === provider.model);
}

/** Uppercase accent eyebrow that tops the hero (pairs with its accent bar). */
function HeroEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-label)",
        fontWeight: "var(--weight-semibold)",
        letterSpacing: "var(--ls-label)",
        textTransform: "uppercase",
        color: "var(--accent)",
      }}
    >
      {children}
    </div>
  );
}

/** Card title + optional subtitle, shared by the chart + activity cards. */
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

/** The hero name (title) + its mono sub line. */
function HeroText({
  name,
  sub,
  badge,
}: {
  name: string;
  sub: string | null;
  badge: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 4 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-title)",
            fontWeight: "var(--weight-semibold)",
            letterSpacing: "var(--ls-title)",
            color: "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </span>
        {badge}
      </div>
      {sub && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-mono-sm)",
            color: "var(--text-3)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

/**
 * The active-connection hero. Account variant by default; provider variant when
 * the live identity is a provider (base URL + brand chip resolved from the saved
 * provider preset, which carries the non-secret base URL the identity omits).
 */
function Hero({ identity }: { identity: ActiveIdentity | undefined }) {
  const go = useShellStore((s) => s.go);
  const setEditingProvider = useShellStore((s) => s.setEditingProvider);
  const providers = useProviders();

  const isProvider = identity?.kind === "provider";

  let figure: React.ReactNode;
  let eyebrow: string;
  let name: string;
  let sub: string | null;
  let badge: React.ReactNode = null;
  let primaryLabel: string;
  let onPrimary: () => void;

  if (isProvider && identity) {
    const activeProvider = (providers.data ?? []).find((p) =>
      providerIsActive(p, identity),
    );
    const brandMeta: ProviderMeta = activeProvider ?? {
      id: "",
      label: identity.label,
      baseUrl: null,
      model: identity.model,
    };
    figure = <ProviderChip provider={brandForProvider(brandMeta)} size={44} />;
    eyebrow = "Active configuration";
    name = identity.label;
    sub = activeProvider?.baseUrl ?? null;
    badge = identity.model ? <Badge variant="neutral">{identity.model}</Badge> : null;
    primaryLabel = "Edit config";
    onPrimary = () => {
      if (activeProvider) setEditingProvider(activeProvider.id);
      go("editor");
    };
  } else {
    const label = identity?.label ?? "No active config";
    figure = (
      <AccountAvatar seed={initialsOf(label)} index={0} size={44} fontSize={16} />
    );
    eyebrow = "Active account";
    name = label;
    sub = identity?.email ?? null;
    badge = identity?.tier ? (
      <Badge variant="accent">{`Claude ${identity.tier}`}</Badge>
    ) : null;
    primaryLabel = "Manage account";
    onPrimary = () => go("configs");
  }

  return (
    <Card
      hero
      accentBar
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          minWidth: 0,
        }}
      >
        {figure}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <HeroEyebrow>{eyebrow}</HeroEyebrow>
          <HeroText name={name} sub={sub} badge={badge} />
        </div>
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
        <Button variant="secondary" onClick={() => go("configs")}>
          Switch
        </Button>
        <Button onClick={onPrimary}>{primaryLabel}</Button>
      </div>
    </Card>
  );
}

/** A muted single-line note inside a card (loading / empty model usage). */
function CardNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "var(--space-5) var(--space-4)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-body-sm)",
        color: "var(--text-3)",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

export function OverviewScreen() {
  const go = useShellStore((s) => s.go);

  const { data: identity } = useActiveIdentity();
  const accounts = useAccounts();
  const mcp = useMcpServers();
  const skills = useResources("skill");
  const usage = useUsage(OVERVIEW_RANGE_DAYS);
  const activity = useActivity(ACTIVITY_LIMIT);

  const accountsCount = accounts.isLoading ? "—" : String((accounts.data ?? []).length);
  const mcpCount = mcp.isLoading
    ? "—"
    : String((mcp.data ?? []).reduce((n, s) => n + (s.enabled ? 1 : 0), 0));
  const skillsCount = skills.isLoading
    ? "—"
    : String((skills.data ?? []).reduce((n, r) => n + (r.enabled ? 1 : 0), 0));

  const perDay = usage.data?.perDay ?? [];
  const todayOutput = perDay[perDay.length - 1]?.output ?? 0;
  const tokensToday = usage.isLoading ? "—" : formatTokens(todayOutput);

  const perModel = usage.data?.perModel ?? [];
  const activityList = activity.data ?? [];

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
      }}
    >
      <ScreenHeader
        title="Overview"
        description="Your Claude Code control room — keys, servers and usage at a glance."
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "var(--card-gap)",
          padding: "0 var(--gutter) var(--space-8)",
        }}
      >
        <Hero identity={identity} />

        {/* Stat tiles — four clickable deep-links into their screens. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "var(--card-gap)",
          }}
        >
          <StatTile
            label="Claude accounts"
            value={accountsCount}
            icon={<Key />}
            onClick={() => go("configs")}
          />
          <StatTile
            label="MCP servers"
            value={mcpCount}
            icon={<Server />}
            onClick={() => go("mcp")}
          />
          <StatTile
            label="Skills"
            value={skillsCount}
            icon={<Sparkles />}
            onClick={() => go("skills")}
          />
          <StatTile
            label="Tokens today"
            value={tokensToday}
            icon={<BarChart />}
            onClick={() => go("usage")}
          />
        </div>

        {/* Charts row — output-per-day + ranked tokens-by-model. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)",
            gap: "var(--card-gap)",
          }}
        >
          <Card>
            <CardHeading title="Output tokens" subtitle="Last 30 days" />
            <OutputBars data={perDay} />
          </Card>
          <Card>
            <CardHeading title="Tokens by model" subtitle="30d" />
            {usage.isLoading ? (
              <CardNote>Reading session logs…</CardNote>
            ) : perModel.length === 0 ? (
              <CardNote>No model usage yet.</CardNote>
            ) : (
              <ModelBars data={perModel} />
            )}
          </Card>
        </div>

        {/* Recent activity — label-only feed of recent switches/toggles/edits. */}
        <Card>
          <CardHeading title="Recent activity" />
          {activity.isLoading ? (
            <CardNote>Loading activity…</CardNote>
          ) : activityList.length === 0 ? (
            <CardNote>No recent activity yet.</CardNote>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {activityList.map((entry, i) => (
                <div
                  key={`${entry.timestamp}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    padding: "10px 0",
                    borderTop: i > 0 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 28,
                      height: 28,
                      flexShrink: 0,
                      borderRadius: "var(--radius-md)",
                      background: "var(--accent-tint)",
                      color: "var(--accent)",
                    }}
                  >
                    <ActivityIcon kind={entry.kind} />
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--fs-body)",
                      color: "var(--text)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {entry.message}
                  </span>
                  <span
                    style={{
                      flexShrink: 0,
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--fs-mono-sm)",
                      color: "var(--text-3)",
                    }}
                  >
                    {relativeTime(entry.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
