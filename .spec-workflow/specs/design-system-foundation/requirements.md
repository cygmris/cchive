# Requirements Document — design-system-foundation (S1)

## Introduction

This spec establishes the **technical foundation and visual design system** for Clavis: a runnable Tauri v2 + React 19 + TypeScript + Vite project styled with Tailwind v4, a complete set of design tokens (light + dark) faithful to the Clavis "paper & clay" language, self‑hosted Geist / Geist Mono fonts, a theming engine (light/dark + 5 swappable accents + density), the Lucide icon set + C‑Key logo, and the **Clavis component library** (the design's core components plus the primitives every screen needs). It delivers a themed, de‑fingerprinted application shell that builds and runs, plus a developer‑only component gallery used to verify fidelity. Every later spec composes this foundation; nothing here touches Claude Code files.

## Alignment with Product Vision

Supports `product.md` Principle 6 (faithful to the design system) and Principle 5 (original, self‑contained — bundle id `app.clavis`, no predecessor fingerprints). It realizes design checklist items **81–92** (token system, swappable accent, provider chip palette, semantic colors, radius/shadow scales, type system, spacing grid, core components, C‑Key logo, line icons, motion) and scaffolds **14–16** (theme system, accent tweak, density tweak) that S2 wires into the shell. It is the precondition for the calm, native, all‑day‑livable instrument the product promises.

## Requirements

### Requirement 1 — Buildable cross‑platform scaffold

**User Story:** As the developer, I want a correctly configured Tauri v2 + React + TS + Vite + Tailwind v4 project, so that I can build and run Clavis on Linux today and macOS/Windows later.

#### Acceptance Criteria
1. WHEN `pnpm install` and `pnpm tauri build` (or `cargo build` in `src-tauri`) run THEN the project SHALL compile with no errors on this Linux machine.
2. WHEN the app launches in dev (`pnpm tauri dev`) THEN a Tauri window SHALL open rendering the React app without console errors.
3. The project SHALL use the structure defined in `structure.md` (`src/`, `src-tauri/`, `@/` path alias) and pin the versions in `tech.md`.
4. The Tauri identity SHALL be original: bundle identifier `app.clavis`, productName `Clavis`, window titled `Clavis` — with **no** predecessor identifiers, marker strings, telemetry keys, or affiliate params anywhere in the code or config.
5. Tailwind v4 SHALL be configured via the Vite plugin with a `@theme` mapped to the Clavis tokens; the `@/` alias SHALL resolve in both TS and Vite.

### Requirement 2 — Complete design‑token system (light + dark)

**User Story:** As a UI developer, I want every design token defined once as CSS custom properties, so that components reference tokens and never hardcode values, and themes swap coherently.

#### Acceptance Criteria
1. The token layer SHALL define all neutrals (light sand/stone and dark espresso/cream), the clay ramp (clay‑300…clay‑700), semantic colors (success `#3fb37a`, warning `#e0a93f`, danger `#e5484d`, info `#5b8def`), provider chip colors (Anthropic/Z.ai/Kimi/AWS/DeepSeek), the radius scale (xs 5, sm 7, md 8, lg 9, xl 12, 2xl 14, 3xl 16, tile 9, app‑icon 22% squircle, pill), the shadow scale (card/raised/pop/window/tile/tile‑lg/knob + focus rings), the type scale (display/title/heading/body/label/stat/mono/mono‑sm), and the spacing grid (4px base; gutter 28, card‑gap 14, card‑pad 20, sidebar 248) — matching `research/design-inventory.md §17` and `.design-bundles/tokens/*`.
2. WHEN the root carries `.dark` (or `data-theme="dark"`) THEN all color tokens SHALL switch to the dark values; light SHALL be the default.
3. Token **names** SHALL match the live product (`--accent`, `--app-bg`, `--surface`, `--surface-2`, `--sidebar-bg`, `--border`, `--border-strong`, `--text`, `--text-2`, `--text-3`, `--hover`, `--backdrop`, …) so the system and app never drift.
4. All emphasis colors SHALL derive from `--accent` via `color-mix` (e.g. `--accent-tint`, `--ring-accent`), not hardcoded clay, so retinting stays coherent.

### Requirement 3 — Fonts

**User Story:** As a user, I want Geist for prose and Geist Mono for machine text, rendered offline, so the app reads like the design and never depends on a network font.

#### Acceptance Criteria
1. The Geist and Geist Mono variable `.woff2` files SHALL be bundled locally under `src/assets/fonts/` and declared via `@font-face` (weight 100–900, `font-display:swap`), wired to `--font-sans` / `--font-mono`.
2. WHEN the app renders THEN prose SHALL use Geist and all machine text (keys, URLs, model ids, paths, token counts, code) SHALL use Geist Mono.
3. The app SHALL make no request to Google Fonts or any remote font host.

### Requirement 4 — Theming engine (light/dark + accent + density)

**User Story:** As a user, I want to switch theme, accent color, and density, so the app fits my taste and my eyes, persistently.

#### Acceptance Criteria
1. The engine SHALL expose light/dark with a ~0.3s cross‑fade and apply it by toggling the root theme class/attribute.
2. The engine SHALL expose 5 accents — Clay `#d97757` (default), Blue `#4b6bfb`, Green `#2f8f63`, Violet `#7c6cf0`, Ember `#c2410c` — by setting `--accent`; all accent‑derived tokens SHALL recolor automatically via `color-mix`.
3. The engine SHALL expose density comfortable (default) / compact, setting `--row-py` (13/9) and `--card-pad` (20/15), and components SHALL honor these variables (unlike the mock, density SHALL visibly affect row/card padding).
4. WHEN theme/accent/density change THEN the choice SHALL persist (via `tauri-plugin-store`) and reload on next launch.
5. A React `ThemeProvider` + `useTheme()` hook SHALL expose current values and setters for S2+ to bind to the UI.

### Requirement 5 — Icons and logo

**User Story:** As a UI developer, I want the line‑icon set and the C‑Key logo as components, so screens render the exact iconography with accent‑on‑active behavior.

#### Acceptance Criteria
1. Icons SHALL come from `lucide-react` (line, ~1.7 stroke) re‑exported through `@/ui/icons`; icon stroke SHALL use `currentColor` and switch to `--accent` when its row/item is active.
2. The **C‑Key** logo SHALL be provided as React components: a monochrome `LogoMark` (currentColor) and a gradient `LogoTile` (157° clay ramp app‑icon squircle), sourced from `.design-bundles/assets/logo-mark.svg` / `logo-tile.svg`, rendering crisply 16–48px.
3. No emoji and no filled/duotone icon sets SHALL be used.

### Requirement 6 — Clavis component library

**User Story:** As a UI developer, I want a faithful, reusable component library, so every screen is built from consistent, accessible primitives instead of bespoke markup.

#### Acceptance Criteria
1. The library SHALL implement the design's core components per `research/design-components.md` and `.design-bundles/components/core/*`: **Button** (primary/secondary/ghost/danger variants, sizes, loading/disabled, optional icon), **Switch** (on/off, sizes, disabled, ~0.18s motion), **Badge** (neutral/semantic/accent + provider chip + model/source badge variants), **Card** (surface, hairline border, near‑flat shadow, optional accent left‑bar/hero), **StatTile** (label + accent‑tinted icon + Geist‑Mono‑Light 30px numeral, clickable).
2. The library SHALL also provide the primitives later screens need: **Input** (text + secret/masked), **Select**, **SegmentedControl** (e.g. light/dark, 30d/7d), **IconButton**, **Radio**, **Tooltip**, **Popover** (used by the switcher/menus), **Modal** (backdrop + card, used by OAuth/palette), and a minimal **Toast**.
3. Each component SHALL implement the design's hover/active/press/focus/disabled states (neutral wash hover; `--accent-tint` + inset clay bar active; clay‑600 press; 3px `--ring-accent` focus; 50% opacity disabled) and use only tokens (no hardcoded hex).
4. Components SHALL be keyboard‑accessible (focus rings, Enter/Space activation, Esc to close overlays) and expose typed props.
5. A developer‑only **component gallery** route SHALL render every component in all variants in light and dark, for visual verification — and SHALL NOT ship in the user nav.

### Requirement 7 — Visual fidelity verification

**User Story:** As the developer, I want to confirm the foundation matches the design before building screens, so later work rests on a correct base.

#### Acceptance Criteria
1. WHEN the gallery is opened in a browser/webview THEN tokens, fonts, the 5 accents, light/dark, and all components SHALL render consistently with `.design-bundles` (cross‑checked visually).
2. The build SHALL produce **zero** TypeScript errors and zero console errors in the gallery.

## Non-Functional Requirements

### Code Architecture and Modularity
- **Single Responsibility**: one component per file under `src/ui/`; tokens in exactly one place (`src/theme/tokens.css`); theme logic isolated in `src/theme/`.
- **Modular Design**: `src/ui` and `src/theme` form a self‑contained library that `src/screens` (later) consumes; UI components never import screens.
- **Clear Interfaces**: every component exports a typed props interface; the theme exposes a single provider + hook.

### Performance
- Variable fonts (single file each); theme switches apply via CSS‑var swap (no re‑mount); cold start target < 1.5 s.

### Security
- No network calls (fonts local; no telemetry). No secret handling in this spec.

### Reliability
- Theme/accent/density persistence SHALL survive restart; missing/corrupt stored prefs SHALL fall back to defaults without crashing.

### Usability
- Sentence case throughout; only eyebrow labels uppercase. Motion is quick ease‑out, no bounce. Respect `prefers-reduced-motion` by shortening/disabling transitions.
