//! Usage command: parse the local session logs into a non-secret aggregate.
//!
//! Returns numbers only (token counts, model ids, dates, an estimated cost) —
//! it never reads or returns a credential. The heavy lifting is in
//! `core::usage`; this just resolves the projects dir + today and delegates.

use chrono::Local;

use crate::core::{paths, usage_cache};
use crate::model::{CoreError, UsageSummary};

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
