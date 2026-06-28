# Tasks Document — app-shell-navigation (S2)

> Compose the S1 library (`@/ui/*`, `@/theme`) into the shell. Tokens only, no hardcoded hex. Identity stays `app.clavis`, no predecessor fingerprints. Screens are placeholders this spec. Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. Frameless window config + window-control helper
  - Files: `src-tauri/tauri.conf.json` (modify), `src-tauri/capabilities/default.json` (modify), `src/lib/window.ts`
  - Purpose: a frameless, resizable window whose min/max/close/drag work cross-platform (and no-op safely in a browser)
  - _Leverage: tech.md (capabilities), .spec-workflow/research/modern-impl.md §3_
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _Prompt: Implement the task for spec app-shell-navigation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Tauri desktop engineer | Task: Set tauri.conf.json window decorations:false (keep transparent off unless needed), resizable, a sensible minWidth/minHeight, default 1300x840. Add to capabilities/default.json the minimal window permissions (core:window allow-minimize/allow-maximize/allow-unmaximize/allow-close/allow-start-dragging/allow-is-maximized). Create src/lib/window.ts wrapping @tauri-apps/api/window getCurrentWindow with isTauri detection: minimizeWindow/toggleMaximizeWindow/closeWindow/startDrag/onMaximizeChange — each a no-op (and console.debug) when not running under Tauri so vite dev/gallery still work. | Restrictions: no broad capabilities; guard every Tauri call; do not break the gallery in a browser. | Success: cargo build clean; window controls callable; helpers degrade gracefully in browser._

- [x] 2. Shell store (Zustand) + shell types + mock seed
  - Files: `src/lib/store.ts`, `src/lib/shell-types.ts`
  - Purpose: single source of shell state + actions, seeded with mock data shaped like the real domain
  - _Leverage: src/lib/types.ts, .spec-workflow/research/design-inventory.md §18 (state model), §2-§3 (seed data)_
  - _Requirements: 2.4, 2.5, 3.2, 4.1, 4.3, 5.x_
  - _Prompt: Implement the task for spec app-shell-navigation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React state engineer | Task: Install zustand (pnpm add zustand). Create src/lib/shell-types.ts (Screen union of the 13 keys; Account (id,name,org,email,tier,avatarSeed); Provider (id,title,brand,baseUrl,model); NavGroup). Create src/lib/store.ts: a Zustand store ( activeScreen, paletteOpen, switcherOpen, activeConfigId, accounts[], providers[], mcpEnabledCount, skillsEnabledCount, tokensToday, model ) + actions go(screen), openPalette/closePalette/togglePalette, openSwitcher/closeSwitcher/toggleSwitcher, switchTo(id). Seed with mock accounts/providers from the design (Personal Max 5× active, Northwind Max 20×, Z.ai/Kimi/AWS/DeepSeek providers), counts (mcp 5, skills ~5, tokensToday '246.1K', model claude-sonnet-4-5). Derive active config + status values. | Restrictions: shapes must mirror real domain types so S4 can swap the source; keep it the ONLY shell-state holder. | Success: store compiles; selectors return seeded values; actions mutate as expected._

- [x] 3. Router metadata + screen registry
  - Files: `src/app/router.ts`, `src/screens/registry.tsx`
  - Purpose: typed nav metadata + Screen→component map with a safe default
  - _Leverage: src/lib/shell-types.ts, .spec-workflow/research/design-inventory.md §1.2 (nav groups)_
  - _Requirements: 4.1, 4.4, 2.2_
  - _Prompt: Implement the task for spec app-shell-navigation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend architect | Task: Create src/app/router.ts exporting NAV: NavItem[] (screen,label,icon,group) for the 12 nav screens in the exact groups (main: Overview/Configurations/Projects; customize: MCP/Agents/Commands/Skills/Memory; system: Usage/Notifications/Experimental/Settings) — 'editor' is NOT in NAV; plus isScreen(x) guard and defaultScreen='overview'. Create src/screens/registry.tsx mapping every Screen (incl. editor) to its screen component (placeholders for now) with a fallback to Overview. | Restrictions: type-safe; adding a real screen later must only touch the registry import, not the shell. | Success: registry resolves all 13 screens; NAV drives the sidebar; tsc clean._

- [x] 4. Shared ScreenHeader + 13 placeholder screens
  - Files: `src/app/ScreenHeader.tsx`, `src/screens/[each]/index.tsx` (overview, configurations, config-editor, projects, mcp, agents, commands, skills, memory, usage, notifications, experimental, settings)
  - Purpose: the reusable sticky header + a labelled placeholder per screen
  - _Leverage: @/ui/Card, @/ui/Button, .spec-workflow/research/design-inventory.md (each screen's title + one-liner)_
  - _Requirements: 4.2_
  - _Prompt: Implement the task for spec app-shell-navigation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Create src/app/ScreenHeader.tsx — a sticky header (title + one-line description, sentence case) matching the design's screen-header pattern, reused by every screen. Create the 13 screen folders each exporting a component that renders ScreenHeader (with the exact title + one-liner from design-inventory) over a labelled placeholder body ("[Screen] — coming soon", subtle). Config Editor's header includes the back link to Configurations. Wire these into screens/registry.tsx. | Restrictions: placeholders only (real content is later specs); tokens only; use the exact titles/one-liners from the design. | Success: every screen renders its real header + placeholder; registry complete; tsc clean._

- [x] 5. Window frame (traffic lights + drag region + layout)
  - Files: `src/app/Window.tsx`
  - Purpose: the frameless frame hosting sidebar + screen outlet + status bar
  - _Leverage: src/lib/window.ts, @/ui/IconButton, src/screens/registry.tsx, src/lib/store.ts_
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _Prompt: Implement the task for spec app-shell-navigation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Build src/app/Window.tsx: a full-viewport frame with a top drag region (data-tauri-drag-region) containing macOS-style traffic-light controls (red close / amber minimize / green maximize) wired to src/lib/window.ts (hover reveals glyphs); layout = [Sidebar 248px][main flex-1 with the active screen from the registry] over a full-width StatusBar. Use --app-bg; double-click drag region toggles maximize. | Restrictions: traffic lights must be real controls (not decorative); drag region must not cover interactive sidebar controls; tokens only. | Success: window moves/min/max/close on desktop; layout matches the design; renders fine in browser (controls no-op)._

- [x] 6. Sidebar (logo, launcher, nav groups, active-config card, theme switch)
  - Files: `src/app/Sidebar.tsx`
  - Purpose: the 248px navigation sidebar
  - _Leverage: @/ui/LogoTile, @/ui/Badge, @/ui/SegmentedControl, @/ui/icons, @/theme/useTheme, src/app/router.ts, src/lib/store.ts_
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - _Prompt: Implement the task for spec app-shell-navigation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Build src/app/Sidebar.tsx (248px, --sidebar-bg): logo tile + "Clavis" wordmark + version pill; a full-width "Search…" launcher button with trailing ⌘K hint (calls openPalette); the three nav groups from router.NAV with uppercase eyebrow labels on Customize/System; active item = --accent-tint + 2.5px inset clay bar + accent icon + 600 (and Configurations stays active when activeScreen==='editor'); hover wash; footer = active-config card (avatar/brand chip + name + meta + chevron, opens switcher) + light/dark SegmentedControl bound to useTheme + "v1.0.0". | Restrictions: tokens only; nav driven by router.NAV (no hardcoded list); keyboard accessible. | Success: nav highlights the active screen, clicking navigates, theme switch works, ⌘K launcher opens palette._

- [x] 7. Account switcher popover
  - Files: `src/app/AccountSwitcher.tsx`
  - Purpose: the upward popover listing accounts + providers + sign-in
  - _Leverage: @/ui/Popover, @/ui/Badge, @/ui/icons, src/lib/store.ts, @/ui/Toast_
  - _Requirements: 2.5_
  - _Prompt: Implement the task for spec app-shell-navigation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Build src/app/AccountSwitcher.tsx using @/ui/Popover anchored to the sidebar active-config card: section "Claude accounts" (avatar, name, org, tier badge, check on active → switchTo), divider, section "API providers" (brand chip, title, check on active → switchTo), divider, "Sign in with Claude" accent row (stub → useToast 'OAuth coming soon' in S2; real in S4). Esc/click-outside close. | Restrictions: tokens only; switchTo updates the store (sidebar card + status bar reflect it); accessible. | Success: popover opens upward, selecting an entry switches active config and closes; sign-in stub toasts._

- [x] 8. Status bar
  - Files: `src/app/StatusBar.tsx`
  - Purpose: the bottom status line bound to the store
  - _Leverage: src/lib/store.ts, @/ui/icons_
  - _Requirements: 3.1, 3.2_
  - _Prompt: Implement the task for spec app-shell-navigation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Build src/app/StatusBar.tsx (30px, mono 11px, --sidebar-bg or surface-2): green pulse dot + active config name, divider, model id, flex spacer, "MCP (n)", "Skills (n)", "(tokensToday) tok today", and a success-green "Synced". All values from the store; update when active config/counts change. | Restrictions: tokens only; mono for machine values. | Success: status bar shows seeded values and updates after a switch._

- [x] 9. Command palette with real keyboard navigation
  - Files: `src/app/CommandPalette.tsx`
  - Purpose: ⌘K palette with grouped actions + ↑/↓/Enter/Esc
  - _Leverage: @/ui/Modal, @/ui/Input, @/ui/icons, src/app/router.ts, src/lib/store.ts, @/theme/useTheme_
  - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - _Prompt: Implement the task for spec app-shell-navigation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer (a11y) | Task: Build src/app/CommandPalette.tsx hosted in @/ui/Modal (~540px, anchored ~88px from top): a search Input + grouped action list — "Go to" (all 12 NAV destinations → go), "Account" (switch to each account + "Sign in with Claude") , "Theme" (toggle light/dark via useTheme). Substring filter; maintain selectedIndex across the FLAT filtered list; ArrowUp/Down move selection (wrap), Enter activates the selected action and closes, Esc closes, backdrop click closes; selected row highlighted; scroll selected into view; "No results" when empty. Open state from store.paletteOpen. | Restrictions: real keyboard nav (not just labels); tokens only; focus the input on open, restore focus on close. | Success: ⌘K opens; typing filters; arrows+Enter navigate; Esc closes._

- [x] 10. App integration + global shortcuts
  - Files: `src/App.tsx` (modify), `src/app/useGlobalShortcuts.ts`
  - Purpose: mount the shell, keep #/gallery dev route, bind global keys
  - _Leverage: all src/app/*, src/lib/store.ts, @/ui/Toast (ToastProvider)_
  - _Requirements: 4.1, 6.1, 6.2, 6.3_
  - _Prompt: Implement the task for spec app-shell-navigation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Rewrite src/App.tsx to render (inside ThemeProvider + ToastProvider) the Window shell with the CommandPalette, while preserving the dev-only #/gallery route (render Gallery when location.hash==='#/gallery', else the shell). Create src/app/useGlobalShortcuts.ts binding ⌘K/Ctrl+K (toggle palette, preventDefault) and Escape (close palette/switcher) with proper add/removeEventListener cleanup. The user nav must NOT include a Gallery entry. | Restrictions: no key-handler leaks; gallery stays dev-only; tokens only. | Success: app boots into the Overview shell; ⌘K toggles palette; Esc closes overlays; #/gallery still works._

- [x] 11. Unit tests for router/registry, store, palette, sidebar
  - Files: `src/app/router.test.ts`, `src/lib/store.test.ts`, `src/app/CommandPalette.test.tsx`, `src/app/Sidebar.test.tsx`
  - Purpose: lock navigation, store, palette keyboard nav, and active-state styling
  - _Leverage: Vitest + Testing Library, src/app/*, src/lib/store.ts_
  - _Requirements: 4.1, 4.3, 5.3, 2.3_
  - _Prompt: Implement the task for spec app-shell-navigation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend QA engineer | Task: Tests: router/registry — every Screen resolves; isScreen guards; default fallback. store — go() sets activeScreen; switchTo() updates activeConfig + derived status. CommandPalette — filter narrows; ArrowDown+Enter navigates; Esc closes. Sidebar — active item reflects activeScreen and Configurations stays active when activeScreen==='editor'. | Restrictions: behavior not implementation; headless. | Success: pnpm test green including the new suites._

- [x] 12. Verify, visual parity check, and commit
  - Files: (verify) whole repo
  - Purpose: prove the shell builds, tests pass, no fingerprints, and matches the design chrome
  - _Leverage: tech.md de-fingerprint rules, .design-bundles/Clavis.dc.html (shell reference)_
  - _Requirements: all_
  - _Prompt: Implement the task for spec app-shell-navigation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Release engineer | Task: Run pnpm exec tsc --noEmit (0 errors), pnpm test (green), cargo build (clean), pnpm exec vite build (clean). Re-run the fingerprint grep (ccmate/cc-mate/ccconfig/randynamic/__ccmate__/posthog/phc_/cc-switch/ccswitch/59948/unlock_cc_ext/ic=) over src + src-tauri/src + configs → zero. Report exact pass/fail of each with any errors. (The orchestrator will do the browser screenshot parity check against .design-bundles and the git commit.) | Restrictions: fix, don't suppress; do not commit (orchestrator commits after visual verification). | Success: all gates green and reported; fingerprints zero._
