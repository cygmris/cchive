//! Usage command: parse the local session logs into a non-secret aggregate.
//!
//! Returns numbers only (token counts, model ids, dates, an estimated cost) —
//! it never reads or returns a credential. The heavy lifting is in
//! `core::usage`; this just resolves the projects dir + today and delegates.

use chrono::Local;

use crate::core::{paths, usage};
use crate::model::{CoreError, UsageSummary};

/// Aggregate token usage from `~/.claude/projects/**/*.jsonl` over the last
/// `range_days` days (0 ⇒ default 30). On-disk effect: reads the `.jsonl` logs;
/// writes nothing. Never returns a secret.
#[tauri::command]
pub fn read_usage(range_days: u32) -> Result<UsageSummary, CoreError> {
    let range = if range_days == 0 { 30 } else { range_days };
    let today = Local::now().date_naive();
    Ok(usage::aggregate(&paths::projects_dir(), range, today))
}
