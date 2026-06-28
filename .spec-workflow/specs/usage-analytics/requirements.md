# Requirements Document — usage-analytics (S7)

## Introduction

S7 delivers token‑usage analytics: a Rust backend that streams and aggregates the Claude Code session logs (`~/.claude/projects/**/*.jsonl`) into per‑day, per‑model token and cost figures, and the **Usage** screen that visualizes them — four stat tiles (input / output / cache‑read / estimated cost), an "output tokens per day" bar chart, a GitHub‑style yearly contribution heatmap, a 30/7‑day range toggle, and a refresh. Cost is computed (the logs carry no cost) from a per‑model pricing table. It is promoted ahead of the Overview because Overview's tiles and charts consume the same aggregates. All values are non‑secret counts; nothing here reads credentials.

## Alignment with Product Vision

Realizes `product.md` Feature 9 (usage analytics — an instrument readout, not marketing) and design checklist items **59–63**. It gives the cost‑/usage‑conscious user a true picture of consumption per day and model, and produces the token data the Overview dashboard will reuse. It honors "show the machine truth" (mono numerals, real tokens) and "local & private" (parses local files only).

## Requirements

### Requirement 1 — Stream‑parse the session logs (correct & efficient)

**User Story:** As a user, I want accurate usage from my real sessions, so the numbers reflect what I actually used.

#### Acceptance Criteria
1. The backend SHALL recursively read `~/.claude/projects/**/*.jsonl` (honoring `CLAUDE_CONFIG_DIR`), parsing line‑by‑line (streaming, not loading whole files into memory), and consider only assistant lines that carry `message.usage`.
2. For each counted line it SHALL extract `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, the `message.model`, and the `timestamp` (ISO‑8601), bucketing by **local date**.
3. It SHALL **deduplicate** by `requestId` + `message.id` so retried/streamed duplicates are not double‑counted.
4. Malformed/partial lines SHALL be skipped without failing the whole parse; an unreadable file SHALL be skipped with the rest still counted.
5. Parsing SHALL complete promptly for a realistic history; results MAY be cached and refreshed on demand (the refresh action re‑reads).

### Requirement 2 — Aggregate + cost

**User Story:** As a cost‑conscious user, I want totals, per‑day, per‑model, and an estimated cost, so I can see where tokens go.

#### Acceptance Criteria
1. The backend SHALL produce: totals (input / output / cache‑creation / cache‑read) over the selected range; a per‑day series (date → output tokens, and the other token kinds) for the last N days; a per‑model breakdown (model → total tokens) ranked; and a per‑day map for the past year (for the heatmap).
2. It SHALL compute an **estimated cost** = Σ over models of (tokens × per‑model unit price), using a maintained pricing table (input/output/cache rates per known model), with unknown models priced at 0 (and flagged) rather than failing.
3. A `read_usage(rangeDays)` command SHALL return these aggregates as plain numbers (no secrets); a `read_usage_heatmap()` (or a field on read_usage) SHALL return the past‑year per‑day counts.
4. Cost and token math SHALL be unit‑tested against fixture jsonl (including a duplicate `requestId` that must be counted once, and a cache line).

### Requirement 3 — Usage screen

**User Story:** As a user, I want the Usage screen from the design, so I can read my consumption at a glance.

#### Acceptance Criteria
1. The screen SHALL show a sticky header + one‑liner, a **range segmented toggle "30 days / 7 days"**, and a **refresh** icon button that re‑runs the parse.
2. It SHALL show **four stat tiles** with colored dots: **Input tokens**, **Output tokens**, **Cache read**, **Est. cost** ($), each a label + a Geist‑Mono numeral (formatted, e.g. 84.2M, $128.40).
3. It SHALL show an **"output tokens per day"** bar chart for the selected range (last bar = today, accent; others accent@~62%) with a per‑bar tooltip.
4. It SHALL show an **Activity heatmap** — a GitHub‑style 53‑weeks × 7‑days contribution grid ("Daily token usage · past year") in 5 accent‑tinted levels with a Less … More legend, recoloring with the active accent + theme.
5. WHEN the range toggle changes THEN the tiles + bar chart SHALL re‑slice to the new range; WHEN refresh is used THEN the data SHALL re‑parse and update.
6. Empty/no‑usage SHALL render gracefully (zeros + an empty heatmap), and off‑Tauri (gallery) SHALL use a labelled demo series.

### Requirement 4 — Wire counts into the shell

**User Story:** As a user, I want the status bar / future Overview to reflect real token totals, so the chrome isn't stuck at zero.

#### Acceptance Criteria
1. The "tokens today" value the status bar shows SHALL be sourced from the usage aggregate (today's output tokens), replacing the S2 placeholder, via the queries layer.
2. The aggregate SHALL be exposed through a query hook reusable by the Overview dashboard later (totals + per‑day + per‑model).

## Non-Functional Requirements

### Code Architecture and Modularity
- Backend: a `core/usage.rs` (streaming parser + aggregation + pricing) + a `commands` entry; pricing table in one place (a `usage_pricing` map), easy to update. Frontend: the Usage screen under `src/screens/usage/`, a reusable `Heatmap` chart in `@/ui/charts`, and `useUsage(range)` in `queries.ts`.
- The parser SHALL be pure/streaming and unit‑testable over fixture files.

### Performance
- Streaming line parse; bounded memory regardless of history size; results cached with on‑demand refresh; the screen stays responsive.

### Security
- Reads only local jsonl (no secrets, no network). Returns only aggregate numbers. No credential access.

### Reliability
- Robust to malformed lines, missing files, unknown models (priced 0 + flagged), and empty history (zeros). Dedup is mandatory and tested.

### Usability
- Mono numerals for counts/cost; honest "estimated" wording on cost; accurate per‑range slicing; the heatmap recolors with the chosen accent and theme; quick, unfussy chart motion.
