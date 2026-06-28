/**
 * Clavis icon set — curated Lucide line icons, tuned to the house style.
 *
 * Every export is a thin wrapper that defaults to the Clavis stroke weight
 * (1.7) on Lucide's 24px grid and paints in `currentColor`, so an icon inherits
 * the text/`--text-3` color of its row. Pass `active` to recolor the stroke to
 * `var(--accent)` (active nav items / rows). All native Lucide props
 * (`size`, `strokeWidth`, `color`, `className`, …) still pass through.
 */
import { forwardRef } from "react";
import {
  Activity as LuActivity,
  AlertTriangle as LuAlertTriangle,
  BarChart3 as LuBarChart3,
  Bell as LuBell,
  Bot as LuBot,
  BookOpen as LuBookOpen,
  Check as LuCheck,
  CircleAlert as LuCircleAlert,
  CircleCheck as LuCircleCheck,
  ChevronDown as LuChevronDown,
  ChevronLeft as LuChevronLeft,
  ChevronRight as LuChevronRight,
  ChevronUp as LuChevronUp,
  ChevronsUpDown as LuChevronsUpDown,
  Copy as LuCopy,
  Eye as LuEye,
  EyeOff as LuEyeOff,
  ExternalLink as LuExternalLink,
  Filter as LuFilter,
  FlaskConical as LuFlaskConical,
  Folder as LuFolder,
  Globe as LuGlobe,
  GripVertical as LuGripVertical,
  Info as LuInfo,
  Key as LuKey,
  LayoutGrid as LuLayoutGrid,
  Loader2 as LuLoader2,
  LogOut as LuLogOut,
  PanelLeft as LuPanelLeft,
  Moon as LuMoon,
  MoreHorizontal as LuMoreHorizontal,
  Pencil as LuPencil,
  Plus as LuPlus,
  Power as LuPower,
  RefreshCw as LuRefreshCw,
  Search as LuSearch,
  Server as LuServer,
  Settings as LuSettings,
  SlidersHorizontal as LuSlidersHorizontal,
  Sparkles as LuSparkles,
  Sun as LuSun,
  Table as LuTable,
  Terminal as LuTerminal,
  Trash2 as LuTrash2,
  User as LuUser,
  UserPlus as LuUserPlus,
  Wrench as LuWrench,
  X as LuX,
  Zap as LuZap,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

/** Clavis default stroke weight — Lucide's line language at ~1.7. */
export const DEFAULT_STROKE_WIDTH = 1.7;

export interface IconProps extends LucideProps {
  /** Recolor the stroke to `var(--accent)` for active rows / nav items. */
  active?: boolean;
}

export type IconComponent = React.ForwardRefExoticComponent<
  IconProps & React.RefAttributes<SVGSVGElement>
>;

/** Wrap a Lucide icon with the house stroke weight + the `active` accent variant. */
function tuned(Base: LucideIcon, name: string): IconComponent {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
    { active, color, strokeWidth, ...rest },
    ref,
  ) {
    return (
      <Base
        ref={ref}
        strokeWidth={strokeWidth ?? DEFAULT_STROKE_WIDTH}
        color={active ? "var(--accent)" : color}
        {...rest}
      />
    );
  });
  Icon.displayName = `Icon(${name})`;
  return Icon;
}

export const Search = tuned(LuSearch, "Search");
export const Settings = tuned(LuSettings, "Settings");
export const Plus = tuned(LuPlus, "Plus");
export const Check = tuned(LuCheck, "Check");
export const ChevronUp = tuned(LuChevronUp, "ChevronUp");
export const ChevronDown = tuned(LuChevronDown, "ChevronDown");
export const ChevronLeft = tuned(LuChevronLeft, "ChevronLeft");
export const ChevronRight = tuned(LuChevronRight, "ChevronRight");
export const ChevronsUpDown = tuned(LuChevronsUpDown, "ChevronsUpDown");
export const Sun = tuned(LuSun, "Sun");
export const Moon = tuned(LuMoon, "Moon");
export const Trash = tuned(LuTrash2, "Trash");
export const Pencil = tuned(LuPencil, "Pencil");
export const Server = tuned(LuServer, "Server");
export const Bot = tuned(LuBot, "Bot");
export const Terminal = tuned(LuTerminal, "Terminal");
export const Book = tuned(LuBookOpen, "Book");
export const BarChart = tuned(LuBarChart3, "BarChart");
export const Bell = tuned(LuBell, "Bell");
export const Beaker = tuned(LuFlaskConical, "Beaker");
export const Folder = tuned(LuFolder, "Folder");
export const X = tuned(LuX, "X");
export const ExternalLink = tuned(LuExternalLink, "ExternalLink");
export const LogOut = tuned(LuLogOut, "LogOut");
export const Refresh = tuned(LuRefreshCw, "Refresh");
export const Copy = tuned(LuCopy, "Copy");
export const Grip = tuned(LuGripVertical, "Grip");
export const Eye = tuned(LuEye, "Eye");
export const EyeOff = tuned(LuEyeOff, "EyeOff");
export const Loader = tuned(LuLoader2, "Loader");
export const More = tuned(LuMoreHorizontal, "More");
export const Info = tuned(LuInfo, "Info");
export const Warning = tuned(LuAlertTriangle, "Warning");
export const Danger = tuned(LuCircleAlert, "Danger");
export const Success = tuned(LuCircleCheck, "Success");
export const Activity = tuned(LuActivity, "Activity");
export const User = tuned(LuUser, "User");
export const UserPlus = tuned(LuUserPlus, "UserPlus");
export const Key = tuned(LuKey, "Key");
export const Globe = tuned(LuGlobe, "Globe");
export const Zap = tuned(LuZap, "Zap");
export const Filter = tuned(LuFilter, "Filter");
export const Tweaks = tuned(LuSlidersHorizontal, "Tweaks");
export const Tool = tuned(LuWrench, "Tool");
export const Power = tuned(LuPower, "Power");
export const Sparkles = tuned(LuSparkles, "Sparkles");
// Collection view-mode glyphs (Card / Table / Master-detail).
export const LayoutGrid = tuned(LuLayoutGrid, "LayoutGrid");
export const Table = tuned(LuTable, "Table");
export const PanelLeft = tuned(LuPanelLeft, "PanelLeft");
