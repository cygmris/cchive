//! Usage command: parse the local session logs into a non-secret aggregate.
//!
//! Returns numbers only (token counts, model ids, dates, an estimated cost) —
//! it never reads or returns a credential. The heavy lifting is in
//! `core::usage`; this just resolves the projects dir + today and delegates.

use chrono::Local;

use crate::core::{codex_usage, grok_usage, paths, usage_cache};
use crate::model::{CoreError, GrokUsageSummary, UsageSummary};

/// Aggregate token usage from `~/.claude/projects/**/*.jsonl` over the last
/// `range_days` days (0 ⇒ default 30). Uses the incremental parse cache so only
/// changed files are re-parsed (a cold cache does one full pass). On-disk effect:
/// reads the `.jsonl` logs + reads/writes the non-secret parse cache
/// (`usage-parse-cache.json`, token counts only). Never returns a secret.
#[tauri::command]
pub fn read_usage(range_days: u32) -> Result<UsageSummary, CoreError> {
    let range = if range_days == 0 { 30 } else { range_days };
    let today = Local::now().date_naive();
    Ok(usage_cache::aggregate_incremental(
        &paths::projects_dir(),
        &paths::usage_cache_path(),
        range,
        today,
    ))
}

/// Aggregate Grok spend from `$GROK_HOME/sessions/**/updates.jsonl` plus the
/// weekly credit percent from `unified.jsonl`. Claude `read_usage` is unchanged.
/// Never returns a secret; never reads `auth.json`.
#[tauri::command]
pub fn read_grok_usage(range_days: u32) -> Result<GrokUsageSummary, CoreError> {
    let range = if range_days == 0 { 30 } else { range_days };
    let today = Local::now().date_naive();
    Ok(grok_usage::aggregate_incremental(
        &paths::grok_sessions_dir(),
        &paths::grok_usage_cache_path(),
        &paths::grok_logs_path(),
        range,
        today,
    ))
}

/// Aggregate Codex tokens from `$CODEX_HOME/sessions/**/rollout-*.jsonl`.
/// Same wire shape as Grok (`GrokUsageSummary`); `costUsd` is an OpenAI
/// list-rate estimate. Never returns a secret; never reads `auth.json`; no HTTP.
#[tauri::command]
pub fn read_codex_usage(range_days: u32) -> Result<GrokUsageSummary, CoreError> {
    let range = if range_days == 0 { 30 } else { range_days };
    let today = Local::now().date_naive();
    Ok(codex_usage::aggregate_incremental(
        &paths::codex_sessions_dir(),
        &paths::codex_usage_cache_path(),
        range,
        today,
    ))
}
