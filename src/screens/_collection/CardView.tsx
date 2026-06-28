/**
 * CardView — the Collection's default body: a 2-column grid of flat surface
 * cards. Each card shows the item glyph + name, an optional top-right Switch
 * (when the config defines a `toggle`), the description, and a footer divider
 * carrying optional meta (left) + tag (right). Cards whose toggle is off render
 * dimmed. Purely presentational and generic over `T`.
 */
import { Switch } from "@/ui/Switch";
import type { CollectionViewProps } from "./types";

export function CardView<T>({ items, config }: CollectionViewProps<T>) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
      }}
    >
      {items.map((item) => {
        const name = config.name(item);
        const toggle = config.toggle?.(item);
        const dim = toggle != null && !toggle.on;
        const tag = config.tag?.(item);
        const meta = config.meta?.(item);

        return (
          <div
            key={name}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 18,
              opacity: dim ? 0.6 : 1,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {config.icon(item)}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 14,
                    fontWeight: "var(--weight-semibold)",
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {name}
                </span>
              </div>
              {toggle && (
                <Switch
                  checked={toggle.on}
                  onChange={toggle.onChange}
                  aria-label={`Toggle ${name}`}
                />
              )}
            </div>

            <div
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 12.5,
                color: "var(--text-2)",
                lineHeight: 1.5,
                minHeight: 38,
              }}
            >
              {config.description(item)}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-3)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {meta}
              </span>
              {tag}
            </div>
          </div>
        );
      })}
    </div>
  );
}
