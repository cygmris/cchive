/**
 * DetailView — the Collection's master-detail body: a selectable left list of
 * items and a right pane describing the selected one (glyph, name, tag, optional
 * Switch, description, a key/value properties table, and a read-only mono
 * preview). Selection is local state, clamped as the filtered list changes.
 * Generic over `T`; left rows are real buttons, so keyboard selection is free.
 */
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { Switch } from "@/ui/Switch";
import type { CollectionViewProps } from "./types";

function IconChip({
  children,
  size,
}: {
  children: ReactNode;
  size: number;
}) {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: size >= 40 ? 10 : 7,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      {children}
    </span>
  );
}

export function DetailView<T>({ items, config }: CollectionViewProps<T>) {
  const [selected, setSelected] = useState(0);
  const safeIndex = Math.min(selected, Math.max(0, items.length - 1));
  const active = items[safeIndex];

  if (!active) return null;

  const activeName = config.name(active);
  const activeTag = config.tag?.(active);
  const activeToggle = config.toggle?.(active);
  const detail = config.detail(active);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        gap: 14,
        alignItems: "start",
      }}
    >
      {/* Left: selectable list */}
      <div
        role="listbox"
        aria-label="Items"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 6,
        }}
      >
        {items.map((item, index) => {
          const name = config.name(item);
          const isSel = index === safeIndex;
          return (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={isSel}
              onClick={() => setSelected(index)}
              className={cn(
                "flex w-full items-center gap-[10px] rounded-[9px] border-none px-[11px] py-[9px] text-left outline-none",
                "cursor-pointer transition-colors duration-150 ease-out",
                "focus-visible:shadow-[var(--ring-accent)]",
                !isSel && "bg-transparent hover:bg-hover",
              )}
              style={isSel ? { background: "var(--accent-tint)" } : undefined}
            >
              <IconChip size={28}>{config.icon(item)}</IconChip>
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12.5,
                    fontWeight: "var(--weight-semibold)",
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {name}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 11,
                    color: "var(--text-3)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {config.description(item)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Right: detail pane */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <IconChip size={40}>{config.icon(active)}</IconChip>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 16,
                  fontWeight: "var(--weight-semibold)",
                  color: "var(--text)",
                }}
              >
                {activeName}
              </span>
              {activeTag}
            </div>
          </div>
          {activeToggle && (
            <Switch
              checked={activeToggle.on}
              onChange={activeToggle.onChange}
              aria-label={`Toggle ${activeName}`}
            />
          )}
        </div>

        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            color: "var(--text-2)",
            lineHeight: 1.55,
            marginTop: 14,
          }}
        >
          {config.description(active)}
        </div>

        {/* Properties table */}
        <div
          style={{
            marginTop: 18,
            border: "1px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {detail.props.map((prop, i) => (
            <div
              key={prop.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: "9px 13px",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 11.5,
                  fontWeight: "var(--weight-medium)",
                  color: "var(--text-3)",
                }}
              >
                {prop.label}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--text)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  textAlign: "right",
                  minWidth: 0,
                }}
              >
                {prop.value}
              </span>
            </div>
          ))}
        </div>

        {/* Read-only preview */}
        <div
          style={{
            marginTop: 18,
            border: "1px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "9px 13px",
              background: "var(--surface-2)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: "var(--weight-medium)",
                color: "var(--text-2)",
              }}
            >
              {detail.preview.name}
            </span>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 10.5,
                color: "var(--text-3)",
              }}
            >
              read-only preview
            </span>
          </div>
          <pre
            style={{
              margin: 0,
              padding: "14px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              lineHeight: 1.65,
              color: "var(--text)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {detail.preview.body}
          </pre>
        </div>
      </div>
    </div>
  );
}
