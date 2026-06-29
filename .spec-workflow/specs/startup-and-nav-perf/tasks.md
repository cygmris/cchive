# Tasks Document — startup-and-nav-perf (S19)

> Fix the startup white screen + nav lag: paint immediately (language applied async), code-split the 13 screens behind a calm Suspense fallback, and chunk the heavy vendors (recharts, CodeMirror) out of the entry bundle. Behavior + visuals UNCHANGED; no backend change. Keep all existing tests green (184 TS). Tokens only. Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. Paint immediately + no white flash + Suspense fallback
  - Files: `src/main.tsx` (modify), `index.html` (modify), `src/app/Window.tsx` (modify)
  - Purpose: kill the startup blank wait
  - _Leverage: i18n already inits with a fallback language; theme tokens_
  - _Requirements: 1.1, 1.2, 1.3, 2.2, 4.1_
  - _Prompt: Implement the task for spec startup-and-nav-perf, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend engineer | Task: In src/main.tsx call render() synchronously right after createRoot (do NOT gate it inside .finally after getLanguagePref); then fire-and-forget apply the persisted language: void getLanguagePref().then((lng) => (lng AND lng !== i18n.language ? i18n.changeLanguage(lng) : undefined)).catch(() => undefined). In index.html give #root (or html/body) the app background color via a tiny inline style so the pre-React frame is the surface (not white); optionally a minimal centered spinner element inside #root that React replaces on mount (match dark/light via a CSS var or prefers-color-scheme). In src/app/Window.tsx add a small ScreenFallback component (full-height surface + a subtle centered spinner / header-shaped skeleton, token-only) and wrap the active screen: Suspense fallback=(ScreenFallback) wrapping (ActiveScreen). | Restrictions: no behavior/visual change to the screens; the final displayed language must be unchanged; tokens only (no hardcoded hex except the index.html bg which may use the same token value). | Success: tsc clean; app paints immediately; no blank white frame._

- [x] 2. Lazy-load the 13 screens + chunk the heavy vendors
  - Files: `src/screens/registry.tsx` (modify), `vite.config.ts` (modify)
  - Purpose: shrink the entry bundle; load screens on demand
  - _Leverage: getScreen indirection; Rollup manualChunks_
  - _Requirements: 2.1, 2.3, 3.1, 3.2_
  - _Prompt: Implement the task for spec startup-and-nav-perf, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend build engineer | Task: In src/screens/registry.tsx replace every static screen import with a React.lazy factory, e.g. const OverviewScreen = lazy(() => import("@/screens/overview").then((m) => (( default: m.OverviewScreen )))) — for all 13 (overview/configurations/config-editor/projects/mcp/agents/commands/skills/memory/usage/notifications/experimental/settings); keep getScreen returning the (now lazy) component so Window.tsx is unchanged beyond its Suspense wrapper (task 1). In vite.config.ts add build.rollupOptions.output.manualChunks(id) bucketing node_modules: a react vendor chunk (react/react-dom/scheduler), a recharts chunk, a codemirror chunk (@codemirror/* + @uiw/react-codemirror), letting the rest fall into a small shared vendor chunk. | Restrictions: do NOT change any screen component; lazy must use the named export via the (( default )) wrapper; keep import("@/...") alias paths. | Success: pnpm exec vite build emits a SMALL entry chunk + per-screen/vendor chunks and NO ">500 kB" warning; tsc clean._

- [x] 3. Tests + verify (bundle + suite)
  - Files: `src/app/Window.test.tsx` (new or modify), (verify) repo
  - Purpose: lock lazy routing + prove the chunking win
  - _Leverage: Vitest + Testing Library (Suspense-aware), the vite build report_
  - _Requirements: 2.1, 2.2, 3.2_
  - _Prompt: Implement the task for spec startup-and-nav-perf, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend QA + build engineer | Task: Add/extend a Window (router) test that renders the shell with an active screen via the lazy registry behind Suspense and asserts the screen content appears (await the lazy resolve with findBy*); assert the Suspense fallback shows while pending if feasible. Then VERIFY and report EXACT numbers: pnpm exec tsc --noEmit (0); pnpm test (green, file+test counts); pnpm exec vite build — report the entry chunk size + the new per-screen/vendor chunk list and confirm NO ">500 kB" warning (compare to the old 1.58 MB single chunk). Fingerprint grep over touched files -> zero. Do NOT git commit (the orchestrator builds the release app, measures startup, screenshots, commits). | Restrictions: behavior not implementation; fix don't suppress; do not commit. | Success: all gates green; entry chunk sharply smaller; lazy routing asserted._
