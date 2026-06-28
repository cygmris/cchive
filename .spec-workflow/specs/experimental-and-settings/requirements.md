# Requirements Document — experimental-and-settings (S13)

## Introduction

S13 builds the **last two screens** — Experimental and Settings — bringing the design to **100% screen coverage**. Experimental shows an unstable‑features warning + an "Agent Teams" toggle (a Clavis‑tracked experimental flag) that reveals a "Teammate display mode" select. Settings provides a language selector wired to **i18n** (en / 中文 / 繁體中文 / Français / 日本語 — infrastructure + a functional language switch; full translation of every screen is a later quality pass), an appearance section (light/dark + the swappable **accent** and **density** Tweaks), a version row with an update check, and a "Report an issue" link. Tweaks and language persist; appearance/accent/density reuse the S1 theme engine.

## Alignment with Product Vision

Realizes `product.md` Feature 12 (settings & personalization) + the Experimental flags home, and design checklist items **66–72** (Experimental + Settings) and **15–16** (accent + density Tweaks). It completes the calm, personalizable instrument — theme, accent, density, language — and the honest experimental space.

## Requirements

### Requirement 1 — Experimental screen

**User Story:** As a power user, I want a clearly‑labelled home for unstable features, so I can opt in knowingly.

#### Acceptance Criteria
1. The screen SHALL show a warning banner (amber tint + dot): "These settings are unstable. Enable them only if you know what you're doing."
2. It SHALL show an **Agent Teams** card (title + description) with a toggle bound to a Clavis‑tracked experimental flag (persisted via the prefs store); toggling SHALL persist.
3. WHEN Agent Teams is **on** THEN a sub‑row "Teammate display mode" SHALL appear with a select (Auto / In‑process / Split panes (tmux / iTerm2)), persisted.
4. The experimental flags SHALL be Clavis‑local prefs (no Claude Code file is changed by these toggles).

### Requirement 2 — Settings: appearance, accent, density

**User Story:** As a user, I want to personalize the look, so the app fits my taste and eyes.

#### Acceptance Criteria
1. The Settings screen SHALL have an **Appearance** section: a light/dark segmented toggle (mirrors the sidebar switch) bound to the S1 theme engine.
2. It SHALL expose the **accent** Tweak (Clay / Blue / Green / Violet / Ember) and the **density** Tweak (comfortable / compact), bound to the S1 `useTheme` setters, applied live and persisted.

### Requirement 3 — Settings: language / i18n

**User Story:** As a non‑English user, I want to switch the app language, so I can read it comfortably.

#### Acceptance Criteria
1. i18n infrastructure (i18next + react‑i18next) SHALL be set up with locales `en`, `zh-Hans`, `zh-Hant`, `ja`, `fr`; `en` SHALL be the complete baseline and the others SHALL at least carry the Settings/Experimental strings (full translation of all screens is a deferred quality pass).
2. The Settings **Language** select (English / 中文 / 繁體中文 / Français / 日本語) SHALL change the active i18n language live and persist it (and restore on reload).
3. Key user‑visible strings on the Experimental + Settings screens SHALL render via i18n keys (proving the wiring); a missing translation SHALL fall back to English.

### Requirement 4 — Settings: version, update check, support

**User Story:** As a user, I want to see my version and check for updates, so I stay current.

#### Acceptance Criteria
1. The Settings screen SHALL show a **Version** row "Clavis v(version)" + a status chip; a **Check for updates** action SHALL attempt an update check and report "Up to date" / "Update available" / a friendly "updates not configured yet" until the release channel is wired (S14).
2. A **Report an issue** action SHALL open the project's issue URL in the browser (via the Tauri opener/shell, capability‑scoped) — no predecessor URL.
3. The version SHALL come from the app config (single source), not hardcoded twice.

## Non-Functional Requirements

### Code Architecture and Modularity
- Frontend: `src/i18n/` (i18next setup + `locales/*.json`), `src/screens/experimental/`, `src/screens/settings/`, an `experimentalPrefs` slice in the prefs store; the language pref persists via the S1 prefs store. Reuse S1 `useTheme` for appearance/accent/density. The update check uses `tauri-plugin-updater` if present (added in S14) behind a graceful guard. The issue link uses the opener with a narrow capability.
- i18n keys are namespaced per screen; `en` is the source of truth.

### Performance
- Language switch is instant (i18next); theme/accent/density reuse the S1 CSS‑var swaps.

### Security
- Experimental flags + language are Clavis‑local prefs; no Claude Code file changes. The issue link opens a single known URL; the opener capability is narrow (no arbitrary shell).

### Reliability
- Missing translations fall back to English; persisted prefs survive restart and degrade to defaults if corrupt; the update check never crashes if the channel isn't configured.

### Usability
- Sentence case; honest "unstable" warning; live theme/accent/density; the language change is immediate and obvious; the version is shown verbatim.
