# Tasks Document — experimental-and-settings (S13)

> The last two screens (Experimental + Settings) → 100% screen coverage. i18n infra (en baseline + 4 locales, functional language switch; full translation is a later pass). Experimental flags + language are Clavis-local prefs (NO Claude Code file changes). Appearance reuses the S1 theme engine. Tokens-only styling. Identity app.clavis, no predecessor fingerprints/URLs. Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. i18n infrastructure + opener plugin + language pref
  - Files: `src/i18n/index.ts` (new), `src/i18n/locales/en.json` + `zh-Hans.json` + `zh-Hant.json` + `ja.json` + `fr.json` (new), `src/main.tsx` (modify), `src/lib/prefs.ts` (modify), `package.json` (modify), `src-tauri/Cargo.toml` (modify), `src-tauri/src/lib.rs` (modify), `src-tauri/capabilities/default.json` (modify)
  - Purpose: working i18n + the opener for the issue link + a persisted language pref
  - _Leverage: src/lib/prefs.ts (S1), @/theme_
  - _Requirements: 3.1, 3.2, 3.3, 4.2_
  - _Prompt: Implement the task for spec experimental-and-settings, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend i18n engineer | Task: pnpm add i18next react-i18next i18next-browser-languagedetector @tauri-apps/plugin-opener; add tauri-plugin-opener to src-tauri/Cargo.toml + register it in lib.rs + grant the opener URL permission in capabilities/default.json (narrow). Create src/i18n/index.ts initializing i18next with 5 resources (en, zh-Hans, zh-Hant, ja, fr), fallbackLng en, and a setLanguage(lng) that calls i18n.changeLanguage + persists via prefs (a "language" pref). Create src/i18n/locales/*.json: en.json is the complete baseline with namespaced keys for the Settings + Experimental screens (settings.*, experimental.*, common.*); the other 4 carry at least those namespaces translated (settings/experimental strings — translate accurately; ok to leave deep-app strings to en for now). Initialize i18n in main.tsx (import before App; read persisted language). Add a language pref accessor to src/lib/prefs.ts. | Restrictions: en is the source of truth; missing keys fall back to en; no predecessor strings/URLs. | Success: tsc clean; changeLanguage swaps the Settings/Experimental text; language persists._

- [x] 2. Experimental screen + experimental prefs
  - Files: `src/screens/experimental/index.tsx`, `src/lib/prefs.ts` (modify)
  - Purpose: the Experimental screen
  - _Leverage: @/ui (Card, Switch, Select), src/i18n (useTranslation), src/lib/prefs.ts, research/design-inventory.md §13_
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _Prompt: Implement the task for spec experimental-and-settings, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Add an experimental prefs slice to src/lib/prefs.ts (agentTeams: boolean default false; teammateMode: "auto"|"inProcess"|"splitPanes" default auto) with get/set, corrupt-safe. Replace the experimental placeholder (src/screens/experimental/index.tsx): a warning banner (warning tint + dot) with the i18n unstable-features text; an "Agent Teams" Card (title + description) + a Switch bound to the experimental.agentTeams pref (persist on change); when on, a sub-row "Teammate display mode" + a Select (Auto / In-process / Split panes (tmux / iTerm2)) bound to experimental.teammateMode. Use useTranslation for the labels. | Restrictions: Clavis-local prefs only (NO Claude Code file writes); tokens only; persist on change. | Success: matches design §13; Agent Teams toggle persists + reveals the select; select persists._

- [x] 3. Settings screen (language + appearance/accent/density + version + support)
  - Files: `src/screens/settings/index.tsx`
  - Purpose: the Settings screen
  - _Leverage: @/ui (Card, Select, SegmentedControl, Button, Badge), @/theme useTheme, src/i18n (setLanguage, useTranslation), @tauri-apps/plugin-opener, research/design-inventory.md §14, §17 (accents/density)_
  - _Requirements: 2.1, 2.2, 3.2, 4.1, 4.2, 4.3_
  - _Prompt: Implement the task for spec experimental-and-settings, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend developer | Task: Replace the settings placeholder (src/screens/settings/index.tsx). Card 1 rows: Language (Select English/中文/繁體中文/Français/日本語 -> setLanguage + persist), Appearance (light/dark SegmentedControl via useTheme; an accent picker = 5 swatches Clay/Blue/Green/Violet/Ember -> setAccent showing the active one; a density toggle comfortable/compact -> setDensity), Version ("Clavis v"+appVersion from @tauri-apps/api/app getVersion (fallback "1.0.0") + a status chip + a "Check for updates" Button that calls a guarded check -> reports "Up to date"/"updates not configured yet" without crashing (real updater is S14)). Card 2: "Contact & support" + a "Report an issue" Button -> open the project issue URL via @tauri-apps/plugin-opener (window.open fallback off-Tauri). Use useTranslation for labels. | Restrictions: accent/density/theme via the S1 engine (live + persisted); no predecessor URL; tokens only. | Success: matches design §14; language/appearance/accent/density work live; version shows; report-issue opens the URL._

- [x] 4. Tests (frontend)
  - Files: `src/screens/settings/Settings.test.tsx`, `src/screens/experimental/Experimental.test.tsx`, `src/i18n/i18n.test.ts`
  - Purpose: lock i18n + the two screens
  - _Leverage: Vitest + Testing Library, mocked opener_
  - _Requirements: 1.2, 1.3, 2.2, 3.2_
  - _Prompt: Implement the task for spec experimental-and-settings, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Frontend QA engineer | Task: i18n.test.ts: setLanguage("fr") changes a sample translated value; a missing key falls back to en. Experimental.test.tsx: Agent Teams toggle reveals the Teammate select + persists (mock prefs). Settings.test.tsx: language select calls setLanguage; clicking an accent swatch calls setAccent and density toggle calls setDensity (spy useTheme); "Report an issue" calls the opener (mocked); version renders. | Restrictions: behavior not implementation; headless; mock opener/prefs. | Success: pnpm test green incl. new suites._

- [x] 5. Verify, fingerprint audit (+ 100% screen coverage check)
  - Files: (verify) whole repo
  - Purpose: prove S13 builds, tests pass, no fingerprints, and all 13 screens are real
  - _Leverage: tech.md de-fingerprint rules, research/design-inventory.md §19_
  - _Requirements: all_
  - _Prompt: Implement the task for spec experimental-and-settings, first run spec-workflow-guide to get the workflow guide then implement the task: Role: Release engineer | Task: Run pnpm exec tsc --noEmit (0), pnpm test (green), cd src-tauri && cargo build (clean), pnpm exec vite build (clean). Fingerprint grep over src + src-tauri/src + configs -> zero (also assert no predecessor issue URL). Confirm the 13 screens (overview/configurations/config-editor/projects/mcp/agents/commands/skills/memory/usage/notifications/experimental/settings) all have real (non-placeholder) index.tsx — grep for "coming soon"/ScreenPlaceholder in src/screens/*/index.tsx and assert none remain. Report exact pass/fail + the screen-coverage result. (The orchestrator launches the window, screenshots Settings, commits.) | Restrictions: fix don't suppress; do not commit. | Success: all gates green; zero fingerprints; all 13 screens real._
