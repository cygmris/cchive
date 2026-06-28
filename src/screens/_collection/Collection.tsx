/**
 * Collection — the generic, domain-agnostic "library" surface shared by MCP,
 * Agents, Commands and Skills. It renders a sticky header (title + one-liner, a
 * "Search…" field bound to `query`, an icon-only Card/Table/Master-detail
 * view toggle, and a primary "Add X" button) above the selected body view,
 * filtering items by name/description. All domain specifics arrive through the
 * `config`; this component holds none. Generic over the item type `T`.
 */
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { LayoutGrid, PanelLeft, Plus, Table } from "@/ui/icons";

import { CardView } from "./CardView";
import { DetailView } from "./DetailView";
import { TableView } from "./TableView";
import type { CollectionConfig, CollectionView } from "./types";

export interface CollectionProps<T> {
  /** Screen title (e.g. "MCP"). */
  title: string;
  /** One-line description under the title. */
  description: string;
  /** The full (unfiltered) item list. */
  items: T[];
  /** The render contract that drives every view. */
  config: CollectionConfig<T>;
  /** Active body layout (controlled). */
  view: CollectionView;
  /** Called with the next layout when the view toggle changes. */
  onViewChange: (view: CollectionView) => void;
  /** Current search text (controlled). */
  query: string;
  /** Called with the next search text. */
  onQueryChange: (query: string) => void;
  /** Invoked by the primary "Add X" button. */
  onAdd?: () => void;
}

const VIEW_OPTIONS = [
  { value: "card" as const, icon: <LayoutGrid size={15} />, "aria-label": "Card view" },
  { value: "table" as const, icon: <Table size={15} />, "aria-label": "Table view" },
  {
    value: "detail" as const,
    icon: <PanelLeft size={15} />,
    "aria-label": "Master-detail view",
  },
];

export function Collection<T>({
  title,
  description,
  items,
  config,
  view,
  onViewChange,
  query,
  onQueryChange,
  onAdd,
}: CollectionProps<T>) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter(
        (item) =>
          config.name(item).toLowerCase().includes(q) ||
          config.description(item).toLowerCase().includes(q),
      )
    : items;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "auto" }}>
      {/* Sticky header: title/one-liner + search + view toggle + add. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          background: "var(--app-bg)",
          padding: "24px 28px 14px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 20,
              fontWeight: "var(--weight-semibold)",
              letterSpacing: "-0.015em",
              color: "var(--text)",
            }}
          >
            {title}
          </div>
          <div
            style={{
              marginTop: 3,
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              color: "var(--text-2)",
            }}
          >
            {description}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ width: 200 }}>
            <Input
              variant="search"
              placeholder="Search…"
              aria-label={`Search ${title}`}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
          </div>
          <SegmentedControl<CollectionView>
            aria-label="View mode"
            size="sm"
            options={VIEW_OPTIONS}
            value={view}
            onChange={onViewChange}
          />
          <Button icon={<Plus size={16} />} onClick={onAdd}>
            {config.addLabel}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "0 28px 28px" }}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: "48px 0",
              textAlign: "center",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              color: "var(--text-3)",
            }}
          >
            {q ? "No matches." : "Nothing here yet."}
          </div>
        ) : view === "card" ? (
          <CardView items={filtered} config={config} />
        ) : view === "table" ? (
          <TableView items={filtered} config={config} />
        ) : (
          <DetailView items={filtered} config={config} />
        )}
      </div>
    </div>
  );
}
