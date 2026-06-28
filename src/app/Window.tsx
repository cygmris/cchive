/**
 * Window — the frameless application frame.
 *
 * A full-viewport, OS-chrome-less panel (`--app-bg`) laid out as:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ [● ● ●]  drag region (40px, traffic lights)│   ← top-left of the sidebar
 *   ├───────────────┬────────────────────────────┤
 *   │  <Sidebar/>   │  <main> active screen       │
 *   │   (248px)     │   (flex-1, from registry)   │
 *   ├───────────────┴────────────────────────────┤
 *   │            <StatusBar/> (full width)        │
 *   └──────────────────────────────────────────┘
 *
 * The traffic lights are real controls — red close / amber minimize / green
 * maximize — wired to `src/lib/window.ts` (which no-ops gracefully outside
 * Tauri, so `vite dev` / the gallery still work). Glyphs are revealed on hover.
 * The drag region (`data-tauri-drag-region`) lets the user move the window and
 * double-click to toggle maximize; it sits above the sidebar's controls so it
 * never covers an interactive element. Token-only styling.
 */
import { useState } from "react";
import { Sidebar } from "@/app/Sidebar";
import { StatusBar } from "@/app/StatusBar";
import { getScreen } from "@/screens/registry";
import { useShellStore } from "@/lib/store";
import {
  closeWindow,
  minimizeWindow,
  toggleMaximizeWindow,
} from "@/lib/window";

/**
 * The canonical macOS window-control hues. These are fixed OS-chrome colors
 * (not part of the warm Clavis theme palette) and stay constant across
 * light/dark, matching the design's traffic-light header exactly.
 */
const TRAFFIC = {
  close: "#FF5F57",
  minimize: "#FEBC2E",
  maximize: "#28C840",
} as const;

interface TrafficLightProps {
  color: string;
  label: string;
  glyph: string;
  hovered: boolean;
  onClick: () => void;
}

/** One 12px traffic-light control; reveals its glyph when the group is hovered. */
function TrafficLight({
  color,
  label,
  glyph,
  hovered,
  onClick,
}: TrafficLightProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 12,
        height: 12,
        padding: 0,
        border: "none",
        borderRadius: "var(--radius-pill)",
        background: color,
        boxShadow: "inset 0 0 0 0.5px rgba(0, 0, 0, 0.16)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        lineHeight: 1,
      }}
    >
      <span
        aria-hidden
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: "rgba(0, 0, 0, 0.5)",
          opacity: hovered ? 1 : 0,
          transition: "opacity 120ms ease-out",
        }}
      >
        {glyph}
      </span>
    </button>
  );
}

export function Window() {
  const activeScreen = useShellStore((s) => s.activeScreen);
  const [lightsHovered, setLightsHovered] = useState(false);
  const ActiveScreen = getScreen(activeScreen);

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--app-bg)",
        overflow: "hidden",
      }}
    >
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left column: drag header (traffic lights) stacked over the sidebar. */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div
            data-tauri-drag-region
            onDoubleClick={toggleMaximizeWindow}
            style={{
              width: "var(--sidebar-w)",
              height: 40,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              padding: "0 18px",
              background: "var(--sidebar-bg)",
              borderRight: "1px solid var(--border)",
            }}
          >
            <div
              onMouseEnter={() => setLightsHovered(true)}
              onMouseLeave={() => setLightsHovered(false)}
              onDoubleClick={(e) => e.stopPropagation()}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <TrafficLight
                color={TRAFFIC.close}
                label="Close window"
                glyph="×"
                hovered={lightsHovered}
                onClick={closeWindow}
              />
              <TrafficLight
                color={TRAFFIC.minimize}
                label="Minimize window"
                glyph="−"
                hovered={lightsHovered}
                onClick={minimizeWindow}
              />
              <TrafficLight
                color={TRAFFIC.maximize}
                label="Maximize window"
                glyph="+"
                hovered={lightsHovered}
                onClick={toggleMaximizeWindow}
              />
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
            <Sidebar />
          </div>
        </div>

        {/* Main: the active screen, resolved from the registry. */}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            height: "100%",
            overflowY: "auto",
            background: "var(--app-bg)",
            position: "relative",
          }}
        >
          <ActiveScreen />
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
