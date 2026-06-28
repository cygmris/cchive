/**
 * Generic, domain-agnostic collection contract.
 *
 * A `Collection<T>` renders any list of items (MCP servers, agents, commands,
 * skills, …) in three views — Card / Table / Master-detail — driven entirely by
 * a per-collection {@link CollectionConfig}. The component holds **no** domain
 * knowledge: every label, glyph, badge, toggle and preview is supplied by the
 * config, so a single implementation serves every "library" screen.
 */
import type { ReactNode } from "react";

/** The three body layouts the header view-toggle switches between. */
export type CollectionView = "card" | "table" | "detail";

/** A Table column: a header label + a per-item cell renderer. */
export interface CollectionColumn<T> {
  /** Column header (rendered uppercase mono). */
  label: string;
  /** Cell content for a given item. */
  render: (item: T) => ReactNode;
}

/** An instant on/off control for an item (e.g. enable/disable a server). */
export interface CollectionToggle {
  /** Current state. */
  on: boolean;
  /** Called with the next state when the user flips the switch. */
  onChange: (next: boolean) => void;
}

/** One row of the Master-detail properties table. */
export interface CollectionDetailProperty {
  /** Property name (left, muted). */
  label: string;
  /** Property value (right, mono). */
  value: ReactNode;
}

/** A read-only, mono-rendered preview shown at the foot of the detail pane. */
export interface CollectionPreview {
  /** Filename-style label for the preview header (e.g. `.mcp.json`). */
  name: string;
  /** Verbatim body, rendered read-only in `--font-mono`. */
  body: string;
}

/** The Master-detail right-pane payload for a selected item. */
export interface CollectionDetail {
  /** Key/value properties table. */
  props: CollectionDetailProperty[];
  /** Read-only source/definition preview. */
  preview: CollectionPreview;
}

/**
 * The render contract a screen supplies to drive a {@link Collection}. Generic
 * over the item type `T`; nothing here is domain-specific.
 */
export interface CollectionConfig<T> {
  /** Leading glyph for an item (sits in the icon chip). */
  icon: (item: T) => ReactNode;
  /** Primary name (mono). Also matched by the search field. */
  name: (item: T) => string;
  /** One-line description. Also matched by the search field. */
  description: (item: T) => string;
  /** Optional trailing tag/badge (card footer, table cell, detail header). */
  tag?: (item: T) => ReactNode;
  /** Optional meta text (card footer left, e.g. "8 tools"). */
  meta?: (item: T) => ReactNode;
  /** Optional instant toggle; its presence adds a Switch and dims when off. */
  toggle?: (item: T) => CollectionToggle;
  /** Table columns (header label + cell renderer). */
  columns: CollectionColumn<T>[];
  /** Master-detail right pane: properties table + read-only preview. */
  detail: (item: T) => CollectionDetail;
  /** Label for the primary add button (e.g. "Add server"). */
  addLabel: string;
}

/** Props shared by the three view bodies (already-filtered items + config). */
export interface CollectionViewProps<T> {
  items: T[];
  config: CollectionConfig<T>;
}
