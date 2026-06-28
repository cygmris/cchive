/**
 * TableView — the Collection's dense body: a real `<table>` whose columns come
 * straight from `config.columns` (each a header label + a cell renderer). The
 * header row is uppercase mono on a `--surface-2` well; when the config defines
 * a `toggle`, a trailing right-aligned Switch column is appended. Generic over
 * `T`; all cell content/styling is supplied by the column renderers.
 */
import { Switch } from "@/ui/Switch";
import type { CollectionViewProps } from "./types";

const CELL_PADDING = "11px 16px";

export function TableView<T>({ items, config }: CollectionViewProps<T>) {
  const showToggle = config.toggle != null;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          tableLayout: "auto",
        }}
      >
        <thead>
          <tr style={{ background: "var(--surface-2)" }}>
            {config.columns.map((col) => (
              <th
                key={col.label}
                scope="col"
                style={{
                  textAlign: "left",
                  padding: CELL_PADDING,
                  fontFamily: "var(--font-sans)",
                  fontSize: 10,
                  fontWeight: "var(--weight-semibold)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  whiteSpace: "nowrap",
                }}
              >
                {col.label}
              </th>
            ))}
            {showToggle && (
              <th
                scope="col"
                aria-label="Enabled"
                style={{ padding: CELL_PADDING, width: 56 }}
              />
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const name = config.name(item);
            const toggle = config.toggle?.(item);
            return (
              <tr key={name} style={{ borderTop: "1px solid var(--border)" }}>
                {config.columns.map((col) => (
                  <td
                    key={col.label}
                    style={{ padding: CELL_PADDING, verticalAlign: "middle" }}
                  >
                    {col.render(item)}
                  </td>
                ))}
                {showToggle && (
                  <td style={{ padding: CELL_PADDING, verticalAlign: "middle" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      {toggle && (
                        <Switch
                          checked={toggle.on}
                          onChange={toggle.onChange}
                          aria-label={`Toggle ${name}`}
                        />
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
