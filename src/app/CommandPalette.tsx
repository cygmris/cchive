/**
 * CommandPalette — the ⌘K palette hosted in `@/ui/Modal` (~540px, anchored
 * ~88px from the top of the viewport via `self-start mt-16` on the card).
 *
 * It flattens three groups of actions into one ordered list:
 *  - **Go to** — every router `NAV` destination (12 screens) → `go(screen)`.
 *  - **Account** — "Sign in with Claude" (opens the add-account modal).
 *  - **Theme** — toggle light/dark through `useTheme`.
 *
 * A substring query filters that flat list; `selectedIndex` walks the *filtered*
 * list with ArrowUp/ArrowDown (wrapping), Enter activates the selected action
 * and closes, Esc + backdrop close (handled by the Modal host). The selected row
 * is highlighted, scrolled into view, and kept in sync with the pointer; an empty
 * filter shows a "No results" row. The Modal focuses the search input on open and
 * restores focus to the trigger on close; we re-assert input focus explicitly.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/ui/Modal";
import { Input } from "@/ui/Input";
import { Key, Moon, Sun, type IconComponent } from "@/ui/icons";
import { NAV } from "@/app/router";
import { useShellStore } from "@/lib/store";
import { useTheme } from "@/theme/ThemeProvider";

type PaletteGroup = "Go to" | "Account" | "Theme";

interface PaletteAction {
  id: string;
  group: PaletteGroup;
  label: string;
  Icon: IconComponent;
  run: () => void;
}

export function CommandPalette() {
  const open = useShellStore((s) => s.paletteOpen);
  const closePalette = useShellStore((s) => s.closePalette);
  const go = useShellStore((s) => s.go);
  const openAddAccount = useShellStore((s) => s.openAddAccount);
  const { theme, setTheme } = useTheme();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);

  // The full, ordered action list. Group order = render order.
  const actions = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = [];
    for (const item of NAV) {
      list.push({
        id: `go:${item.screen}`,
        group: "Go to",
        label: item.label,
        Icon: item.icon,
        run: () => go(item.screen),
      });
    }
    list.push({
      id: "account:signin",
      group: "Account",
      label: "Sign in with Claude",
      Icon: Key,
      // Opens the add-account capture modal. The per-account switch actions are
      // re-added from the queries layer in the "rewire switcher" S4 task.
      run: () => openAddAccount(),
    });
    const nextTheme = theme === "dark" ? "light" : "dark";
    list.push({
      id: "theme:toggle",
      group: "Theme",
      label: `Switch to ${nextTheme} theme`,
      Icon: theme === "dark" ? Sun : Moon,
      run: () => setTheme(nextTheme),
    });
    return list;
  }, [go, openAddAccount, theme, setTheme]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q === ""
        ? actions
        : actions.filter((a) =>
            `${a.label} ${a.group}`.toLowerCase().includes(q),
          ),
    [actions, q],
  );

  // Fresh start on every open; reset the cursor whenever the filter changes.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);
  useEffect(() => {
    setSelectedIndex(0);
  }, [q]);

  // Explicitly focus the search input on open (the Modal also focuses the first
  // tabbable element; re-asserting keeps it deterministic across the transition).
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Keep the selected row visible as the cursor moves.
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  function activate(index: number) {
    const action = filtered[index];
    if (!action) return;
    action.run();
    closePalette();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) =>
        filtered.length ? (i + 1) % filtered.length : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) =>
        filtered.length ? (i - 1 + filtered.length) % filtered.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(selectedIndex);
    }
  }

  const activeId = filtered[selectedIndex]?.id;

  return (
    <Modal
      open={open}
      onClose={closePalette}
      size="md"
      showClose={false}
      className="self-start mt-16"
      footer={
        <span
          style={{
            flex: 1,
            textAlign: "right",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-mono-sm)",
            lineHeight: "var(--lh-mono-sm)",
            color: "var(--text-3)",
          }}
        >
          ↑↓ navigate · ↵ select · esc close
        </span>
      }
    >
      <Input
        ref={inputRef}
        variant="search"
        placeholder="Search commands, accounts, screens…"
        aria-label="Search commands, accounts, screens"
        aria-controls="command-palette-list"
        aria-activedescendant={activeId ? `cmd-${activeId}` : undefined}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />

      <div
        id="command-palette-list"
        role="listbox"
        aria-label="Commands"
        style={{
          marginTop: 10,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              padding: "14px 10px",
              fontSize: "var(--fs-body)",
              lineHeight: "var(--lh-body)",
              color: "var(--text-3)",
            }}
          >
            No results
          </div>
        ) : (
          filtered.map((action, i) => {
            const selected = i === selectedIndex;
            const { Icon } = action;
            return (
              <button
                key={action.id}
                id={`cmd-${action.id}`}
                ref={selected ? selectedRowRef : undefined}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseMove={() => setSelectedIndex(i)}
                onClick={() => activate(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  minHeight: 38,
                  padding: "0 10px",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  background: selected ? "var(--accent-tint)" : "transparent",
                  color: selected ? "var(--text)" : "var(--text-2)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <Icon
                  size={16}
                  active={selected}
                  color="var(--text-3)"
                  aria-hidden
                  style={{ flexShrink: 0 }}
                />
                <span
                  style={{
                    flex: 1,
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--fs-body)",
                    lineHeight: "var(--lh-body)",
                    fontWeight: selected ? 600 : 400,
                  }}
                >
                  {action.label}
                </span>
                <span
                  style={{
                    flexShrink: 0,
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--fs-mono-sm)",
                    lineHeight: "var(--lh-mono-sm)",
                    color: "var(--text-3)",
                  }}
                >
                  {action.group}
                </span>
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}
