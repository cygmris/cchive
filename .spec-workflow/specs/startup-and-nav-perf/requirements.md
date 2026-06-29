# Requirements Document — startup-and-nav-perf (S19)

## Introduction

Two real performance issues, confirmed by code + bundle analysis:
1. **Startup white screen** — `main.tsx` gates the first React paint behind an
   `await getLanguagePref()` (a Tauri store + IPC + disk read), so the window
   shows blank until that promise settles; and the whole UI ships as a single
   **1.58 MB** JS chunk that must parse before anything paints.
2. **Nav lag** — all 13 screens (plus heavy libs recharts + CodeMirror) are
   eager‑imported into that one chunk, so first paint is heavy and switching
   mounts large trees with no code‑splitting.

S19 fixes both: paint immediately (apply the persisted language asynchronously),
and code‑split the screens + heavy vendor libs so the initial bundle is small and
each screen loads on demand behind a calm fallback. (Note: `pnpm tauri dev` is
inherently slower — unminified, HMR, on‑demand modules — so these gains are most
visible in the release/AppImage build.)

## Alignment with Product Vision

A calm instrument should open fast and feel instant. This realizes the
"production‑ready" bar (the prior audit flagged the 1.5 MB monolith) without
changing any behavior.

## Requirements

### Requirement 1 — Paint is not blocked on async prefs

**User Story:** As a user, I want the window to show the UI immediately, not a
blank screen while settings load.

#### Acceptance Criteria
1. `main.tsx` SHALL render the app immediately (synchronously after `createRoot`),
   NOT inside a `.finally()` after `getLanguagePref()`.
2. The persisted language SHALL be applied asynchronously after first paint
   (i18n is already initialized with a detected/fallback language; `changeLanguage`
   re‑renders when the pref resolves). A failure SHALL remain non‑fatal.
3. There SHALL be no observable regression in the final displayed language.

### Requirement 2 — Code‑split the screens

**User Story:** As a user, I want fast startup and snappy navigation.

#### Acceptance Criteria
1. The 13 screens SHALL be lazy‑loaded (`React.lazy` + dynamic `import()`), so the
   initial bundle excludes screens not yet visited.
2. A `Suspense` boundary around the active screen SHALL show a calm fallback (a
   skeleton/spinner consistent with the app) while a screen chunk loads — never a
   blank white area.
3. Switching to an already‑visited screen SHALL be instant (its chunk is cached);
   a first visit SHALL load its (small) chunk with the fallback.

### Requirement 3 — Heavy vendor libs out of the initial chunk

**User Story:** As a maintainer, I want the initial download small.

#### Acceptance Criteria
1. recharts and CodeMirror (`@uiw/react-codemirror` + `@codemirror/*`) SHALL NOT be
   in the initial chunk; they SHALL load with the screens that use them (via the
   lazy screens and/or `manualChunks`).
2. The production build SHALL no longer emit the "chunk larger than 500 kB"
   warning for the entry chunk; the initial chunk SHALL be a fraction of the
   former 1.58 MB.

### Requirement 4 — No blank flash

**User Story:** As a user, I never want to stare at a white window.

#### Acceptance Criteria
1. From window‑create to first paint, and during any screen‑chunk load, a styled
   surface (the app background + a skeleton/spinner), NOT a blank white page, SHALL
   be shown. (An optional lightweight pre‑React shell in `index.html` MAY cover the
   very first frame.)

## Non-Functional Requirements

### Code Architecture and Modularity
- `main.tsx` render‑now; `src/screens/registry.tsx` switches to `React.lazy`
  factories; `src/app/Window.tsx` wraps `<ActiveScreen />` in `Suspense` with a
  fallback; `vite.config` `build.rollupOptions.output.manualChunks` splits the big
  vendors if Rollup's automatic splitting needs help. No backend/IPC change; no UI
  behavior change.

### Performance
- Initial chunk small (target well under 500 kB); per‑screen chunks load on first
  visit and cache. The release/AppImage build is the measured target.

### Reliability / Testing
- All existing tests stay green (screen tests import components directly, so lazy
  routing doesn't affect them; the Window/router test handles Suspense). The
  production `vite build` is the gate for chunking; a release build is launched to
  confirm fast startup with no white flash.

### Usability
- Identical visuals and behavior; just faster + no blank screen.
