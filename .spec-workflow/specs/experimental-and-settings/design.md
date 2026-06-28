# Design Document — experimental-and-settings (S13)

## Overview

Mostly frontend. Set up **i18next** (en baseline + zh‑Hans/zh‑Hant/ja/fr) wired into the app, with the Settings Language select switching + persisting the language. The **Experimental** screen shows the warning + an Agent Teams toggle (Clavis prefs) revealing a Teammate display mode select. The **Settings** screen adds Appearance (light/dark + accent + density via the S1 `useTheme`), the Language select, a Version row with a guarded update check (real updater wired in S14), and a Report‑an‑issue link via the Tauri opener. No Claude Code files are touched by these screens.

## Steering Document Alignment

### Technical Standards (tech.md)
- Adds `i18next` + `react-i18next` + `i18next-browser-languagedetector`, and `@tauri-apps/plugin-opener` (+ `tauri-plugin-opener` + a narrow capability) for the issue link. Reuses S1 `useTheme` (accent/density/theme already persist) and the S1 prefs store for experimental flags + language. The update check is guarded (no `tauri-plugin-updater` until S14).

### Project Structure (structure.md)
- `src/i18n/index.ts` + `src/i18n/locales/(en,zh-Hans,zh-Hant,ja,fr).json`; `src/screens/experimental/`, `src/screens/settings/`; an `experimental`/`language` slice in `lib/prefs` (or store). `main.tsx` initializes i18n.

## Code Reuse Analysis

### Existing Components to Leverage
- **S1** `useTheme` (theme/accent/density + persistence), `lib/prefs` (persist language + experimental flags), `@/ui` Card, Switch, Select, SegmentedControl, Button, Badge. **S2** the footer theme switch pattern.

### Integration Points
- i18n ↔ all text (start with Experimental + Settings keys); `lib/prefs` persists `language` + `experimental`; `useTheme` for appearance; the opener for the issue URL; a guarded updater check.

## Architecture

```mermaid
graph TD
    Main[main.tsx] --> I18N[i18n: i18next init + locales]
    Exp[screens/experimental] --> Prefs[lib/prefs: experimental flags]
    Set[screens/settings] --> Theme[S1 useTheme: light/dark + accent + density]
    Set --> Lang[i18n changeLanguage + persist]
    Set --> Upd[guarded update check (real in S14)]
    Set --> Open[plugin-opener: issue URL]
```

### Modular Design Principles
- i18n keys namespaced (`settings.*`, `experimental.*`, `common.*`); `en.json` is the source of truth; other locales carry at least these namespaces, fall back to en. Experimental flags + language are small prefs slices. Appearance reuses the existing theme engine (no new theme logic).

## Components and Interfaces

### src/i18n/index.ts
- Initializes i18next with the 5 resources, fallback `en`, language read from prefs (default `en` or browser); exports a `setLanguage(lng)` that calls `i18n.changeLanguage` + persists. `useTranslation()` used in the screens.

### lib/prefs (extend) / store
- `experimental: ( agentTeams: boolean, teammateMode: 'auto'|'inProcess'|'splitPanes' )` + `language: string`, persisted; getters/setters; defaults + corrupt‑safe.

### screens/experimental/index.tsx
- Warning banner (warning tint + dot, i18n text); Agent Teams `Card` (title/desc + `Switch` bound to `experimental.agentTeams`); when on, a sub‑row "Teammate display mode" `Select` (Auto / In‑process / Split panes (tmux / iTerm2)) bound to `experimental.teammateMode`. Persist on change.

### screens/settings/index.tsx
- **Card 1:** Language row (`Select` English/中文/繁體中文/Français/日本語 → `setLanguage`), Appearance row (light/dark `SegmentedControl` via `useTheme`) + accent picker (5 swatches → `setAccent`) + density toggle (`setDensity`), Version row ("Clavis v(appVersion)" + status chip + "Check for updates" → guarded check). **Card 2:** "Contact & support" + "Report an issue" `Button` → opener(issueUrl).
- `appVersion` from a single source (e.g. a generated constant or `@tauri-apps/api/app getVersion`).

## Data Models
- `experimental` + `language` prefs (above). i18n resources are static JSON per locale.

## Error Handling
1. **Missing translation key:** i18next falls back to `en`.
2. **Corrupt prefs:** defaults (language `en`, experimental off/auto).
3. **Update check (no channel yet):** report "updates not configured yet" gracefully (real check in S14).
4. **Opener unavailable (browser):** toast a hint / open via `window.open` fallback.
5. **Off‑Tauri:** everything works (prefs via localStorage fallback; opener via window.open).

## Testing Strategy

### Frontend (Vitest + Testing Library)
- i18n: `setLanguage('fr')` changes a sample translated string; missing key falls back to en. Experimental: Agent Teams toggle persists + reveals the Teammate select; the select persists. Settings: language select calls setLanguage; accent/density buttons call the theme setters; "Report an issue" calls the opener; version renders; the update check reports a state without crashing.

### Manual (desktop)
- Switching language updates the Settings/Experimental strings live; accent/density change the whole app live and persist across restart; Agent Teams reveals the sub‑row; Report an issue opens the URL; the version shows the real app version.
