/**
 * Screen → component map.
 *
 * Every `Screen` (including `editor`) resolves to a component here, so the
 * Window shell only ever does `getScreen(activeScreen)` — never touching the
 * shell to add or change a screen. Every entry below is a real implementation,
 * loaded lazily (`React.lazy`) so each screen — and any heavy vendor it pulls
 * in — splits into its own chunk fetched on demand behind the Window's Suspense
 * fallback, keeping the entry bundle small.
 */
import { lazy } from "react";
import type { ComponentType } from "react";
import type { Screen } from "@/lib/shell-types";

const OverviewScreen = lazy(() =>
  import("@/screens/overview").then((m) => ({ default: m.OverviewScreen })),
);
const ConfigurationsScreen = lazy(() =>
  import("@/screens/configurations").then((m) => ({
    default: m.ConfigurationsScreen,
  })),
);
const ConfigEditorScreen = lazy(() =>
  import("@/screens/config-editor").then((m) => ({
    default: m.ConfigEditorScreen,
  })),
);
const ProjectsScreen = lazy(() =>
  import("@/screens/projects").then((m) => ({ default: m.ProjectsScreen })),
);
const McpScreen = lazy(() =>
  import("@/screens/mcp").then((m) => ({ default: m.McpScreen })),
);
const AgentsScreen = lazy(() =>
  import("@/screens/agents").then((m) => ({ default: m.AgentsScreen })),
);
const CommandsScreen = lazy(() =>
  import("@/screens/commands").then((m) => ({ default: m.CommandsScreen })),
);
const SkillsScreen = lazy(() =>
  import("@/screens/skills").then((m) => ({ default: m.SkillsScreen })),
);
const MemoryScreen = lazy(() =>
  import("@/screens/memory").then((m) => ({ default: m.MemoryScreen })),
);
const UsageScreen = lazy(() =>
  import("@/screens/usage").then((m) => ({ default: m.UsageScreen })),
);
const NotificationsScreen = lazy(() =>
  import("@/screens/notifications").then((m) => ({
    default: m.NotificationsScreen,
  })),
);
const ExperimentalScreen = lazy(() =>
  import("@/screens/experimental").then((m) => ({
    default: m.ExperimentalScreen,
  })),
);
const SettingsScreen = lazy(() =>
  import("@/screens/settings").then((m) => ({ default: m.SettingsScreen })),
);

/** The complete Screen → component registry. */
export const registry: Record<Screen, ComponentType> = {
  overview: OverviewScreen,
  configs: ConfigurationsScreen,
  editor: ConfigEditorScreen,
  projects: ProjectsScreen,
  mcp: McpScreen,
  agents: AgentsScreen,
  commands: CommandsScreen,
  skills: SkillsScreen,
  memory: MemoryScreen,
  usage: UsageScreen,
  notifications: NotificationsScreen,
  experimental: ExperimentalScreen,
  settings: SettingsScreen,
};

/** Resolve a screen's component, falling back to Overview for unknown keys. */
export function getScreen(screen: string): ComponentType {
  return registry[screen as Screen] ?? OverviewScreen;
}
