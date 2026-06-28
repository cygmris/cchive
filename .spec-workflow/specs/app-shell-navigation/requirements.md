# Requirements Document — app-shell-navigation (S2)

## Introduction

S2 builds the **application shell and navigation**: the window chrome, the 248px sidebar (logo tile, ⌘K launcher, the three grouped nav sections, the active‑config switcher card, and the theme switch), the bottom status bar, the router that addresses all **13 screens** with placeholder content, the **⌘K command palette** with real keyboard navigation, and the global keyboard shortcuts. It composes the S1 component library and theming engine into a navigable, faithful Clavis frame. Screens remain placeholders (filled by later specs); the switcher and status bar bind to a small in‑memory mock state in this spec (replaced by the real Rust data layer in S3/S4). No Claude Code files are touched yet.

## Alignment with Product Vision

Realizes the "calm instrument panel" shell from `product.md` and design checklist items **1–16** (window chrome, sidebar, nav groups, active states, switcher, theme switch, status bar, keyboard handler, theme/accent/density) and **76–80** (command palette), plus the reused sticky‑header pattern (17). It is the navigational spine every feature screen plugs into, so getting it pixel‑ and interaction‑faithful here pays off across all 13 screens.

## Requirements

### Requirement 1 — Window chrome

**User Story:** As a user, I want a calm, native‑feeling window, so the app looks like the macOS‑first design while still working on Linux and Windows.

#### Acceptance Criteria
1. The app SHALL render as a frameless Tauri window (`decorations: false`) with a custom title/drag region, an inner layout of `[sidebar 248px][main]` over a full‑width status bar, and the warm `--app-bg`.
2. The sidebar header SHALL show macOS‑style **traffic‑light controls** (red/amber/green) that are **functional**: close, minimize, and maximize/restore via the Tauri window API on all platforms.
3. WHEN the window is dragged by the titlebar/drag region THEN the OS window SHALL move; double‑click on the drag region SHALL toggle maximize.
4. The window SHALL be resizable with sensible min size; the internal layout SHALL reflow (sidebar fixed 248px, content flexes). The "1300×840 rounded panel" is the default size, not a hard constraint.

### Requirement 2 — Sidebar

**User Story:** As a user, I want one consistent sidebar to navigate and see my active identity, so I always know where I am and which config is live.

#### Acceptance Criteria
1. The sidebar SHALL render the logo tile (C‑Key gradient squircle) + "Clavis" wordmark + a version pill, and a full‑width **search/launcher button** ("Search…") with a trailing `⌘K` hint that opens the command palette.
2. The nav SHALL have three groups — **Main** (Overview, Configurations, Projects), **Customize** (MCP, Agents, Commands, Skills, Memory), **System** (Usage, Notifications, Experimental, Settings) — each row an icon + label.
3. WHEN a nav item is the active screen THEN it SHALL show `--accent-tint` fill + a 2.5px inset clay bar + accent‑colored icon + 600 weight; hover SHALL show the neutral wash. WHEN the Config Editor screen is active THEN **Configurations** SHALL remain highlighted.
4. The sidebar footer SHALL show the **active‑config card** (avatar/brand chip + name + meta line + up/down chevron) that opens the **switcher popover**, and below it a **light/dark segmented theme switch** + version label.
5. The **switcher popover** SHALL list "Claude accounts" (avatar, name, org, tier badge, check on active) and "API providers" (brand chip, title, check on active), plus a "Sign in with Claude" row; selecting an entry SHALL set the active config and close the popover.

### Requirement 3 — Status bar

**User Story:** As a user, I want a quiet status line, so key facts (active config, model, counts, sync) are always visible.

#### Acceptance Criteria
1. The status bar SHALL render (mono, 11px): a green pulse dot + active config name, the model id, MCP enabled count, Skills enabled count, tokens‑today, and a "Synced" indicator.
2. All values SHALL derive from the shell's state so they update when the active config / toggles change (mock state in S2; real data later).

### Requirement 4 — Routing across all 13 screens

**User Story:** As a user, I want to move between every screen, so the whole app is reachable even before each screen is built out.

#### Acceptance Criteria
1. The router SHALL address the 13 screens — `overview, configs, editor, projects, mcp, agents, commands, skills, memory, usage, notifications, experimental, settings` — via an `activeScreen` state (hash‑based or in‑memory), with the dev `#/gallery` route preserved but excluded from user nav.
2. Each screen SHALL render at minimum its **sticky header** (title + one‑line description) and a labelled placeholder body, using the shared header pattern; the Config Editor SHALL be reachable via an action (not a nav item) and show its back link.
3. WHEN a nav item, stat tile deep‑link, palette entry, or switcher action requests navigation THEN `activeScreen` SHALL update and the corresponding screen SHALL render.
4. Navigation SHALL be type‑safe (a `Screen` union) and centralized so later specs mount real screens by key without touching the shell.

### Requirement 5 — Command palette (⌘K)

**User Story:** As a power user, I want a command palette, so I can jump anywhere or switch identity from the keyboard.

#### Acceptance Criteria
1. WHEN ⌘K / Ctrl+K is pressed (or the sidebar launcher clicked) THEN a centered palette overlay SHALL open with a search input and grouped items.
2. The palette SHALL list: "Go to" (all 12 nav destinations), "Account" (switch to each account + "Sign in with Claude"), and "Theme" (toggle light/dark).
3. The search input SHALL filter items by substring; **↑/↓ SHALL move selection, Enter SHALL activate the selected item, Esc SHALL close** (real keyboard navigation, not just labels).
4. Backdrop click and Esc SHALL close the palette; selecting an item SHALL perform its action and close.

### Requirement 6 — Global shortcuts & theming wiring

**User Story:** As a user, I want consistent global keys and persistent personalization, so the app feels responsive and remembers me.

#### Acceptance Criteria
1. A global key handler SHALL bind ⌘K/Ctrl+K (toggle palette) and Escape (close palette/switcher/menus), with `preventDefault` where appropriate.
2. The footer theme switch (and a palette theme entry) SHALL drive the S1 theme engine; accent and density remain configurable (Settings screen wires the full controls later) and persist via the S1 prefs store.
3. WHEN the app reloads THEN the last theme/accent/density SHALL be restored (S1 behavior, exercised here in the real shell).

## Non-Functional Requirements

### Code Architecture and Modularity
- Shell pieces live in `src/app/` (`Window`, `Sidebar`, `StatusBar`, `CommandPalette`, `AccountSwitcher`, `router.ts`); screens live in `src/screens/<screen>/` with a registry mapping `Screen` → component.
- The shell composes `@/ui/*` and `@/theme` only; it must not import feature logic. Mock shell state is isolated in one place for easy replacement by the S3/S4 data layer.

### Performance
- Navigation is instant (state swap, no reload). Palette open/close and popovers animate with the S1 quick ease‑out motion. No layout shift on theme change.

### Security
- Frameless window must still expose working min/close/maximize; the custom drag region must not block interactive controls. No new capabilities beyond window controls + the S1 store.

### Reliability
- Unknown/invalid `activeScreen` falls back to Overview. The palette and switcher must trap focus and restore it on close. Keyboard handlers must not leak across unmounts.

### Usability
- Sentence case; only eyebrow labels uppercase. Every nav item, palette entry, switcher row, and window control is keyboard‑reachable and screen‑reader labelled. Accurate per‑OS behavior for the window controls.
