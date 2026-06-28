/**
 * Screen → component map.
 *
 * Every `Screen` (including `editor`) resolves to a component here, so the
 * Window shell only ever does `getScreen(activeScreen)` — wiring a real screen
 * later means swapping one import, never touching the shell. The screens are
 * S2 placeholders (shared header + "coming soon" body); later specs fill in the
 * bodies without changing this map.
 */
import type { ComponentType } from "react";
import type { Screen } from "@/lib/shell-types";
import { OverviewScreen } from "@/screens/overview";
import { ConfigurationsScreen } from "@/screens/configurations";
import { ConfigEditorScreen } from "@/screens/config-editor";
import { ProjectsScreen } from "@/screens/projects";
import { McpScreen } from "@/screens/mcp";
import { AgentsScreen } from "@/screens/agents";
import { CommandsScreen } from "@/screens/commands";
import { SkillsScreen } from "@/screens/skills";
import { MemoryScreen } from "@/screens/memory";
import { UsageScreen } from "@/screens/usage";
import { NotificationsScreen } from "@/screens/notifications";
import { ExperimentalScreen } from "@/screens/experimental";
import { SettingsScreen } from "@/screens/settings";

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
