/**
 * SectionNav — the Config Editor's sticky left section list.
 *
 * "All settings" plus the five schema sections (Common / General / Auth & Login /
 * MCP / Environment). The active item gets the accent-tint wash + accent ink +
 * 600 weight (the same active treatment as the sidebar nav); the rest pick up the
 * neutral hover wash. Selecting an item scopes the field area to that section
 * (the editor still applies the search filter on top). Token-only styling.
 */
import { SECTIONS, type SectionId } from "./schema";

/** A nav key: a real section id or the "all" pseudo-section. */
export type SectionKey = SectionId | "all";

export interface SectionNavProps {
  /** The currently-selected section (or "all"). */
  active: SectionKey;
  /** Select a section (or "all"). */
  onSelect: (key: SectionKey) => void;
}

const ITEMS: readonly { key: SectionKey; label: string }[] = [
  { key: "all", label: "All settings" },
  ...SECTIONS.map((s) => ({ key: s.id as SectionKey, label: s.label })),
];

export function SectionNav({ active, onSelect }: SectionNavProps) {
  return (
    <nav
      aria-label="Settings sections"
      style={{
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        width: 184,
        flexShrink: 0,
      }}
    >
      {ITEMS.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            aria-current={isActive || undefined}
            onClick={() => onSelect(item.key)}
            className={isActive ? undefined : "hover:bg-hover"}
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              padding: "7px 10px",
              border: "none",
              borderRadius: "var(--radius-md)",
              background: isActive ? "var(--accent-tint)" : "transparent",
              color: isActive ? "var(--accent)" : "var(--text-2)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-nav)",
              fontWeight: isActive
                ? "var(--weight-semibold)"
                : "var(--weight-medium)",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
