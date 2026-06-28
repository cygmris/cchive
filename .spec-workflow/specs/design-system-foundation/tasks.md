# Tasks Document — design-system-foundation (S1)

> Conventions: components reference CSS‑var tokens only (no hardcoded hex). Identity is `app.clavis` — NO predecessor names/markers/telemetry anywhere. Authoritative component spec = `.spec-workflow/research/design-components.md` + `.design-bundles/components/core/*` + `.design-bundles/tokens/*`. Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. Scaffold Tauri v2 + React 19 + TS + Vite 7 project with de-fingerprinted identity
  - Files: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
  - Purpose: a runnable shell that opens a Tauri window rendering React, with the original Clavis identity
  - _Leverage: tech.md (version pins), structure.md (layout), .spec-workflow/research/modern-impl.md §3 (plugins/capabilities)_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Senior Tauri+React build engineer | Task: Scaffold a Tauri v2.10 + React 19 + TypeScript + Vite 7 app at the repo root per structure.md. Configure Vite with the React plugin, the Tailwind v4 vite plugin, and an `@/`→`src/` alias (mirror in tsconfig paths, strict mode). In src-tauri set Cargo deps tauri 2.10 (features tray-icon, image-png), tauri-plugin-store 2.4.3, tauri-plugin-single-instance 2.4.2; register single-instance FIRST in the builder, then the store plugin, and open a 1300x840 window. tauri.conf.json MUST use identifier `app.clavis`, productName `Clavis`, window title `Clavis`. capabilities/default.json grants only core:default + store:default + window show/hide. main.tsx renders a minimal App. | Restrictions: NO predecessor identifiers/markers/telemetry/affiliate strings anywhere; pin versions from tech.md; do not add broad fs/shell capabilities; keep main.rs minimal (grows in S3). | Success: `pnpm install` succeeds, `cargo build` in src-tauri succeeds, `pnpm tauri dev` opens a window with no console errors, and a grep for predecessor names finds nothing._

- [x] 2. Bundle Geist + Geist Mono fonts and declare @font-face
  - Files: `src/assets/fonts/Geist-Variable.woff2`, `src/assets/fonts/GeistMono-Variable.woff2`, `src/theme/fonts.css`
  - Purpose: offline Geist/Geist Mono wired to `--font-sans` / `--font-mono`
  - _Leverage: .spec-workflow/research/modern-impl.md §4 (font bundling), .design-bundles/tokens/fonts.css_
  - _Requirements: 3.1, 3.2, 3.3_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer (web fonts) | Task: Add the variable Geist + Geist Mono woff2 to src/assets/fonts/ (install the `geist` npm package and copy node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2 and geist-mono/GeistMono-Variable.woff2, or download official). Write src/theme/fonts.css with two @font-face rules (weight 100 900, font-display swap) defining "Geist" and "Geist Mono", and set --font-sans/--font-mono. | Restrictions: do NOT use `geist/font/sans` (Next.js only); no Google Fonts/remote hosts; self-host only. | Success: fonts load offline; prose renders Geist and a mono sample renders Geist Mono; no network font requests._

- [x] 3. Author the complete token layer (light/dark + accent-derived + density) and Tailwind @theme
  - Files: `src/theme/tokens.css`, `src/styles/global.css`
  - Purpose: single source of truth for every design token, swapping by theme/accent/density
  - _Leverage: .spec-workflow/research/design-inventory.md §17, .spec-workflow/research/design-components.md (token tables), .design-bundles/tokens/*.css, .design-bundles/styles.css_
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Design-systems engineer | Task: Create src/theme/tokens.css defining ALL Clavis tokens as CSS custom properties: light neutrals in :root and dark neutrals under [data-theme="dark"] (sand/stone vs espresso/cream — never gray), the clay ramp, semantic colors, provider chip colors, radius/shadow/type/spacing scales, and density vars (--row-py, --card-pad). Define --accent (default clay) and derive --accent-tint, --ring-accent, hover etc. via color-mix off --accent. Use the EXACT token names from the design (--accent,--app-bg,--surface,--surface-2,--sidebar-bg,--border,--border-strong,--text,--text-2,--text-3,--hover,--backdrop,…) and exact values from design-inventory §17 and .design-bundles/tokens. Import fonts.css + tokens.css from global.css; map key tokens into a Tailwind v4 @theme block so utilities and tokens align. | Restrictions: values must match the design bundle exactly; all emphasis via color-mix off --accent (no hardcoded clay in derived tokens); light is default. | Success: toggling [data-theme=dark] swaps all colors; changing --accent recolors derived tokens; token names match the live product._

- [x] 4. Add frontend lib helpers: class-merge, color, and prefs persistence wrapper
  - Files: `src/lib/cn.ts`, `src/lib/prefs.ts`, `src/lib/types.ts`
  - Purpose: shared utilities — `cn()` class merge, a typed prefs store over tauri-plugin-store with localStorage fallback, shared TS types
  - _Leverage: tech.md (tauri-plugin-store), structure.md (lib/)_
  - _Requirements: 4.4, 4.5_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: TypeScript developer | Task: Implement src/lib/cn.ts (clsx+tailwind-merge style class combiner), src/lib/prefs.ts exposing async getPrefs()/setPref(key,value) backed by tauri-plugin-store (load `clavis.store.json`) with a graceful localStorage + in-memory fallback when the Tauri store is unavailable (so the gallery works in a plain browser), and src/lib/types.ts with the ThemePrefs type ({theme,accent,density}) and the AccentName union. | Restrictions: never throw on missing/corrupt prefs — return defaults; keep secrets out (this is non-secret prefs only). | Success: prefs round-trip in Tauri and degrade cleanly in a browser; cn() merges conflicting Tailwind classes correctly._

- [x] 5. Implement the theme engine (ThemeProvider + useTheme) and wire it into App
  - Files: `src/theme/theme.ts`, `src/theme/ThemeProvider.tsx`, `src/App.tsx` (modify)
  - Purpose: apply + persist theme/accent/density at runtime
  - _Leverage: src/lib/prefs.ts, src/theme/tokens.css, .spec-workflow/research/design-inventory.md §17 (accent presets, density values)_
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React state/theming engineer | Task: Implement ThemeProvider that on mount loads ThemePrefs (defaults light/clay/comfortable), applies them by setting document root data-theme, --accent (from ACCENTS preset map clay/blue/green/violet/ember), and density vars, and persists changes via prefs. Export useTheme() returning {theme,accent,density,setTheme,setAccent,setDensity}. Add a ~0.3s color transition on theme change and respect prefers-reduced-motion. Wrap App in ThemeProvider. | Restrictions: apply via CSS-var/attribute swaps (no component remounts); no hardcoded colors. | Success: changing theme/accent/density updates the UI instantly, persists across reload, and falls back to defaults if prefs are corrupt._

- [x] 6. Icon set + C-Key logo components
  - Files: `src/ui/icons.tsx`, `src/ui/Logo.tsx`
  - Purpose: Lucide line-icon access + LogoMark/LogoTile
  - _Leverage: lucide-react, .design-bundles/assets/logo-mark.svg, .design-bundles/assets/logo-tile.svg, readme.md (iconography rules)_
  - _Requirements: 5.1, 5.2, 5.3_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Create src/ui/icons.tsx that re-exports the lucide-react icons Clavis screens use (search, settings, plus, check, chevron-up/down, sun, moon, trash, edit/pencil, server, bot, terminal, book, bar-chart, bell, beaker, folder, x, external-link, log-out, refresh, copy, grip, etc.) with a consistent default strokeWidth ~1.7 and currentColor; provide an active variant that uses var(--accent). Create src/ui/Logo.tsx with LogoMark (monochrome currentColor C-Key) and LogoTile (157deg clay-gradient squircle app icon) reauthored from the .design-bundles/assets SVGs, both size-prop driven (crisp 16–48px). | Restrictions: no emoji, no filled/duotone sets, no png; reauthor the SVG paths in our code (no predecessor attribution). | Success: icons render at ~1.7 stroke and recolor to accent when active; LogoMark/LogoTile render crisply across 16–48px in light and dark._

- [x] 7. Button + IconButton components
  - Files: `src/ui/Button.tsx`, `src/ui/IconButton.tsx`
  - Purpose: primary/secondary/ghost/danger buttons + icon button, full state matrix
  - _Leverage: .spec-workflow/research/design-components.md (Button spec), .design-bundles/components/core/Button.{jsx,d.ts,prompt.md}_
  - _Requirements: 6.1, 6.3, 6.4_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Component-library engineer | Task: Implement Button (variants primary/secondary/ghost/danger; sizes; optional leading/trailing icon; loading + disabled) and IconButton (square, hover wash, optional danger-on-hover), matching design-components.md and the .design-bundles Button reference. Use radius lg (9px) for primary, md (8px) for icon buttons. Implement hover (neutral wash / clay brightness 1.05), active, press (clay-600), focus (3px --ring-accent), disabled (50%, not-allowed). | Restrictions: tokens only (no hex); keyboard-activatable (Enter/Space); typed props; reauthor, do not copy verbatim. | Success: all variants/states render per design; focus ring visible; works with keyboard._

- [x] 8. Switch + Radio + SegmentedControl
  - Files: `src/ui/Switch.tsx`, `src/ui/Radio.tsx`, `src/ui/SegmentedControl.tsx`
  - Purpose: toggle, radio (active clay ring), and segmented control (light/dark, 30d/7d, view modes)
  - _Leverage: .spec-workflow/research/design-components.md (Switch spec), .design-bundles/components/core/Switch.{jsx,d.ts,prompt.md}_
  - _Requirements: 6.2, 6.3, 6.4_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Component-library engineer | Task: Implement Switch (round knob, on=accent, ~0.18s motion, sizes, disabled), Radio (5px clay ring when active per the Configurations rows), and SegmentedControl (2+ segments with an animated active pill; used for light/dark and 30d/7d). Match design-components.md and the .design-bundles Switch reference. | Restrictions: tokens only; fully keyboard-accessible (Space toggles Switch; arrows move SegmentedControl); typed controlled props (value/checked + onChange). | Success: states/motion match design; keyboard works; no hardcoded colors._

- [x] 9. Badge component (semantic + provider chip + model/source variants)
  - Files: `src/ui/Badge.tsx`
  - Purpose: status badges, the "Active" badge, provider brand chips, and model/source badges
  - _Leverage: .spec-workflow/research/design-components.md (Badge spec), .design-bundles/components/core/Badge.{jsx,d.ts,prompt.md}, design-inventory §17 (provider chips, semantic colors)_
  - _Requirements: 6.1, 6.3_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Component-library engineer | Task: Implement Badge supporting: neutral/success/warning/danger/info tints (dot + tint), accent "Active" badge, a ProviderChip variant (single brand letter/glyph on the brand color — Anthropic ✳ clay, Z.ai Z, Kimi K, AWS aws, DeepSeek DS), and model/source badge coloring (sonnet=clay, opus=violet, haiku=green; Personal=clay, Project=blue, Plugin=violet). Match design-components.md + the .design-bundles Badge reference. | Restrictions: tokens only; no emoji (provider marks are letters/glyphs); typed variant prop. | Success: every badge variant matches the design palette and shape in light and dark._

- [x] 10. Card + StatTile components
  - Files: `src/ui/Card.tsx`, `src/ui/StatTile.tsx`
  - Purpose: surface card (incl. accent left-bar + hero) and the clickable stat tile
  - _Leverage: .spec-workflow/research/design-components.md (Card + StatTile specs), .design-bundles/components/core/Card.{jsx,d.ts}, StatTile.{jsx,d.ts}_
  - _Requirements: 6.1, 6.3_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Component-library engineer | Task: Implement Card (surface bg, 1px hairline --border, radius 2xl 14px, near-flat --shadow-card; props for accentBar (2.5px inset clay left bar), hero (radius 16, --shadow-raised), and padding honoring --card-pad density var) and StatTile (label + accent-tinted icon + big Geist-Mono-Light 30px numeral; clickable with hover wash; used as Overview/Usage tiles). Match design-components.md + the .design-bundles references. | Restrictions: tokens only; density var must affect padding; typed props; clickable tile is a real button (keyboard accessible). | Success: cards/tiles match the design; accent bar + hero variants correct; density changes padding visibly._

- [x] 11. Input (text + secret) + Select
  - Files: `src/ui/Input.tsx`, `src/ui/Select.tsx`
  - Purpose: form controls used by Config Editor, Settings, search fields
  - _Leverage: .spec-workflow/research/design-components.md, design-inventory §4 (control types), readme.md (mono for machine text)_
  - _Requirements: 6.2, 6.3, 6.4_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Component-library engineer | Task: Implement Input (radius md 8px, hairline border deepening to --border-strong on focus-within + 3px --ring-accent; variants: text, search (leading icon), and secret with a masked •••••••••••• placeholder + show/hide toggle; mono font option for keys/URLs/paths) and Select (native or custom dropdown styled to tokens, radius md, options list). | Restrictions: tokens only; controlled props; machine-text inputs use --font-mono; accessible labels/aria. | Success: inputs/selects match the Config Editor field styling; focus ring correct; secret masking + toggle works._

- [x] 12. Tooltip + Popover primitives
  - Files: `src/ui/Tooltip.tsx`, `src/ui/Popover.tsx`
  - Purpose: hover tooltips + anchored popovers (used by the account switcher, new-provider menu, charts)
  - _Leverage: .spec-workflow/research/design-components.md, design-inventory §1.2/§3 (switcher/menu), readme.md (shadow-pop, radius xl 12)_
  - _Requirements: 6.2, 6.3, 6.4_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Component-library engineer (overlays) | Task: Implement Tooltip (small delayed hover label, mono option for token values) and Popover (anchored floating panel with --shadow-pop, radius xl 12, open up/down, click-outside + Esc to close, focus trap optional). Use a lightweight positioning approach (e.g. @floating-ui/react) or a minimal custom positioner. | Restrictions: tokens only; keyboard dismiss (Esc) and click-outside; no layout shift; accessible roles. | Success: popover anchors correctly and closes on Esc/outside; tooltip shows/hides on hover with the right delay/style._

- [x] 13. Modal + Toast primitives
  - Files: `src/ui/Modal.tsx`, `src/ui/Toast.tsx`
  - Purpose: backdrop modal (OAuth, command palette host) + minimal toast notifications
  - _Leverage: .spec-workflow/research/design-components.md, design-inventory §15/§16 (OAuth modal, palette), readme.md (--backdrop, radius)_
  - _Requirements: 6.2, 6.3, 6.4_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Component-library engineer (overlays) | Task: Implement Modal (backdrop at --backdrop opacity, centered card, Esc + backdrop-click close, focus trap, body scroll lock; sizes for the ~380px OAuth card and the ~540px palette panel) and a minimal Toast system (ToastProvider + useToast() pushing transient messages with semantic variants, auto-dismiss). | Restrictions: tokens only; accessible (role=dialog, aria-modal, return focus on close); animations quick ease-out. | Success: modal opens/closes via Esc/backdrop with focus trapped; toasts appear and auto-dismiss; both themed correctly._

- [x] 14. Developer-only component gallery route
  - Files: `src/screens/_gallery/Gallery.tsx`, `src/App.tsx` (modify to route to gallery via dev flag/hash)
  - Purpose: render every component × variant × light/dark for visual fidelity verification
  - _Leverage: all src/ui/* components, src/theme/useTheme_
  - _Requirements: 6.5, 7.1, 7.2_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Build a dev-only Gallery screen that showcases every component (Button/IconButton variants, Switch/Radio/SegmentedControl, Badge incl. provider chips + model/source, Card incl. accentBar/hero, StatTile, Input incl. secret/search, Select, Tooltip, Popover, Modal, Toast) plus token swatches (neutrals, semantic, the 5 accents) and the logo at multiple sizes. Add controls to flip theme (light/dark), accent (5), and density via useTheme. Route to it behind a dev flag or `#/gallery` hash, NOT in the user nav. | Restrictions: dev-only (must not appear in shipped user navigation); tokens only. | Success: opening #/gallery shows all components/variants in light+dark with the accent/density switchers working, zero console errors._

- [x] 15. Unit tests for the theme engine and a representative component sample
  - Files: `src/theme/theme.test.ts`, `src/ui/Button.test.tsx`, `src/ui/SegmentedControl.test.tsx`, `vitest.config.ts` (+ test setup)
  - Purpose: lock the foundation's correctness (theme persistence + component behavior)
  - _Leverage: Vitest + @testing-library/react, src/theme/*, src/ui/*_
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.3, 6.4_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend QA engineer | Task: Configure Vitest + jsdom + Testing Library and write tests: (a) theme engine — setting theme/accent/density updates root data-theme/--accent and persists+restores via a mocked prefs store, and corrupt prefs fall back to defaults; (b) Button — renders each variant, fires onClick, respects disabled, is keyboard-activatable; (c) SegmentedControl — selecting a segment calls onChange and reflects the active pill. | Restrictions: mock the prefs/store layer; test behavior not implementation details; tests must run in CI headless. | Success: `pnpm test` passes; the theme and sample-component behaviors are covered._

- [x] 16. Build verification + de-fingerprint audit + README
  - Files: `README.md`, (verify only) whole repo
  - Purpose: prove S1 builds clean and contains zero predecessor fingerprints
  - _Leverage: tech.md (de-fingerprint rules), ccmate-features.md §9 (fingerprint list)_
  - _Requirements: 1.1, 1.2, 1.4, 7.2_
  - _Prompt: Implement the task for spec design-system-foundation, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Release engineer | Task: Run `pnpm install`, `pnpm tsc --noEmit` (zero TS errors), `pnpm test` (green), and `cargo build` in src-tauri (clean). Grep the entire repo (excluding .design-bundles and node_modules/target) for predecessor fingerprints — ccmate, cc-mate, ccconfig, randynamic, __ccmate__, posthog, phc_, cc-switch, ccswitch, 59948, unlock_cc_ext, affiliate `ic=` — and assert ZERO matches; fix any that appear. Write a concise README.md (what Clavis is, build/run/test commands, the original identity). | Restrictions: do not weaken the identity; if a fingerprint is found, rename it, don't suppress the check. | Success: all builds/tests green, the fingerprint grep returns nothing, README documents build/run._
