# Design Document — startup-and-nav-perf (S19)

## Overview

Four small, surgical changes: (1) `main.tsx` renders immediately and applies the
persisted language after first paint; (2) `index.html` carries a styled root so
the first frame is the app background, not white; (3) `Window.tsx` wraps the
active screen in `Suspense` with a calm fallback; (4) `registry.tsx` makes the 13
screens `React.lazy`, and `vite.config` buckets the heavy vendors so the initial
chunk is small. Behavior and visuals are unchanged.

## Steering Document Alignment

### Technical Standards (tech.md)
- React `lazy`/`Suspense`, Vite `manualChunks`. No backend/IPC. Reuses i18n's
  post‑init `changeLanguage` re‑render. Tokens for the fallback.

### Project Structure (structure.md)
- Edits: `src/main.tsx`, `index.html`, `src/app/Window.tsx`,
  `src/screens/registry.tsx`, `vite.config.ts`. A small `ScreenFallback` lives in
  `Window.tsx` (or `src/ui`).

## Code Reuse Analysis

### Existing Components to Leverage
- i18n already inits with a fallback/detected language (render‑now is safe). The
  `getScreen(activeScreen)` indirection means only `registry.tsx` changes to make
  screens lazy; `Window.tsx` only adds the `Suspense` wrapper. Theme tokens style
  the fallback.

### Integration Points
- `main.tsx` → render immediately; `registry` lazy factories → `Window` Suspense.
  `vite.config` chunking.

## Architecture

```mermaid
graph TD
    Main[main.tsx: createRoot -> render NOW] --> App
    Main -.->|after paint| Lang[getLanguagePref -> changeLanguage]
    App --> Win[Window]
    Win --> SUS[Suspense fallback=ScreenFallback]
    SUS --> LZ[lazy(screen) -> dynamic import chunk]
    Vite[vite manualChunks] --> Chunks[(small entry + per-screen + vendor chunks)]
```

### Modular Design Principles
- Each change is independent and reversible. No screen's own code changes; only
  how it is imported + when paint happens.

## Components and Interfaces

### main.tsx
- Call `render()` synchronously right after `createRoot`. Then, fire‑and‑forget:
  `void getLanguagePref().then((lng) => lng && lng !== i18n.language ? i18n.changeLanguage(lng) : undefined).catch(() => undefined)` — no `.finally(render)`.

### index.html
- Give `#root` (or `html/body`) the app background color via a tiny inline style /
  `:root` var so the pre‑React frame is the surface, not white. Optionally a
  minimal centered spinner element inside `#root` that React replaces on mount.

### Window.tsx
- `const ActiveScreen = getScreen(activeScreen)` stays; render
  `<Suspense fallback={<ScreenFallback />}><ActiveScreen /></Suspense>`.
  `ScreenFallback` = a full‑height surface with a subtle centered spinner /
  header‑shaped skeleton (token‑only). Keying the Suspense by `activeScreen` is
  optional (a fresh fallback per screen).

### registry.tsx
- Replace each static `import { XScreen }` with
  `const XScreen = lazy(() => import("@/screens/x").then((m) => ({ default: m.XScreen })))`.
  `getScreen` returns the lazy component as today. (`editor`/config‑editor too.)

### vite.config.ts
- Add `build.rollupOptions.output.manualChunks(id)` to bucket `node_modules`:
  a `react` vendor chunk (react/react-dom/scheduler), a `recharts` chunk, a
  `codemirror` chunk (`@codemirror/*` + `@uiw/react-codemirror`), and let the rest
  fall into a small shared vendor chunk — so the entry chunk drops well under
  500 kB and the heavy libs load with the screens that need them.

## Data Models
- None.

## Error Handling
1. **A screen chunk fails to load (offline/disk):** the `Suspense` fallback stays;
   an error boundary (existing app‑level, or a small one) shows a retry rather than
   a white crash. (Reuse any existing error boundary; otherwise the fallback
   persists — acceptable for local chunks.)
2. **`getLanguagePref` rejects:** non‑fatal; the detected/fallback language stands.
3. **Lazy + tests:** screen unit tests import components directly (unaffected); the
   Window/router test wraps in `Suspense` (or awaits the lazy resolve).

## Testing Strategy

### Build (the chunking gate)
- `pnpm exec vite build` SHALL emit a small entry chunk + multiple lazy/vendor
  chunks and NO ">500 kB" warning; assert the entry chunk size dropped sharply
  from 1.58 MB.

### Frontend (Vitest)
- Existing suites stay green. A Window/router test renders an active screen via
  the lazy registry behind `Suspense` and asserts it appears (await the lazy
  load). `main.tsx` change is covered by the app still mounting.

### Manual (release)
- Build the release app and launch it: the window paints the shell + a screen
  quickly with no sustained white screen; navigating loads each screen smoothly.
