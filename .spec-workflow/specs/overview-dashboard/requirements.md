# Requirements Document — overview-dashboard (S11)

## Introduction

S11 builds the real **Overview** — the "control room" landing screen — now that every data source exists (accounts S4, MCP S8, skills S9, usage S7). It renders the active‑connection hero (account vs provider variant), four clickable stat tiles that deep‑link to their screens, the output‑tokens 30‑day bar chart and the tokens‑by‑model bars (reusing the usage aggregate), and a recent‑activity feed backed by a small Clavis **activity log** appended on key actions (switch, provider apply, MCP/skill toggle or add, memory save). It composes existing hooks; the only new backend is the lightweight activity log.

## Alignment with Product Vision

Realizes `product.md`'s "calm instrument panel" landing and design checklist items **17–23**. It ties the whole app together — one glance shows who you're logged in as, your counts, today's usage, and what changed recently — fulfilling "Monitoring & Visibility."

## Requirements

### Requirement 1 — Active‑connection hero

**User Story:** As a user, I want to see my active identity front and center, so I instantly know who I'm logged in as.

#### Acceptance Criteria
1. The hero card SHALL have an accent left bar and two variants from the active identity (`useActiveIdentity`): **account** (eyebrow "Active account", gradient avatar, name, `email · org`, tier badge e.g. "Claude Max 20×", primary "Manage account" → Configurations) and **provider** (eyebrow "Active configuration", brand chip, title, base URL sub, model badge, primary "Edit config" → Config Editor).
2. A secondary "Switch" button SHALL go to Configurations.
3. The hero SHALL reflect the real active identity and update after a switch.

### Requirement 2 — Stat tiles (real counts, deep‑linking)

**User Story:** As a user, I want at‑a‑glance counts that jump to detail, so I can navigate fast.

#### Acceptance Criteria
1. Four `StatTile`s SHALL show: **Claude accounts** (= saved accounts count, → Configurations), **MCP servers** (= enabled MCP count, → MCP), **Skills** (= enabled skills count, → Skills), **Tokens today** (= today's output tokens formatted, → Usage).
2. The values SHALL come from the existing hooks (`useAccounts`, `useMcpServers`, `useResources('skill')`, `useUsage`) — real data.
3. Each tile SHALL be clickable and navigate to its screen.

### Requirement 3 — Charts

**User Story:** As a user, I want my usage at a glance on the landing screen.

#### Acceptance Criteria
1. An "Output tokens" card SHALL render the 30‑day `OutputBars` chart (reusing the S7 usage aggregate / `useUsage`).
2. A "Tokens by model" card SHALL render horizontal bars of the per‑model totals (model name mono + formatted value + accent fill), from the usage `per_model` data.
3. Empty/no‑usage SHALL render gracefully.

### Requirement 4 — Activity log + recent‑activity feed

**User Story:** As a user, I want to see what recently changed, so I have a quick audit trail.

#### Acceptance Criteria
1. A lightweight Clavis **activity log** SHALL store recent events (capped, e.g. last 50) with `{ kind, message, timestamp }`, written atomically to a Clavis‑managed file; `read_activity(limit)` returns the most recent.
2. Key mutations SHALL append an entry on success (via the queries layer calling an `append_activity` command): account switch ("Switched account to {name}"), provider apply ("Switched to {provider}"), MCP add/toggle ("Added/Enabled/Disabled MCP server {name}"), skill toggle ("Enabled/Disabled skill {name}"), memory save ("Updated memory {path}"). No secrets in messages.
3. The Overview "Recent activity" card SHALL show the latest N entries (icon by kind + message + relative time). Empty → a friendly empty state.

## Non-Functional Requirements

### Code Architecture and Modularity
- Backend: a small `core/activity.rs` (append/read a capped JSON log in the Clavis config dir, atomic) + commands `append_activity`/`read_activity`; DTO in `model.rs`. Frontend: `src/screens/overview/index.tsx` composing existing hooks + `useActivity`/`useAppendActivity` in `queries.ts`; the relevant mutation hooks call `appendActivity` on success. Reuse `OutputBars`, `StatTile`, `Badge`, `Card`, `AccountAvatar`.
- The Overview is composition‑only beyond the activity log.

### Performance
- Counts/usage come from already‑cached queries; the activity log is tiny.

### Security
- Activity messages carry labels only (names/paths), never tokens. Only the Clavis activity file is added; no credential access.

### Reliability
- Missing/corrupt activity log → empty feed, never a crash; the log is capped + atomic. Counts degrade to 0 gracefully.

### Usability
- Mono for machine values + the big stat numerals; relative times ("2h ago", "Yesterday"); sentence‑case messages; the hero's primary action matches the active variant.
