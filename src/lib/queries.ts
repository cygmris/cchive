/**
 * TanStack Query data layer — the React shell's only typed window onto the S3
 * Rust core. Components call THESE hooks; they never import `ipc.ts` or
 * `invoke` directly.
 *
 * Each query/mutation wraps one (or, for `useCreateProvider`, a composed) IPC
 * call from {@link ./ipc}. Mutations invalidate the queries they affect on
 * success and normalise failures to an `Error` whose `.message` is the Rust
 * `CoreError` message (which serialises as `{ code, message }`).
 *
 * Outside the Tauri runtime (`vite dev`, the `#/gallery` route, a plain browser)
 * there is no backend: queries resolve to a clearly-LABELLED demo seed so the
 * gallery still renders, and mutations no-op by rejecting with a "desktop app
 * only" message the caller can surface. No token ever enters the query cache —
 * the only secret-bearing value is a provider key passed straight into a single
 * `useCreateProvider`/`useApplyProvider` submit and never stored.
 */
import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";

import * as ipc from "./ipc";
import { useShellStore } from "./store";
import type {
  AccountMeta,
  ActiveIdentity,
  ActivityEntry,
  BackupEntry,
  DayPoint,
  EnvOverrides,
  HeatCell,
  ImportSummary,
  LatencyResult,
  McpServer,
  McpServerInput,
  MemoryDoc,
  MemoryScope,
  NotificationKind,
  NotificationState,
  Project,
  ProjectSettings,
  ProviderConfigInput,
  ProviderConfigView,
  ProviderMeta,
  Resource,
  ResourceKind,
  SettingsSummary,
  SwitchResult,
  UsageSummary,
} from "./types";

/* ------------------------------------------------------------------------- *
 * Query keys — narrow tuples so mutations can invalidate precisely.
 * ------------------------------------------------------------------------- */
export const queryKeys = {
  accounts: ["accounts"] as const,
  providers: ["providers"] as const,
  /** One provider's full editor view, keyed by id (`provider:<id>`). */
  provider: (id: string) => ["provider", id] as const,
  activeIdentity: ["activeIdentity"] as const,
  envOverrides: ["envOverrides"] as const,
  settingsSummary: ["settingsSummary"] as const,
  /** The usage aggregate for one range window (`usage:<rangeDays>`). */
  usage: (rangeDays: number) => ["usage", rangeDays] as const,
  /** Global MCP servers (enabled + disabled stash). */
  mcpServers: ["mcpServers"] as const,
  /** Markdown resources of one kind (`resources:<kind>`). */
  resources: (kind: ResourceKind) => ["resources", kind] as const,
  /** One `CLAUDE.md` keyed by scope (`memory:global` or `memory:project:<path>`). */
  memory: (scope: MemoryScope) => ["memory", scopeKey(scope)] as const,
  /** The projects discovered from `~/.claude.json`. */
  projects: ["projects"] as const,
  /** One project's `.claude/settings.local.json` (`projectSettings:<path>`). */
  projectSettings: (path: string) => ["projectSettings", path] as const,
  /** The capped recent-activity feed (mutations invalidate this on append). */
  activity: ["activity"] as const,
  /** The installed notification-hook state (toggles invalidate this). */
  notifications: ["notifications"] as const,
  /** Whether the app is registered to launch at login (the toggle invalidates this). */
  autostart: ["autostart"] as const,
  /** The rotating Claude-file backups (restore + import invalidate this). */
  backups: ["backups"] as const,
};

/** Stable key fragment for a memory scope (so invalidation can target one doc). */
function scopeKey(scope: MemoryScope): string {
  return scope.kind === "global" ? "global" : `project:${scope.path}`;
}

/* ------------------------------------------------------------------------- *
 * Demo seed — shown ONLY when not under Tauri. Every label is fictional sample data
 * so it can never be mistaken for a real captured account/provider.
 * ------------------------------------------------------------------------- */
const DEMO_ACCOUNTS: AccountMeta[] = [
  {
    id: "demo-personal",
    label: "Ka-ho Chan",
    email: "kaho.chan@gmail.com",
    tier: "Max 20×",
    lastUsed: null,
  },
  {
    id: "demo-team",
    label: "Pierhead Studio",
    email: "kaho@pierhead.studio",
    tier: "Max 5×",
    lastUsed: null,
  },
];

const DEMO_PROVIDERS: ProviderMeta[] = [
  {
    id: "demo-zai",
    label: "Z.ai",
    baseUrl: "https://api.z.ai/api/anthropic",
    model: "glm-4.6",
  },
  {
    id: "demo-kimi",
    label: "Kimi K2",
    baseUrl: "https://api.moonshot.cn/anthropic",
    model: "kimi-k2-turbo",
  },
];

/**
 * A labelled demo provider view for off-Tauri rendering (the gallery / plain
 * browser). Seeded from the matching {@link DEMO_PROVIDERS} entry when the id is
 * known, else an empty draft. `hasToken` is always false — there is no vault here.
 */
function demoProviderView(id: string): ProviderConfigView {
  const seed = DEMO_PROVIDERS.find((p) => p.id === id);
  return {
    id: id || "demo-new",
    title: seed?.label ?? "New provider",
    brand: "anthropic",
    env: {
      baseUrl: seed?.baseUrl ?? "",
      model: seed?.model ?? "",
      defaultSonnet: "",
      defaultHaiku: "",
      maxThinkingTokens: null,
      maxOutputTokens: null,
      httpsProxy: null,
      disableTelemetry: null,
    },
    config: {
      cleanupPeriodDays: null,
      includeCoAuthoredBy: null,
      outputStyle: null,
      forceLoginMethod: null,
      forceLoginOrgUuid: null,
      enableAllProjectMcpServers: null,
      enabledMcpServers: null,
    },
    hasToken: false,
  };
}

const DEMO_ACTIVE_IDENTITY: ActiveIdentity = {
  kind: "account",
  label: "Ka-ho Chan",
  email: "kaho.chan@gmail.com",
  org: "Pierhead Studio",
  tier: "Max 20×",
  model: "claude-opus-4-8",
  expiresAt: null,
};

const DEMO_ENV_OVERRIDES: EnvOverrides = {
  oauthTokenSet: false,
  anthropicVars: [],
  configDirOverride: null,
};

const DEMO_SETTINGS_SUMMARY: SettingsSummary = {
  model: "claude-opus-4-8",
  hasEnv: false,
  topLevelKeys: ["model", "permissions"],
};

/**
 * A clearly-LABELLED demo set of MCP servers for off-Tauri rendering (the gallery
 * / a plain browser). Every name is fictional sample data so it can never be mistaken
 * for a real `~/.claude.json` server. Covers stdio + http transports and an
 * enabled/disabled mix so the count + the disabled-dimming both render.
 */
const DEMO_MCP_SERVERS: McpServer[] = [
  {
    name: "context7",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
    env: null,
    url: null,
    scope: "user",
    enabled: true,
    toolsHint: "resolve-library-id, query-docs",
  },
  {
    name: "exa",
    transport: "http",
    command: null,
    args: null,
    env: null,
    url: "https://mcp.example.dev/exa",
    scope: "user",
    enabled: true,
    toolsHint: "web_search, web_fetch",
  },
  {
    name: "serena",
    transport: "stdio",
    command: "uvx",
    args: ["--from", "serena", "serena-mcp-server"],
    env: null,
    url: null,
    scope: "user",
    enabled: false,
    toolsHint: "find_symbol, rename_symbol",
  },
];

/**
 * Clearly-LABELLED demo markdown resources for off-Tauri rendering (the gallery /
 * a plain browser). Every name/description is fictional sample data so it can never be
 * mistaken for a real `~/.claude/{agents,commands,skills}` resource. Each kind
 * exercises its kind-specific fields (agent model badge, command leading `/` +
 * argument-hint, skill source badge + an enabled/disabled mix for the count).
 */
const DEMO_AGENTS: Resource[] = [
  {
    kind: "agent",
    name: "code-reviewer",
    description: "Reviews diffs for correctness and style.",
    bodyLines: 42,
    model: "sonnet",
    source: null,
    enabled: null,
    path: "~/.claude/agents/code-reviewer.md",
    argsHint: null,
    tools: "Read, Edit, Bash",
  },
  {
    kind: "agent",
    name: "doc-writer",
    description: "Drafts and updates documentation.",
    bodyLines: 27,
    model: "haiku",
    source: null,
    enabled: null,
    path: "~/.claude/agents/doc-writer.md",
    argsHint: null,
    tools: "Read, Edit",
  },
  {
    kind: "agent",
    name: "security-auditor",
    description: "Audits code for vulnerabilities.",
    bodyLines: 64,
    model: "opus",
    source: null,
    enabled: null,
    path: "~/.claude/agents/security-auditor.md",
    argsHint: null,
    tools: "Read, Grep",
  },
];

const DEMO_COMMANDS: Resource[] = [
  {
    kind: "command",
    name: "/demo-write-tests",
    description: "Generate tests for the target file.",
    bodyLines: 12,
    model: null,
    source: null,
    enabled: null,
    path: "~/.claude/commands/write-tests.md",
    argsHint: "[file]",
    tools: null,
  },
  {
    kind: "command",
    name: "/demo-review-pr",
    description: "Review the current pull request.",
    bodyLines: 20,
    model: null,
    source: null,
    enabled: null,
    path: "~/.claude/commands/review-pr.md",
    argsHint: "[pr]",
    tools: null,
  },
  {
    kind: "command",
    name: "/demo-changelog",
    description: "Summarize changes into a changelog.",
    bodyLines: 9,
    model: null,
    source: null,
    enabled: null,
    path: "~/.claude/commands/changelog.md",
    argsHint: null,
    tools: null,
  },
];

const DEMO_SKILLS: Resource[] = [
  {
    kind: "skill",
    name: "pdf-forms",
    description: "Fill and parse PDF forms.",
    bodyLines: 30,
    model: null,
    source: "Personal",
    enabled: true,
    path: "~/.claude/skills/pdf-forms/SKILL.md",
    argsHint: null,
    tools: null,
  },
  {
    kind: "skill",
    name: "design-review",
    description: "Review UI against the design tokens.",
    bodyLines: 24,
    model: null,
    source: "Project",
    enabled: true,
    path: "~/.claude/skills/design-review/SKILL.md",
    argsHint: null,
    tools: null,
  },
  {
    kind: "skill",
    name: "slack-digest",
    description: "Summarize Slack channels on demand.",
    bodyLines: 18,
    model: null,
    source: "Plugin",
    enabled: false,
    path: "~/.claude/skills/slack-digest/SKILL.md",
    argsHint: null,
    tools: null,
  },
];

/** The labelled demo set backing {@link useResources} for one kind. */
function demoResources(kind: ResourceKind): Resource[] {
  switch (kind) {
    case "agent":
      return DEMO_AGENTS;
    case "command":
      return DEMO_COMMANDS;
    case "skill":
      return DEMO_SKILLS;
  }
}

/**
 * A clearly-LABELLED sample global `CLAUDE.md` for off-Tauri rendering (the
 * gallery / a plain browser). The leading comment marks it fictional so it can never be
 * mistaken for a real `~/.claude/CLAUDE.md`.
 */
const DEMO_GLOBAL_MEMORY = `# User memory (CLAUDE.md)

<!-- This is labelled demo content shown only outside the cchive desktop app. -->

## Coding style
- Prefer the smallest change that solves the problem.
- Match the surrounding code; do not reformat untouched lines.

## Workflow
- Read the relevant files before editing.
- Run the tests after a change and report what passed.
`;

/**
 * A clearly-LABELLED sample project `CLAUDE.md` for off-Tauri rendering. Marked
 * a fictional heading so it cannot be mistaken for a real project memory file.
 */
const DEMO_PROJECT_MEMORY = `# Project memory (CLAUDE.md)

<!-- This is labelled demo content shown only outside the cchive desktop app. -->

## This project
- Frontend in \`src/\`, tests alongside the code they cover.
- Use the package scripts; do not invent new build commands.
`;

/**
 * Clearly-LABELLED demo projects for off-Tauri rendering (the gallery / a plain
 * browser). The \`/home/demo\` root + \`demo-\` folder names make them obviously not
 * real \`~/.claude.json\` entries. Mixes \`hasLocalSettings\` and \`lastActivity\` so
 * both display paths render.
 */
const DEMO_PROJECTS: Project[] = [
  {
    path: "/home/demo/code/demo-api-gateway",
    name: "demo-api-gateway",
    hasLocalSettings: true,
    lastActivity: 1_717_200_000_000,
  },
  {
    path: "/home/demo/code/demo-cchive",
    name: "demo-cchive",
    hasLocalSettings: true,
    lastActivity: 1_716_000_000_000,
  },
  {
    path: "/home/demo/code/demo-marketing-site",
    name: "demo-marketing-site",
    hasLocalSettings: false,
    lastActivity: null,
  },
];

/**
 * A clearly-LABELLED sample `.claude/settings.local.json` (pretty-printed raw
 * text) returned for demo projects that have local settings. The `_demo` marker
 * key makes it obvious this is not a real settings file.
 */
const DEMO_PROJECT_SETTINGS_RAW = `{
  "_demo": "labelled demo content — shown only outside the cchive desktop app",
  "permissions": {
    "allow": ["Bash(pnpm test:*)", "Read(./src/**)"],
    "deny": []
  }
}`;

/** The labelled demo `CLAUDE.md` backing {@link useMemory} for a scope. */
function demoMemory(scope: MemoryScope): MemoryDoc {
  if (scope.kind === "global") {
    return { path: "/home/demo/.claude/CLAUDE.md", content: DEMO_GLOBAL_MEMORY };
  }
  return { path: `${scope.path}/CLAUDE.md`, content: DEMO_PROJECT_MEMORY };
}

/** The labelled demo settings backing {@link useProjectSettings} for a path. */
function demoProjectSettings(path: string): ProjectSettings {
  const project = DEMO_PROJECTS.find((p) => p.path === path);
  return {
    path,
    raw: project?.hasLocalSettings ? DEMO_PROJECT_SETTINGS_RAW : "{}",
  };
}

/**
 * A clearly-LABELLED demo recent-activity feed for off-Tauri rendering (the
 * gallery / a plain browser). Every message is fictional sample data so it can never
 * be mistaken for a real append, and it exercises each `kind` icon. Newest-first,
 * with timestamps spread across the last couple of days for the relative-time
 * column. Labels only — no token.
 */
const DEMO_ACTIVITY: ActivityEntry[] = [
  {
    kind: "account",
    message: "Switched account to Pierhead Studio",
    timestamp: Date.now() - 4 * 60_000,
  },
  {
    kind: "provider",
    message: "Switched to Z.ai",
    timestamp: Date.now() - 38 * 60_000,
  },
  {
    kind: "mcp",
    message: "Enabled MCP server context7",
    timestamp: Date.now() - 3 * 3_600_000,
  },
  {
    kind: "skill",
    message: "Enabled skill pdf-forms",
    timestamp: Date.now() - 27 * 3_600_000,
  },
  {
    kind: "memory",
    message: "Updated memory global",
    timestamp: Date.now() - 50 * 3_600_000,
  },
];

/**
 * A demo notification-hook state for off-Tauri rendering (the gallery / a plain
 * browser). Mirrors the design defaults: Completion + General on, Tool-use off.
 */
const DEMO_NOTIFICATION_STATE: NotificationState = {
  completion: true,
  general: true,
  toolUse: false,
};

/**
 * A clearly-LABELLED demo set of Claude-file backups for off-Tauri rendering (the
 * gallery / a plain browser). Newest-first (matching the real `list` order) so the
 * Settings backups list renders its timestamp + size rows. Metadata only — a
 * backup holds file CONTENT on disk; nothing secret is ever in this seed.
 */
const DEMO_BACKUPS: BackupEntry[] = [
  {
    id: "settings.json.1717200000000.bak",
    original: "settings.json",
    timestamp: Date.now() - 6 * 60_000,
    size: 2_048,
  },
  {
    id: ".credentials.json.1717100000000.bak",
    original: ".credentials.json",
    timestamp: Date.now() - 3 * 3_600_000,
    size: 512,
  },
  {
    id: "settings.json.1716990000000.bak",
    original: "settings.json",
    timestamp: Date.now() - 28 * 3_600_000,
    size: 1_920,
  },
];

/** A labelled demo latency result for off-Tauri rendering (a healthy round-trip). */
const DEMO_LATENCY: LatencyResult = { ms: 128, ok: true, status: 200 };

/** Deterministic pseudo-random in `[0, 1)` so the demo series stays stable. */
function demoNoise(n: number): number {
  const x = Math.sin(n * 99.13 + 7.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Local `YYYY-MM-DD` for a date `back` days before `from`. */
function demoDay(from: Date, back: number): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - back);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * A clearly-LABELLED demo usage aggregate for off-Tauri rendering (the gallery /
 * a plain browser). Its model rows are fictional sample data so it can never be
 * mistaken for real parsed usage. Shaped exactly like the Rust `UsageSummary`.
 */
function demoUsageSummary(rangeDays: number): UsageSummary {
  const today = new Date();

  const perDay: DayPoint[] = [];
  for (let back = rangeDays - 1; back >= 0; back--) {
    const wave = (Math.sin(back * 1.3) + 1) / 2;
    const output = Math.round(220_000 + wave * 1_700_000);
    perDay.push({
      date: demoDay(today, back),
      output,
      input: output * 11,
      cacheRead: output * 42,
    });
  }

  // A trailing-year contribution grid (53 weeks × 7 days), oldest → newest.
  const heatmap: HeatCell[] = [];
  const span = 53 * 7;
  for (let back = span - 1; back >= 0; back--) {
    const r = demoNoise(back);
    const level = r < 0.34 ? 0 : r < 0.56 ? 1 : r < 0.76 ? 2 : r < 0.91 ? 3 : 4;
    heatmap.push({
      date: demoDay(today, back),
      tokens: level === 0 ? 0 : level * 210_000 + Math.round(r * 90_000),
      level,
    });
  }

  const totals = perDay.reduce(
    (acc, p) => ({
      input: acc.input + p.input,
      output: acc.output + p.output,
      cacheCreation: acc.cacheCreation + Math.round(p.output * 1.5),
      cacheRead: acc.cacheRead + p.cacheRead,
    }),
    { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
  );

  const grand =
    totals.input + totals.output + totals.cacheCreation + totals.cacheRead;

  const estCostUsd =
    Math.round(
      (totals.input * 3e-6 +
        totals.output * 1.5e-5 +
        totals.cacheRead * 3e-7) *
        100,
    ) / 100;

  return {
    rangeDays,
    totals,
    estCostUsd,
    unknownModels: [],
    perDay,
    perModel: [
      { model: "claude-opus-4-8", tokens: Math.round(grand * 0.6) },
      { model: "claude-sonnet-4-5", tokens: Math.round(grand * 0.24) },
      { model: "claude-fable-5", tokens: Math.round(grand * 0.11) },
      { model: "claude-haiku-4-5", tokens: Math.round(grand * 0.05) },
    ],
    heatmap,
  };
}

/** Compact token label for the status bar, e.g. `246.1K` / `84.2M`. */
function formatTokensCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Message surfaced when a mutation is attempted outside the desktop app. */
export const DESKTOP_ONLY_MESSAGE =
  "This action is available in the cchive desktop app only.";

/* ------------------------------------------------------------------------- *
 * Boundary helpers.
 * ------------------------------------------------------------------------- */

/** Extract the human message from a `CoreError` (`{ code, message }`) or Error. */
function coreErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
}

/** Query fetcher: demo seed off-Tauri, else the IPC call (errors normalised). */
async function runQuery<T>(demo: T, call: () => Promise<T>): Promise<T> {
  if (!isTauri()) return demo;
  try {
    return await call();
  } catch (error) {
    throw new Error(coreErrorMessage(error));
  }
}

/** Mutation runner: reject with the desktop-only message off-Tauri, else call. */
async function runMutation<T>(call: () => Promise<T>): Promise<T> {
  if (!isTauri()) throw new Error(DESKTOP_ONLY_MESSAGE);
  try {
    return await call();
  } catch (error) {
    throw new Error(coreErrorMessage(error));
  }
}

/**
 * Best-effort activity append for the mutation success handlers: record a
 * label-only `{ kind, message }` entry, then refresh the feed. The mutation has
 * already succeeded, so this never rejects — a logging failure is swallowed and
 * must not surface as an error. Off-Tauri (no backend) it silently no-ops.
 */
function recordActivity(
  qc: QueryClient,
  kind: string,
  message: string,
): void {
  if (!isTauri()) return;
  void ipc
    .appendActivity(kind, message)
    .then(() => qc.invalidateQueries({ queryKey: queryKeys.activity }))
    .catch(() => {
      /* best-effort: the mutation already succeeded; swallow the append error */
    });
}

/* ------------------------------------------------------------------------- *
 * Queries.
 * ------------------------------------------------------------------------- */

/** Saved accounts (non-secret metadata only). */
export function useAccounts(): UseQueryResult<AccountMeta[], Error> {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => runQuery(DEMO_ACCOUNTS, ipc.listAccounts),
  });
}

/** Configured API-provider presets (non-secret metadata only). */
export function useProviders(): UseQueryResult<ProviderMeta[], Error> {
  return useQuery({
    queryKey: queryKeys.providers,
    queryFn: () => runQuery(DEMO_PROVIDERS, ipc.listProviders),
  });
}

/**
 * One provider's full editor view (payload + `hasToken`, never the token value).
 * Disabled when `id` is null (a brand-new draft has no row to load yet).
 */
export function useProvider(
  id: string | null,
): UseQueryResult<ProviderConfigView, Error> {
  return useQuery({
    queryKey: queryKeys.provider(id ?? ""),
    queryFn: () =>
      runQuery(demoProviderView(id ?? ""), () => ipc.getProvider(id as string)),
    enabled: id != null,
  });
}

/**
 * Who the active session currently is. As a side effect it hydrates the shell
 * store's thin `activeIdentity` cache so the Sidebar card + StatusBar paint
 * instantly without each reading the query.
 */
export function useActiveIdentity(): UseQueryResult<ActiveIdentity, Error> {
  const setActiveIdentity = useShellStore((s) => s.setActiveIdentity);
  const query = useQuery({
    queryKey: queryKeys.activeIdentity,
    queryFn: () => runQuery(DEMO_ACTIVE_IDENTITY, ipc.getActiveIdentity),
  });

  const data = query.data;
  useEffect(() => {
    if (!data) return;
    const kind =
      data.kind === "account" || data.kind === "provider" ? data.kind : "none";
    setActiveIdentity({
      kind,
      label: data.label,
      email: data.email,
      tier: data.tier,
      model: data.model,
    });
  }, [data, setActiveIdentity]);

  return query;
}

/**
 * Is `account` the live active session? Match on email, else display label.
 * The single source of truth shared by the Configurations account list and
 * {@link useActiveAccountCapture} (no duplicated email logic).
 */
export function accountIsActive(
  account: AccountMeta,
  identity: ActiveIdentity | undefined,
): boolean {
  if (!identity || identity.kind !== "account") return false;
  if (account.email && identity.email) return account.email === identity.email;
  return identity.label === account.label;
}

/**
 * Whether the live active account is not yet captured in the vault — the signal
 * the first-run capture prompts (the Configurations empty-state / uncaptured
 * banner and the Overview tile nudge) hang off. `needsCapture` is true only once
 * both queries have settled AND the active identity is an account that
 * {@link accountIsActive} matches against no saved account; it stays false while
 * either query loads and for provider/none identities, so no prompt flashes
 * before the data is known. `email` is the active identity's email (the concrete
 * name the prompts show), or null when there is none / nothing is loaded yet.
 */
export function useActiveAccountCapture(): {
  needsCapture: boolean;
  email: string | null;
} {
  const accounts = useAccounts();
  const identity = useActiveIdentity();

  const id = identity.data;
  const list = accounts.data;
  if (accounts.isLoading || identity.isLoading || !id || !list) {
    return { needsCapture: false, email: null };
  }
  if (id.kind !== "account") {
    return { needsCapture: false, email: id.email ?? null };
  }
  return {
    needsCapture: !list.some((account) => accountIsActive(account, id)),
    email: id.email ?? null,
  };
}

/** Auth-relevant env vars that override what cchive writes. */
export function useEnvOverrides(): UseQueryResult<EnvOverrides, Error> {
  return useQuery({
    queryKey: queryKeys.envOverrides,
    queryFn: () => runQuery(DEMO_ENV_OVERRIDES, ipc.detectEnvOverrides),
  });
}

/** Non-secret summary of `settings.json`. */
export function useSettingsSummary(): UseQueryResult<SettingsSummary, Error> {
  return useQuery({
    queryKey: queryKeys.settingsSummary,
    queryFn: () => runQuery(DEMO_SETTINGS_SUMMARY, ipc.readSettingsSummary),
  });
}

/**
 * The usage aggregate for a `rangeDays` window (30 or 7). The returned
 * `refetch` re-parses the session logs on demand (the Usage screen's refresh
 * button). Off-Tauri it resolves to a labelled demo summary so the gallery
 * renders.
 *
 * As a side effect it hydrates the shell store's `tokensToday` from today's
 * output tokens (the newest `perDay` entry) so the StatusBar shows the real
 * value instead of the `0` placeholder.
 */
export function useUsage(rangeDays: number): UseQueryResult<UsageSummary, Error> {
  const setActiveIdentity = useShellStore((s) => s.setActiveIdentity);
  const query = useQuery({
    queryKey: queryKeys.usage(rangeDays),
    queryFn: () =>
      runQuery(demoUsageSummary(rangeDays), () => ipc.readUsage(rangeDays)),
  });

  const data = query.data;
  useEffect(() => {
    if (!data) return;
    const today = data.perDay[data.perDay.length - 1];
    setActiveIdentity({ tokensToday: formatTokensCompact(today?.output ?? 0) });
  }, [data, setActiveIdentity]);

  return query;
}

/**
 * Global MCP servers (enabled from `~/.claude.json` + disabled from the stash).
 * Off-Tauri it resolves to a labelled demo set so the gallery renders.
 *
 * As a side effect it hydrates the shell store's `mcpEnabledCount` (the number of
 * enabled servers) so the StatusBar shows the real MCP count instead of the `0`
 * placeholder.
 */
export function useMcpServers(): UseQueryResult<McpServer[], Error> {
  const setActiveIdentity = useShellStore((s) => s.setActiveIdentity);
  const query = useQuery({
    queryKey: queryKeys.mcpServers,
    queryFn: () => runQuery(DEMO_MCP_SERVERS, ipc.listMcpServers),
  });

  const data = query.data;
  useEffect(() => {
    if (!data) return;
    const enabled = data.reduce((n, s) => n + (s.enabled ? 1 : 0), 0);
    setActiveIdentity({ mcpEnabledCount: enabled });
  }, [data, setActiveIdentity]);

  return query;
}

/**
 * Markdown resources of one `kind` (agents, commands, or skills). Off-Tauri it
 * resolves to a labelled demo set per kind so the gallery renders.
 *
 * As a side effect, for `kind === "skill"` it hydrates the shell store's
 * `skillsEnabledCount` (the number of enabled skills) so the StatusBar shows the
 * real Skills count instead of the `0` placeholder.
 */
export function useResources(
  kind: ResourceKind,
): UseQueryResult<Resource[], Error> {
  const setActiveIdentity = useShellStore((s) => s.setActiveIdentity);
  const query = useQuery({
    queryKey: queryKeys.resources(kind),
    queryFn: () => runQuery(demoResources(kind), () => ipc.listResources(kind)),
  });

  const data = query.data;
  useEffect(() => {
    if (kind !== "skill" || !data) return;
    const enabled = data.reduce((n, r) => n + (r.enabled ? 1 : 0), 0);
    setActiveIdentity({ skillsEnabledCount: enabled });
  }, [kind, data, setActiveIdentity]);

  return query;
}

/**
 * The `CLAUDE.md` for `scope` (global user memory or a project's), `{ path,
 * content }` with `content` empty when the file is absent. Off-Tauri it resolves
 * to a labelled demo doc so the gallery renders.
 */
export function useMemory(scope: MemoryScope): UseQueryResult<MemoryDoc, Error> {
  return useQuery({
    queryKey: queryKeys.memory(scope),
    queryFn: () => runQuery(demoMemory(scope), () => ipc.readMemory(scope)),
  });
}

/** The projects discovered from `~/.claude.json` (labelled demo set off-Tauri). */
export function useProjects(): UseQueryResult<Project[], Error> {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => runQuery(DEMO_PROJECTS, ipc.listProjects),
  });
}

/**
 * One project's `.claude/settings.local.json` raw text (`"{}"` when absent).
 * Disabled when `path` is null (no project selected yet). Off-Tauri it resolves to
 * a labelled demo settings doc so the gallery renders.
 */
export function useProjectSettings(
  path: string | null,
): UseQueryResult<ProjectSettings, Error> {
  return useQuery({
    queryKey: queryKeys.projectSettings(path ?? ""),
    queryFn: () =>
      runQuery(demoProjectSettings(path ?? ""), () =>
        ipc.readProjectSettings(path as string),
      ),
    enabled: path != null,
  });
}

/**
 * The capped recent-activity feed, newest-first up to `limit`. The mutation
 * success handlers append to it via {@link recordActivity}. Off-Tauri it resolves
 * to a labelled demo set (sliced to `limit`) so the gallery renders.
 */
export function useActivity(
  limit: number,
): UseQueryResult<ActivityEntry[], Error> {
  return useQuery({
    queryKey: queryKeys.activity,
    queryFn: () =>
      runQuery(DEMO_ACTIVITY.slice(0, limit), () => ipc.readActivity(limit)),
  });
}

/**
 * The installed notification-hook state (which cchive-marked hooks live in
 * `~/.claude/settings.json`). Off-Tauri it resolves to a demo state so the
 * gallery renders.
 */
export function useNotifications(): UseQueryResult<NotificationState, Error> {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () =>
      runQuery(DEMO_NOTIFICATION_STATE, ipc.readNotificationState),
  });
}

/**
 * Whether cchive is registered to launch at login (the OS autostart entry).
 * Off-Tauri (no OS integration) it resolves to `false` so the toggle renders off.
 */
export function useAutostart(): UseQueryResult<boolean, Error> {
  return useQuery({
    queryKey: queryKeys.autostart,
    queryFn: () => runQuery(false, ipc.getAutostart),
  });
}

/**
 * The rotating Claude-file backups, newest-first (timestamp + size + name).
 * Off-Tauri it resolves to a labelled demo set so the gallery renders; a restore
 * or an import invalidates this so the list refreshes.
 */
export function useBackups(): UseQueryResult<BackupEntry[], Error> {
  return useQuery({
    queryKey: queryKeys.backups,
    queryFn: () => runQuery(DEMO_BACKUPS, ipc.listBackups),
  });
}

/* ------------------------------------------------------------------------- *
 * Mutations. Each invalidates the queries it can change, on success.
 * ------------------------------------------------------------------------- */

/** Switch the active subscription account to `id`. */
export function useSwitchAccount(): UseMutationResult<
  SwitchResult,
  Error,
  string
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runMutation(() => ipc.switchAccount(id)),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts });
      void qc.invalidateQueries({ queryKey: queryKeys.activeIdentity });
      void qc.invalidateQueries({ queryKey: queryKeys.settingsSummary });
      recordActivity(
        qc,
        "account",
        `Switched account to ${result.identity.label}`,
      );
    },
  });
}

/** Input for {@link useApplyProvider}: the preset + its secret-bearing env block. */
export interface ApplyProviderInput {
  meta: ProviderMeta;
  /** Input-only; may include the provider key. Never stored after submit. */
  env: Record<string, string>;
}

/** Activate a provider preset by merging its `env` block into `settings.json`. */
export function useApplyProvider(): UseMutationResult<
  void,
  Error,
  ApplyProviderInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ meta, env }: ApplyProviderInput) =>
      runMutation(() => ipc.applyProvider(meta, env)),
    onSuccess: (_data, { meta }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.providers });
      void qc.invalidateQueries({ queryKey: queryKeys.activeIdentity });
      void qc.invalidateQueries({ queryKey: queryKeys.settingsSummary });
      recordActivity(qc, "provider", `Switched to ${meta.label}`);
    },
  });
}

/**
 * Input for {@link useSaveProvider}: the upsert payload + an optional new token.
 * The `token` is the only secret-bearing value; it is passed straight to the
 * mutation, sent ONLY when the user (re)types it, and never stored in state or
 * the query cache. Omit it to leave the existing vaulted token untouched.
 */
export interface SaveProviderInput {
  input: ProviderConfigInput;
  token?: string;
}

/** Create or replace a provider (upsert); invalidates the list + that provider. */
export function useSaveProvider(): UseMutationResult<
  ProviderConfigView,
  Error,
  SaveProviderInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, token }: SaveProviderInput) =>
      runMutation(() => ipc.saveProvider(input, token)),
    onSuccess: (view) => {
      void qc.invalidateQueries({ queryKey: queryKeys.providers });
      void qc.invalidateQueries({ queryKey: queryKeys.provider(view.id) });
    },
  });
}

/** Delete a provider (index + vaulted token); invalidates the list + that provider. */
export function useDeleteProvider(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runMutation(() => ipc.deleteProvider(id)),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.providers });
      void qc.invalidateQueries({ queryKey: queryKeys.provider(id) });
    },
  });
}

/** Reset to the subscription by clearing ONLY the `env` block. */
export function useClearProvider(): UseMutationResult<void, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => runMutation(() => ipc.clearProvider()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.activeIdentity });
      void qc.invalidateQueries({ queryKey: queryKeys.settingsSummary });
    },
  });
}

/** Capture the currently-logged-in account into the vault + account index. */
export function useAddCurrentAccount(): UseMutationResult<
  AccountMeta,
  Error,
  void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => runMutation(() => ipc.addAccountFromActive()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts });
      void qc.invalidateQueries({ queryKey: queryKeys.activeIdentity });
    },
  });
}

/** Forget a saved account (the live credential is untouched). */
export function useRemoveAccount(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runMutation(() => ipc.removeAccount(id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts });
      void qc.invalidateQueries({ queryKey: queryKeys.activeIdentity });
    },
  });
}

/**
 * Input for {@link useCreateProvider}: the preset fields plus the pasted key.
 * The `key` is passed straight to the mutation and never persisted in state.
 */
export interface CreateProviderInput {
  /** Stable id; derived from the label when omitted. */
  id?: string;
  label: string;
  baseUrl: string;
  model: string | null;
  key: string;
}

/** A url/label-safe slug, used when a provider id is not supplied. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "provider"
  );
}

/**
 * Create + activate a provider preset.
 *
 * NOTE: the S3 IPC surface has no dedicated "persist preset" command — the only
 * path that accepts a fresh `ProviderMeta` + secret is `apply_provider`, so
 * creating a preset currently means applying it (writing its `env` block). The
 * metadata index write is an S3 gap to close before the preset survives a
 * `list_providers` refresh.
 */
export function useCreateProvider(): UseMutationResult<
  void,
  Error,
  CreateProviderInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label, baseUrl, model, key }: CreateProviderInput) =>
      runMutation(() => {
        const meta: ProviderMeta = {
          id: id ?? slugify(label),
          label,
          baseUrl,
          model,
        };
        const env: Record<string, string> = {
          ANTHROPIC_BASE_URL: baseUrl,
          ANTHROPIC_AUTH_TOKEN: key,
        };
        if (model) env.ANTHROPIC_MODEL = model;
        return ipc.applyProvider(meta, env);
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.providers });
      void qc.invalidateQueries({ queryKey: queryKeys.activeIdentity });
      void qc.invalidateQueries({ queryKey: queryKeys.settingsSummary });
    },
  });
}

/**
 * Create or replace a global MCP server (upsert); invalidates the server list so
 * the collection + the StatusBar count both refresh.
 */
export function useSaveMcpServer(): UseMutationResult<
  McpServer,
  Error,
  McpServerInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: McpServerInput) =>
      runMutation(() => ipc.saveMcpServer(input)),
    onSuccess: (server) => {
      void qc.invalidateQueries({ queryKey: queryKeys.mcpServers });
      recordActivity(qc, "mcp", `Added MCP server ${server.name}`);
    },
  });
}

/** Delete a global MCP server by name; invalidates the server list. */
export function useDeleteMcpServer(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => runMutation(() => ipc.deleteMcpServer(name)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.mcpServers });
    },
  });
}

/** Input for {@link useToggleMcpServer}: the server name + the desired state. */
export interface ToggleMcpServerInput {
  name: string;
  on: boolean;
}

/**
 * Enable/disable a global MCP server (a stash round-trip that never loses the
 * definition); invalidates the server list so the count re-derives.
 */
export function useToggleMcpServer(): UseMutationResult<
  void,
  Error,
  ToggleMcpServerInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, on }: ToggleMcpServerInput) =>
      runMutation(() => ipc.setMcpEnabled(name, on)),
    onSuccess: (_data, { name, on }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.mcpServers });
      recordActivity(
        qc,
        "mcp",
        `${on ? "Enabled" : "Disabled"} MCP server ${name}`,
      );
    },
  });
}

/** Input for {@link useSaveResource}: the kind + name + raw `.md` text. */
export interface SaveResourceInput {
  kind: ResourceKind;
  name: string;
  /** Plain markdown the user edits as-is — never a credential. */
  raw: string;
}

/**
 * Create or replace a markdown resource (atomic write); invalidates that kind's
 * list so the collection refreshes.
 */
export function useSaveResource(): UseMutationResult<
  void,
  Error,
  SaveResourceInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, name, raw }: SaveResourceInput) =>
      runMutation(() => ipc.saveResource(kind, name, raw)),
    onSuccess: (_data, { kind }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.resources(kind) });
    },
  });
}

/** Input for {@link useDeleteResource}: the kind + name to remove. */
export interface DeleteResourceInput {
  kind: ResourceKind;
  name: string;
}

/** Delete a markdown resource; invalidates that kind's list. */
export function useDeleteResource(): UseMutationResult<
  void,
  Error,
  DeleteResourceInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, name }: DeleteResourceInput) =>
      runMutation(() => ipc.deleteResource(kind, name)),
    onSuccess: (_data, { kind }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.resources(kind) });
    },
  });
}

/** Input for {@link useSkillEnabled}: the skill name + the desired state. */
export interface SetSkillEnabledInput {
  name: string;
  on: boolean;
}

/**
 * Enable/disable a skill (a stash folder round-trip that never loses it);
 * invalidates the skills list so the collection + the StatusBar Skills count both
 * re-derive.
 */
export function useSkillEnabled(): UseMutationResult<
  void,
  Error,
  SetSkillEnabledInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, on }: SetSkillEnabledInput) =>
      runMutation(() => ipc.setSkillEnabled(name, on)),
    onSuccess: (_data, { name, on }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.resources("skill") });
      recordActivity(
        qc,
        "skill",
        `${on ? "Enabled" : "Disabled"} skill ${name}`,
      );
    },
  });
}

/** Input for {@link useSaveMemory}: the scope + the markdown to write. */
export interface SaveMemoryInput {
  scope: MemoryScope;
  /** Plain markdown the user edits as-is — never a credential. */
  content: string;
}

/**
 * Atomically write a scope's `CLAUDE.md` (create if absent); invalidates that
 * scope's memory query so the editor re-reads the persisted text.
 */
export function useSaveMemory(): UseMutationResult<void, Error, SaveMemoryInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scope, content }: SaveMemoryInput) =>
      runMutation(() => ipc.writeMemory(scope, content)),
    onSuccess: (_data, { scope }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.memory(scope) });
      const where = scope.kind === "global" ? "global" : scope.path;
      recordActivity(qc, "memory", `Updated memory ${where}`);
    },
  });
}

/** Input for {@link useSaveProjectSettings}: the project root + raw JSON text. */
export interface SaveProjectSettingsInput {
  path: string;
  /** The user's own `.claude/settings.local.json` text — never a credential. */
  raw: string;
}

/**
 * Validate + atomically write a project's `.claude/settings.local.json`;
 * invalidates that project's settings query and the projects list (writing can
 * flip `hasLocalSettings` from `false` to `true`).
 */
export function useSaveProjectSettings(): UseMutationResult<
  void,
  Error,
  SaveProjectSettingsInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, raw }: SaveProjectSettingsInput) =>
      runMutation(() => ipc.writeProjectSettings(path, raw)),
    onSuccess: (_data, { path }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.projectSettings(path) });
      void qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

/** Input for {@link useSetNotification}: the kind + the desired state. */
export interface SetNotificationInput {
  kind: NotificationKind;
  on: boolean;
}

/**
 * Install/remove the cchive-marked notification hook for `kind` (surgical edit
 * of `~/.claude/settings.json` `hooks`); invalidates the notification state so
 * the toggle re-derives from disk.
 */
export function useSetNotification(): UseMutationResult<
  void,
  Error,
  SetNotificationInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, on }: SetNotificationInput) =>
      runMutation(() => ipc.setNotification(kind, on)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
}

/**
 * Register/remove cchive's launch-at-login entry over the OS autostart plugin;
 * invalidates the autostart query so the toggle re-derives from the real
 * `is_enabled` state (no optimistic flip).
 */
export function useSetAutostart(): UseMutationResult<void, Error, boolean> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) => runMutation(() => ipc.setAutostart(on)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.autostart });
    },
  });
}

/**
 * Export the cchive setup to a JSON file the user picks via the native save
 * dialog. Resolves to the chosen path, or `null` when the dialog was cancelled (a
 * no-op). Off-Tauri it rejects with the desktop-only message so the caller toasts
 * it. The written document is secret-free (providers carry no key).
 */
export function useExportConfig(): UseMutationResult<string | null, Error, void> {
  return useMutation({
    mutationFn: () => runMutation(() => ipc.exportConfig()),
  });
}

/**
 * Import a cchive setup from a JSON file the user picks via the native open
 * dialog, merging it back KEYLESS. Resolves to the {@link ImportSummary} counts, or
 * `null` when cancelled. On a real (non-cancelled) import it invalidates the
 * providers + settings-summary + active-identity queries so the merged shells +
 * applied prefs surface. Off-Tauri it rejects with the desktop-only message.
 */
export function useImportConfig(): UseMutationResult<
  ImportSummary | null,
  Error,
  void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => runMutation(() => ipc.importConfig()),
    onSuccess: (summary) => {
      if (summary == null) return; // dialog cancelled — nothing changed
      void qc.invalidateQueries({ queryKey: queryKeys.providers });
      void qc.invalidateQueries({ queryKey: queryKeys.settingsSummary });
      void qc.invalidateQueries({ queryKey: queryKeys.activeIdentity });
      recordActivity(qc, "provider", "Imported configuration");
    },
  });
}

/**
 * Restore a backup `id` back to its original Claude file (the core snapshots the
 * current state first). Invalidates the backups list (the pre-restore snapshot is
 * a new entry) plus the settings-summary / active-identity / providers queries so
 * the restored content surfaces. Off-Tauri it rejects with the desktop-only message.
 */
export function useRestoreBackup(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runMutation(() => ipc.restoreBackup(id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.backups });
      void qc.invalidateQueries({ queryKey: queryKeys.settingsSummary });
      void qc.invalidateQueries({ queryKey: queryKeys.activeIdentity });
      void qc.invalidateQueries({ queryKey: queryKeys.providers });
    },
  });
}

/**
 * Probe a provider `baseUrl`'s round-trip latency (no auth header). Resolves to a
 * {@link LatencyResult} (timing + optional status). Off-Tauri it resolves to a
 * labelled demo value so the editor's action renders instead of rejecting.
 */
export function useTestLatency(): UseMutationResult<LatencyResult, Error, string> {
  return useMutation({
    mutationFn: (baseUrl: string) => {
      if (!isTauri()) return Promise.resolve(DEMO_LATENCY);
      return ipc.testLatency(baseUrl).catch((error: unknown) => {
        throw new Error(coreErrorMessage(error));
      });
    },
  });
}
