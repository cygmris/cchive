//! Grok local usage: weekly credits from `unified.jsonl` + incremental spend
//! from `sessions/**/updates.jsonl`.
//!
//! Port of `plasma-agent-usage/contents/code/grok_usage.py` — same offset-scan
//! rules, same `1 USD = 10^10 ticks`. Every `turn_completed` is summed (events
//! are per-turn, not session-cumulative). Claude `core/usage` is not involved.
//!
//! SAFETY: numbers, dates, model ids, and the plan label only. Never reads
//! `auth.json`. ROBUSTNESS: malformed lines and unreadable files are skipped.

use std::collections::BTreeMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Duration, Local, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use walkdir::WalkDir;

use super::atomic_fs;
use crate::model::{
    GrokCredits, GrokDayPoint, GrokModelTotal, GrokTokenTotals, GrokUsageSummary, HeatCell,
};

/// grok binary: `(1 USD = 10^10 ticks)`.
pub const TICKS_PER_USD: f64 = 10_000_000_000.0;
const LOG_TAIL_BYTES: u64 = 512 * 1024;
const CACHE_VERSION: u32 = 1;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct ModelAgg {
    cost: u64,
    calls: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct DayAgg {
    cost: u64,
    tok: u64,
    input: u64,
    output: u64,
    #[serde(rename = "cacheRead")]
    cache_read: u64,
    calls: u64,
    models: BTreeMap<String, ModelAgg>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct FileEntry {
    offset: u64,
    days: BTreeMap<String, DayAgg>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ParseCache {
    version: u32,
    files: BTreeMap<String, FileEntry>,
}

impl Default for ParseCache {
    fn default() -> Self {
        Self {
            version: CACHE_VERSION,
            files: BTreeMap::new(),
        }
    }
}

fn ticks_usd(ticks: u64) -> f64 {
    ticks as f64 / TICKS_PER_USD
}

fn level_of(tokens: u64, max: u64) -> u8 {
    if tokens == 0 || max == 0 {
        return 0;
    }
    let frac = tokens as f64 / max as f64;
    if frac <= 0.25 {
        1
    } else if frac <= 0.5 {
        2
    } else if frac <= 0.75 {
        3
    } else {
        4
    }
}

/// Last billing line in `unified.jsonl` (512 KiB tail). Missing → `None`.
pub fn read_credits(log_path: &Path) -> Option<GrokCredits> {
    let meta = std::fs::metadata(log_path).ok()?;
    let size = meta.len();
    let mut file = File::open(log_path).ok()?;
    let start = size.saturating_sub(LOG_TAIL_BYTES);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf);
    let iter = if start > 0 {
        text.split('\n').skip(1)
    } else {
        text.split('\n').skip(0)
    };
    let mut found: Option<(Value, f64)> = None;
    let mut tier = String::new();
    for line in iter {
        if !line.contains("creditUsagePercent") {
            continue;
        }
        let Ok(rec) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let Some(pct) = rec
            .pointer("/ctx/config/creditUsagePercent")
            .and_then(Value::as_f64)
        else {
            continue;
        };
        if let Some(t) = rec
            .pointer("/ctx/subscriptionTier")
            .and_then(Value::as_str)
        {
            if !t.is_empty() {
                tier = t.to_string();
            }
        }
        found = Some((rec, pct));
    }
    let (rec, percent) = found?;
    let cfg = rec.pointer("/ctx/config")?;
    let period = cfg.get("currentPeriod");
    let period_start = period
        .and_then(|p| p.get("start"))
        .and_then(Value::as_str)
        .or_else(|| cfg.get("billingPeriodStart").and_then(Value::as_str))
        .unwrap_or("")
        .to_string();
    let period_end = period
        .and_then(|p| p.get("end"))
        .and_then(Value::as_str)
        .or_else(|| cfg.get("billingPeriodEnd").and_then(Value::as_str))
        .unwrap_or("")
        .to_string();
    let period_type = period
        .and_then(|p| p.get("type"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let as_of = rec
        .get("ts")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let age_minutes = DateTime::parse_from_rfc3339(&as_of.replace('Z', "+00:00"))
        .ok()
        .map(|t| (Utc::now() - t.with_timezone(&Utc)).num_minutes());
    let subscription_tier = if tier.is_empty() { None } else { Some(tier) };
    Some(GrokCredits {
        percent,
        period_start,
        period_end,
        period_type,
        as_of,
        age_minutes,
        subscription_tier,
    })
}

fn load_cache(path: &Path) -> ParseCache {
    let Ok(text) = std::fs::read_to_string(path) else {
        return ParseCache::default();
    };
    let Ok(cache) = serde_json::from_str::<ParseCache>(&text) else {
        return ParseCache::default();
    };
    if cache.version != CACHE_VERSION {
        return ParseCache::default();
    }
    cache
}

fn save_cache(path: &Path, cache: &ParseCache) {
    let Ok(bytes) = serde_json::to_vec(cache) else {
        return;
    };
    let _ = atomic_fs::atomic_write(path, &bytes, None);
}

fn find_update_files(sessions_dir: &Path) -> Vec<PathBuf> {
    if !sessions_dir.is_dir() {
        return Vec::new();
    }
    let mut out: Vec<PathBuf> = WalkDir::new(sessions_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| e.file_name() == "updates.jsonl")
        .map(|e| e.into_path())
        .collect();
    out.sort();
    out
}

fn add_usage(day: &mut DayAgg, usage: &Value) {
    day.cost += usage.get("costUsdTicks").and_then(Value::as_u64).unwrap_or(0);
    day.tok += usage.get("totalTokens").and_then(Value::as_u64).unwrap_or(0);
    day.input += usage.get("inputTokens").and_then(Value::as_u64).unwrap_or(0);
    day.output += usage.get("outputTokens").and_then(Value::as_u64).unwrap_or(0);
    day.cache_read += usage
        .get("cachedReadTokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    day.calls += usage.get("modelCalls").and_then(Value::as_u64).unwrap_or(0);
    if let Some(map) = usage.get("modelUsage").and_then(Value::as_object) {
        for (mid, mu) in map {
            let m = day.models.entry(mid.clone()).or_default();
            m.cost += mu.get("costUsdTicks").and_then(Value::as_u64).unwrap_or(0);
            m.calls += mu.get("modelCalls").and_then(Value::as_u64).unwrap_or(0);
        }
    }
}

fn local_date_from_unix(ts: i64) -> Option<NaiveDate> {
    DateTime::from_timestamp(ts, 0).map(|dt| dt.with_timezone(&Local).date_naive())
}

fn scan_file(path: &Path, entry: FileEntry) -> FileEntry {
    let Ok(meta) = std::fs::metadata(path) else {
        return entry;
    };
    let size = meta.len();
    let (mut offset, mut days) = if size < entry.offset {
        (0_u64, BTreeMap::new())
    } else {
        (entry.offset, entry.days)
    };
    if size == offset {
        return FileEntry { offset, days };
    }
    let Ok(mut file) = File::open(path) else {
        return FileEntry { offset, days };
    };
    if file.seek(SeekFrom::Start(offset)).is_err() {
        return FileEntry { offset, days };
    }
    let mut chunk = Vec::new();
    if file.read_to_end(&mut chunk).is_err() {
        return FileEntry { offset, days };
    }
    let consumed = if chunk.ends_with(b"\n") {
        chunk.len()
    } else {
        match chunk.iter().rposition(|&b| b == b'\n') {
            Some(cut) => cut + 1,
            None => return FileEntry { offset, days },
        }
    };
    let text = String::from_utf8_lossy(&chunk[..consumed]);
    for line in text.split('\n') {
        if !line.contains("turn_completed") {
            continue;
        }
        let Ok(evt) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let Some(update) = evt.pointer("/params/update") else {
            continue;
        };
        if update.get("sessionUpdate").and_then(Value::as_str) != Some("turn_completed") {
            continue;
        }
        let Some(usage) = update.get("usage") else {
            continue;
        };
        let Some(ts) = evt.get("timestamp").and_then(Value::as_i64) else {
            continue;
        };
        let Some(date) = local_date_from_unix(ts) else {
            continue;
        };
        let key = date.format("%Y-%m-%d").to_string();
        add_usage(days.entry(key).or_default(), usage);
    }
    offset += consumed as u64;
    FileEntry { offset, days }
}

fn merge_day(dst: &mut DayAgg, src: &DayAgg) {
    dst.cost += src.cost;
    dst.tok += src.tok;
    dst.input += src.input;
    dst.output += src.output;
    dst.cache_read += src.cache_read;
    dst.calls += src.calls;
    for (mid, m) in &src.models {
        let e = dst.models.entry(mid.clone()).or_default();
        e.cost += m.cost;
        e.calls += m.calls;
    }
}

/// Incremental aggregate over `sessions_dir`. `today_local` is injected so tests
/// are deterministic. Credits come from `log_path` (optional / missing → None).
pub fn aggregate_incremental(
    sessions_dir: &Path,
    cache_path: &Path,
    log_path: &Path,
    range_days: u32,
    today_local: NaiveDate,
) -> GrokUsageSummary {
    let range_days = if range_days == 0 { 30 } else { range_days };
    let files = find_update_files(sessions_dir);
    let old = load_cache(cache_path);
    let mut fresh = ParseCache::default();
    for path in &files {
        let key = path.to_string_lossy().into_owned();
        let prev = old.files.get(&key).cloned().unwrap_or_default();
        let entry = scan_file(path, prev);
        fresh.files.insert(key, entry);
    }
    save_cache(cache_path, &fresh);

    let mut by_date: BTreeMap<NaiveDate, DayAgg> = BTreeMap::new();
    for entry in fresh.files.values() {
        for (key, day) in &entry.days {
            let Ok(date) = NaiveDate::parse_from_str(key, "%Y-%m-%d") else {
                continue;
            };
            merge_day(by_date.entry(date).or_default(), day);
        }
    }

    let range_start = today_local - Duration::days(range_days as i64 - 1);
    let year_start = today_local - Duration::days(364);

    let mut totals = GrokTokenTotals::default();
    let mut range_models: BTreeMap<String, ModelAgg> = BTreeMap::new();
    let mut per_day = Vec::with_capacity(range_days as usize);
    for i in 0..range_days as i64 {
        let date = range_start + Duration::days(i);
        let day = by_date.get(&date).cloned().unwrap_or_default();
        totals.cost_usd += ticks_usd(day.cost);
        totals.tokens += day.tok;
        totals.input += day.input;
        totals.output += day.output;
        totals.cache_read += day.cache_read;
        totals.calls += day.calls;
        for (mid, m) in &day.models {
            let e = range_models.entry(mid.clone()).or_default();
            e.cost += m.cost;
            e.calls += m.calls;
        }
        per_day.push(GrokDayPoint {
            date: date.format("%Y-%m-%d").to_string(),
            cost_usd: ticks_usd(day.cost),
            tokens: day.tok,
            calls: day.calls,
        });
    }

    let mut per_model: Vec<GrokModelTotal> = range_models
        .into_iter()
        .map(|(model, m)| GrokModelTotal {
            model,
            cost_usd: ticks_usd(m.cost),
            tokens: 0,
            calls: m.calls,
        })
        .collect();
    per_model.sort_by(|a, b| {
        b.cost_usd
            .partial_cmp(&a.cost_usd)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.model.cmp(&b.model))
    });

    let max_day = (0..365i64)
        .filter_map(|i| by_date.get(&(year_start + Duration::days(i))).map(|d| d.tok))
        .max()
        .unwrap_or(0);
    let mut heatmap = Vec::with_capacity(365);
    for i in 0..365i64 {
        let date = year_start + Duration::days(i);
        let tokens = by_date.get(&date).map(|d| d.tok).unwrap_or(0);
        heatmap.push(HeatCell {
            date: date.format("%Y-%m-%d").to_string(),
            tokens,
            level: level_of(tokens, max_day),
        });
    }

    GrokUsageSummary {
        range_days,
        credits: read_credits(log_path),
        totals,
        per_day,
        per_model,
        heatmap,
        unknown_models: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const JWT: &str = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWVyIjo1fQ.sig";

    fn turn(ts: i64, tokens: u64, ticks: u64, model: &str) -> String {
        serde_json::json!({
            "method": "session/update",
            "timestamp": ts,
            "params": {
                "update": {
                    "sessionUpdate": "turn_completed",
                    "usage": {
                        "inputTokens": tokens.saturating_sub(10),
                        "outputTokens": 10u64.min(tokens),
                        "totalTokens": tokens,
                        "cachedReadTokens": 5,
                        "modelCalls": 1,
                        "costUsdTicks": ticks,
                        "modelUsage": { model: { "costUsdTicks": ticks, "modelCalls": 1 } }
                    }
                }
            }
        })
        .to_string()
    }

    fn billing_line(tier: &str, percent: f64) -> String {
        serde_json::json!({
            "msg": "billing: fetched credits config",
            "ts": "2026-09-06T12:00:00Z",
            "ctx": {
                "subscriptionTier": tier,
                "config": {
                    "creditUsagePercent": percent,
                    "currentPeriod": {
                        "type": "USAGE_PERIOD_TYPE_WEEKLY",
                        "start": "2026-08-30T15:02:43Z",
                        "end": "2026-09-06T15:02:43Z"
                    }
                }
            }
        })
        .to_string()
    }

    /// Unix ts for a given NaiveDate at noon UTC (stable across TZ for the date
    /// as long as the test machine isn't ±12h from the chosen noon — we pick
    /// dates far from range edges in assertions that need exact days).
    fn ts_on(date: NaiveDate) -> i64 {
        date.and_hms_opt(12, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp()
    }

    #[test]
    fn two_turns_on_two_dates_sum_not_last_event() {
        let dir = tempfile::tempdir().unwrap();
        let sessions = dir.path().join("sessions/proj/sid");
        std::fs::create_dir_all(&sessions).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 6).unwrap();
        let d0 = today - Duration::days(1);
        let updates = sessions.join("updates.jsonl");
        // 100 tokens / 1 USD, then a LATER larger turn 1000 tokens / 2 USD.
        // Cumulative-last-event would report 1000; we must report 1100.
        let body = format!(
            "{}\n{}\n{JWT}\n",
            turn(ts_on(d0), 100, 10_000_000_000, "grok-4.6-build"),
            turn(ts_on(today), 1000, 20_000_000_000, "grok-4.6-build"),
        );
        std::fs::write(&updates, &body).unwrap();
        let cache = dir.path().join("cache.json");
        let log = dir.path().join("unified.jsonl");
        std::fs::write(&log, billing_line("SuperGrok Heavy", 73.0) + "\n").unwrap();

        let sum = aggregate_incremental(&dir.path().join("sessions"), &cache, &log, 7, today);
        assert_eq!(sum.totals.tokens, 1100, "must SUM turns, not take the last");
        assert!((sum.totals.cost_usd - 3.0).abs() < 1e-9);
        let credits = sum.credits.as_ref().expect("billing fixture");
        assert_eq!(credits.percent, 73.0);
        assert_eq!(credits.subscription_tier.as_deref(), Some("SuperGrok Heavy"));
        let json = serde_json::to_string(&sum).unwrap();
        assert!(!json.contains(JWT), "summary leaked a JWT");
        assert!(!json.contains("refresh_token"));
    }

    #[test]
    fn incremental_append_matches_fresh_scan() {
        let dir = tempfile::tempdir().unwrap();
        let sessions = dir.path().join("sessions/p/s");
        std::fs::create_dir_all(&sessions).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 6).unwrap();
        let updates = sessions.join("updates.jsonl");
        std::fs::write(
            &updates,
            turn(ts_on(today), 50, 5_000_000_000, "grok-4.5-build") + "\n",
        )
        .unwrap();
        let cache = dir.path().join("cache.json");
        let log = dir.path().join("missing.jsonl");
        let first = aggregate_incremental(&dir.path().join("sessions"), &cache, &log, 7, today);
        assert_eq!(first.totals.tokens, 50);
        assert!(first.credits.is_none(), "missing log → quota omitted");

        use std::io::Write;
        let mut f = std::fs::OpenOptions::new()
            .append(true)
            .open(&updates)
            .unwrap();
        writeln!(
            f,
            "{}",
            turn(ts_on(today), 25, 2_500_000_000, "grok-4.5-build")
        )
        .unwrap();
        drop(f);

        let second = aggregate_incremental(&dir.path().join("sessions"), &cache, &log, 7, today);
        let fresh_cache = dir.path().join("cache-fresh.json");
        let fresh = aggregate_incremental(
            &dir.path().join("sessions"),
            &fresh_cache,
            &log,
            7,
            today,
        );
        assert_eq!(second.totals.tokens, 75);
        assert_eq!(second.totals.tokens, fresh.totals.tokens);
        assert!((second.totals.cost_usd - fresh.totals.cost_usd).abs() < 1e-9);
    }

    #[test]
    fn truncation_does_not_go_negative() {
        let dir = tempfile::tempdir().unwrap();
        let sessions = dir.path().join("sessions/p/s");
        std::fs::create_dir_all(&sessions).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 6).unwrap();
        let updates = sessions.join("updates.jsonl");
        let big = format!(
            "{}\n{}\n",
            turn(ts_on(today), 800, 8_000_000_000, "grok-4.6-build"),
            turn(ts_on(today), 200, 2_000_000_000, "grok-4.6-build"),
        );
        std::fs::write(&updates, &big).unwrap();
        let cache = dir.path().join("cache.json");
        let log = dir.path().join("nolog");
        let full = aggregate_incremental(&dir.path().join("sessions"), &cache, &log, 7, today);
        assert_eq!(full.totals.tokens, 1000);

        let small = turn(ts_on(today), 40, 400_000_000, "grok-4.6-build") + "\n";
        std::fs::write(&updates, &small).unwrap();
        let after = aggregate_incremental(&dir.path().join("sessions"), &cache, &log, 7, today);
        assert_eq!(after.totals.tokens, 40, "truncation must rescan, not subtract");
        assert!(after.totals.cost_usd > 0.0);
    }
}
