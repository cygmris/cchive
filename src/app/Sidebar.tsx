/**
 * Sidebar — the 248px navigation rail.
 *
 * Top to bottom: the clay logo tile + "Clavis" wordmark + version pill; a
 * full-width "Search…" launcher (opens the command palette, ⌘K hint); the three
 * nav groups from `router.NAV` (uppercase eyebrows on Customize / System) with
 * the active item lit by an accent tint + 2.5px inset clay bar + accent icon +
 * 600 weight; and a footer holding the active-config switcher card, a light/dark
 * theme toggle and the version. Nav is driven entirely by `NAV` and the store —
 * no hardcoded screen list. Token-only styling.
 */
import { LogoTile } from "@/ui/Logo";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { Moon, Search, Sun } from "@/ui/icons";
import { cn } from "@/lib/cn";
import { NAV } from "@/app/router";
import type { NavGroup, Screen } from "@/lib/shell-types";
import type { Theme } from "@/lib/types";
import { useShellStore } from "@/lib/store";
import { useTheme } from "@/theme/ThemeProvider";
import { AccountSwitcher } from "@/app/AccountSwitcher";

/** The nav groups in render order; Main has no eyebrow label. */
const GROUPS: { group: NavGroup; label?: string }[] = [
  { group: "main" },
  { group: "customize", label: "Customize" },
  { group: "system", label: "System" },
];

/** True when `screen` is the active nav target (Configurations owns Editor). */
function isActive(screen: Screen, activeScreen: Screen): boolean {
  if (screen === activeScreen) return true;
  return screen === "configs" && activeScreen === "editor";
}

export function Sidebar() {
  const activeScreen = useShellStore((s) => s.activeScreen);
  const go = useShellStore((s) => s.go);
  const openPalette = useShellStore((s) => s.openPalette);
  const { theme, setTheme } = useTheme();

  return (
    <aside
      style={{
        width: "var(--sidebar-w)",
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo + wordmark + version pill */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 18px 16px",
        }}
      >
        <LogoTile size={32} />
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--text)",
          }}
        >
          Clavis
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 500,
            color: "var(--text-3)",
            border: "1px solid var(--border)",
            padding: "2px 5px",
            borderRadius: "var(--radius-xs)",
          }}
        >
          1.0
        </span>
      </div>

      {/* Search / command-palette launcher */}
      <button
        type="button"
        onClick={openPalette}
        aria-label="Search — open command palette"
        className="hover:border-border-strong"
        style={{
          margin: "0 12px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 32,
          padding: "0 9px 0 10px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          cursor: "default",
          color: "var(--text-3)",
        }}
      >
        <Search size={15} color="var(--text-3)" aria-hidden />
        <span
          style={{
            flex: 1,
            textAlign: "left",
            fontFamily: "var(--font-sans)",
            fontSize: 12.5,
            fontWeight: 450,
          }}
        >
          Search…
        </span>
        <kbd
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-xs)",
            padding: "1px 5px",
          }}
        >
          ⌘K
        </kbd>
      </button>

      {/* Nav groups */}
      <nav
        aria-label="Primary"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 12px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {GROUPS.map(({ group, label }) => (
          <div
            key={group}
            style={{ display: "flex", flexDirection: "column", gap: 2 }}
          >
            {label && (
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  padding: "0 10px 6px",
                }}
              >
                {label}
              </div>
            )}
            {NAV.filter((item) => item.group === group).map((item) => {
              const active = isActive(item.screen, activeScreen);
              const Icon = item.icon;
              return (
                <button
                  key={item.screen}
                  type="button"
                  onClick={() => go(item.screen)}
                  aria-current={active ? "page" : undefined}
                  className={cn(!active && "hover:bg-hover")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "0 10px",
                    height: "var(--nav-item-h)",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    cursor: "default",
                    textAlign: "left",
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--fs-nav)",
                    fontWeight: active ? 600 : 500,
                    background: active ? "var(--accent-tint)" : undefined,
                    color: active ? "var(--text)" : "var(--text-2)",
                    boxShadow: active
                      ? "inset 2.5px 0 0 var(--accent)"
                      : undefined,
                  }}
                >
                  <Icon
                    size={17}
                    active={active}
                    color="var(--text-3)"
                    aria-hidden
                  />
                  <span style={{ flex: 1 }}>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer: switcher card + theme toggle + version */}
      <div
        style={{
          padding: "10px 14px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <AccountSwitcher />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <SegmentedControl<Theme>
            size="sm"
            className="flex-1"
            aria-label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              {
                value: "light",
                icon: <Sun size={14} aria-hidden />,
                "aria-label": "Light",
              },
              {
                value: "dark",
                icon: <Moon size={14} aria-hidden />,
                "aria-label": "Dark",
              },
            ]}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 450,
              color: "var(--text-3)",
              whiteSpace: "nowrap",
            }}
          >
            v1.0.0
          </span>
        </div>
      </div>
    </aside>
  );
}
