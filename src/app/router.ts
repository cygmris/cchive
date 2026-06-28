/**
 * Typed navigation metadata for the sidebar.
 *
 * `NAV` is the ordered list of the 12 sidebar destinations grouped into
 * main / customize / system. `editor` (the Config Editor) is intentionally
 * absent — it is reached from actions, not the nav. The sidebar renders from
 * `NAV` alone, so adding a destination is a one-line change here.
 */
import {
  Activity,
  Bell,
  Beaker,
  BarChart,
  Book,
  Bot,
  Folder,
  Key,
  Server,
  Settings,
  Sparkles,
  Terminal,
  type IconComponent,
} from "@/ui/icons";
import { SCREENS, type NavGroup, type Screen } from "@/lib/shell-types";

/** One sidebar nav destination. */
export interface NavItem {
  screen: Screen;
  label: string;
  icon: IconComponent;
  group: NavGroup;
}

/** The 12 sidebar destinations, in render order, grouped. `editor` is excluded. */
export const NAV: NavItem[] = [
  { screen: "overview", label: "Overview", icon: Activity, group: "main" },
  { screen: "configs", label: "Configurations", icon: Key, group: "main" },
  { screen: "projects", label: "Projects", icon: Folder, group: "main" },

  { screen: "mcp", label: "MCP", icon: Server, group: "customize" },
  { screen: "agents", label: "Agents", icon: Bot, group: "customize" },
  { screen: "commands", label: "Commands", icon: Terminal, group: "customize" },
  { screen: "skills", label: "Skills", icon: Sparkles, group: "customize" },
  { screen: "memory", label: "Memory", icon: Book, group: "customize" },

  { screen: "usage", label: "Usage", icon: BarChart, group: "system" },
  { screen: "notifications", label: "Notifications", icon: Bell, group: "system" },
  { screen: "experimental", label: "Experimental", icon: Beaker, group: "system" },
  { screen: "settings", label: "Settings", icon: Settings, group: "system" },
];

/** The screen the shell mounts on first load. */
export const defaultScreen: Screen = "overview";

/** Type guard: is `x` one of the known screen keys? */
export function isScreen(x: unknown): x is Screen {
  return typeof x === "string" && (SCREENS as readonly string[]).includes(x);
}
