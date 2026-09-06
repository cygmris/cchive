//! Codex local usage from `sessions/**/rollout-*.jsonl`.
//!
//! Sum `token_usage_record.payload.usage` (per-response). If a file has none,
//! sum `token_count` `last_token_usage` instead. Never sum `thread_token_usage`
//! / `total_token_usage` (those are running totals). Cost is always 0 — the
//! logs have no USD. No `auth.json`. No HTTP.
//!
//! SAFETY: numbers, dates, model ids, plan label only.
//! ROBUSTNESS: malformed lines and unreadable files are skipped.

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

const CACHE_VERSION: u32 = 1;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct ModelAgg {
    tok: u64,
    calls: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct DayAgg {
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
    #[serde(default, rename = "lastModel")]
    last_model: String,
    #[serde(default, rename = "hasTur")]
    has_tur: bool,
    days: BTreeMap<String, DayAgg>,
    #[serde(default, rename = "limitsAsOf")]
    limits_as_of: String,
    #[serde(default)]
    percent: Option<f64>,
    #[serde(default, rename = "resetsAt")]
    resets_at: Option<i64>,
    #[serde(default)]
    plan: String,
    #[serde(default, rename = "windowMinutes")]
    window_minutes: Option<u64>,
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

fn as_u64(v: &Value) -> u64 {
    v.as_u64()
        .or_else(|| v.as_i64().and_then(|n| u64::try_from(n).ok()))
        .unwrap_or(0)
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

fn find_rollout_files(sessions_dir: &Path) -> Vec<PathBuf> {
    if !sessions_dir.is_dir() {
        return Vec::new();
    }
    let mut out: Vec<PathBuf> = WalkDir::new(sessions_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            let n = e.file_name().to_string_lossy();
            n.starts_with("rollout-") && n.ends_with(".jsonl")
        })
        .map(|e| e.into_path())
        .collect();
    out.sort();
    out
}

fn add_tokens(day: &mut DayAgg, usage: &Value, model: &str) {
    let input = usage
        .get("input_tokens")
        .map(as_u64)
        .unwrap_or(0);
    let output = usage
        .get("output_tokens")
        .map(as_u64)
        .unwrap_or(0);
    let cache = usage
        .get("cached_input_tokens")
        .map(as_u64)
        .unwrap_or(0);
    let tot = usage.get("total_tokens").map(as_u64).unwrap_or(input + output);
    day.input += input;
    day.output += output;
    day.cache_read += cache;
    day.tok += tot;
    day.calls += 1;
    let mid = if model.is_empty() { "codex" } else { model };
    let m = day.models.entry(mid.to_string()).or_default();
    m.tok += tot;
    m.calls += 1;
}

fn local_date_from_iso(ts: &str) -> Option<NaiveDate> {
    DateTime::parse_from_rfc3339(ts)
        .ok()
        .map(|dt| dt.with_timezone(&Local).date_naive())
}

fn apply_limits(entry: &mut FileEntry, ts: &str, rate_limits: &Value, plan: &str) {
    if ts <= entry.limits_as_of.as_str() && !entry.limits_as_of.is_empty() {
        return;
    }
    let primary = rate_limits.get("primary").or_else(|| rate_limits.get("rate_limit"));
    let Some(primary) = primary else {
        return;
    };
    let Some(percent) = primary
        .get("used_percent")
        .and_then(Value::as_f64)
        .or_else(|| primary.get("used_percent").and_then(Value::as_u64).map(|n| n as f64))
    else {
        return;
    };
    entry.limits_as_of = ts.to_string();
    entry.percent = Some(percent);
    entry.resets_at = primary
        .get("resets_at")
        .and_then(Value::as_i64)
        .or_else(|| primary.get("resets_at").and_then(Value::as_u64).map(|n| n as i64));
    entry.window_minutes = primary.get("window_minutes").and_then(Value::as_u64);
    if !plan.is_empty() {
        entry.plan = plan.to_string();
    } else if let Some(p) = rate_limits.get("plan_type").and_then(Value::as_str) {
        entry.plan = p.to_string();
    }
}

fn scan_file(path: &Path, entry: FileEntry) -> FileEntry {
    let Ok(meta) = std::fs::metadata(path) else {
        return entry;
    };
    let size = meta.len();
    let (offset, days, last_model, has_tur) = if size < entry.offset {
        (0_u64, BTreeMap::new(), String::new(), false)
    } else {
        (entry.offset, entry.days, entry.last_model, entry.has_tur)
    };
    let limits_as_of = if size < entry.offset {
        String::new()
    } else {
        entry.limits_as_of
    };
    let percent = if size < entry.offset { None } else { entry.percent };
    let resets_at = if size < entry.offset { None } else { entry.resets_at };
    let plan = if size < entry.offset {
        String::new()
    } else {
        entry.plan
    };
    let window_minutes = if size < entry.offset {
        None
    } else {
        entry.window_minutes
    };

    if size == offset {
        return FileEntry {
            offset,
            last_model,
            has_tur,
            days,
            limits_as_of,
            percent,
            resets_at,
            plan,
            window_minutes,
        };
    }
    let Ok(mut file) = File::open(path) else {
        return FileEntry {
            offset,
            last_model,
            has_tur,
            days,
            limits_as_of,
            percent,
            resets_at,
            plan,
            window_minutes,
        };
    };
    if file.seek(SeekFrom::Start(offset)).is_err() {
        return FileEntry {
            offset,
            last_model,
            has_tur,
            days,
            limits_as_of,
            percent,
            resets_at,
            plan,
            window_minutes,
        };
    }
    let mut chunk = Vec::new();
    if file.read_to_end(&mut chunk).is_err() {
        return FileEntry {
            offset,
            last_model,
            has_tur,
            days,
            limits_as_of,
            percent,
            resets_at,
            plan,
            window_minutes,
        };
    }
    let consumed = if chunk.ends_with(b"\n") {
        chunk.len()
    } else {
        match chunk.iter().rposition(|&b| b == b'\n') {
            Some(cut) => cut + 1,
            None => {
                return FileEntry {
                    offset,
                    last_model,
                    has_tur,
                    days,
                    limits_as_of,
                    percent,
                    resets_at,
                    plan,
                    window_minutes,
                };
            }
        }
    };

    // First tur in a file that was previously token_count-only → rescan, otherwise
    // prefix days (from last_token_usage) would double-count with tur.
    if !has_tur && std::str::from_utf8(&chunk[..consumed]).map(|s| s.contains("token_usage_record")).unwrap_or(false)
    {
        return scan_file(
            path,
            FileEntry {
                offset: 0,
                last_model: String::new(),
                has_tur: true,
                days: BTreeMap::new(),
                limits_as_of: String::new(),
                percent: None,
                resets_at: None,
                plan: String::new(),
                window_minutes: None,
            },
        );
    }

    let text = String::from_utf8_lossy(&chunk[..consumed]);
    let mut scratch = FileEntry {
        offset,
        last_model: last_model.clone(),
        has_tur,
        days,
        limits_as_of,
        percent,
        resets_at,
        plan,
        window_minutes,
    };

    for line in text.split('\n') {
        if line.is_empty() {
            continue;
        }
        let is_tur = line.contains("token_usage_record");
        let is_count = line.contains("\"token_count\"");
        let is_ctx = line.contains("\"turn_context\"");
        if !is_tur && !is_count && !is_ctx {
            continue;
        }
        let Ok(evt) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let ts = evt.get("timestamp").and_then(Value::as_str).unwrap_or("");
        let typ = evt.get("type").and_then(Value::as_str).unwrap_or("");
        let payload = evt.get("payload").cloned().unwrap_or(Value::Null);

        if typ == "turn_context" {
            if let Some(m) = payload.get("model").and_then(Value::as_str) {
                if !m.is_empty() {
                    scratch.last_model = m.to_string();
                }
            }
            continue;
        }

        if typ == "token_usage_record" {
            scratch.has_tur = true;
            let Some(usage) = payload.get("usage") else {
                continue;
            };
            let Some(date) = local_date_from_iso(ts) else {
                continue;
            };
            let key = date.format("%Y-%m-%d").to_string();
            add_tokens(
                scratch.days.entry(key).or_default(),
                usage,
                &scratch.last_model,
            );
            continue;
        }

        if typ == "event_msg" && payload.get("type").and_then(Value::as_str) == Some("token_count")
        {
            let plan = payload
                .get("rate_limits")
                .and_then(|r| r.get("plan_type"))
                .and_then(Value::as_str)
                .unwrap_or("");
            if let Some(rl) = payload.get("rate_limits") {
                apply_limits(&mut scratch, ts, rl, plan);
            }
            if scratch.has_tur {
                continue;
            }
            let Some(usage) = payload.pointer("/info/last_token_usage") else {
                continue;
            };
            let Some(date) = local_date_from_iso(ts) else {
                continue;
            };
            let key = date.format("%Y-%m-%d").to_string();
            add_tokens(
                scratch.days.entry(key).or_default(),
                usage,
                &scratch.last_model,
            );
        }
    }

    scratch.offset = offset + consumed as u64;
    scratch
}

fn merge_day(dst: &mut DayAgg, src: &DayAgg) {
    dst.tok += src.tok;
    dst.input += src.input;
    dst.output += src.output;
    dst.cache_read += src.cache_read;
    dst.calls += src.calls;
    for (mid, m) in &src.models {
        let e = dst.models.entry(mid.clone()).or_default();
        e.tok += m.tok;
        e.calls += m.calls;
    }
}

fn credits_from_entry(e: &FileEntry) -> Option<GrokCredits> {
    let percent = e.percent?;
    let as_of = e.limits_as_of.clone();
    if as_of.is_empty() {
        return None;
    }
    let period_end = e
        .resets_at
        .and_then(|s| DateTime::from_timestamp(s, 0))
        .map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
        .unwrap_or_default();
    let age_minutes = DateTime::parse_from_rfc3339(&as_of.replace('Z', "+00:00"))
        .ok()
        .map(|t| (Utc::now() - t.with_timezone(&Utc)).num_minutes());
    let period_type = e
        .window_minutes
        .map(|m| format!("{m}m"))
        .unwrap_or_default();
    let subscription_tier = if e.plan.is_empty() {
        None
    } else {
        Some(e.plan.clone())
    };
    Some(GrokCredits {
        percent,
        period_start: String::new(),
        period_end,
        period_type,
        as_of,
        age_minutes,
        subscription_tier,
    })
}

/// Incremental aggregate over Codex `sessions_dir`. `today_local` is injected
/// so tests are deterministic. Cost is always 0.
pub fn aggregate_incremental(
    sessions_dir: &Path,
    cache_path: &Path,
    range_days: u32,
    today_local: NaiveDate,
) -> GrokUsageSummary {
    let range_days = if range_days == 0 { 30 } else { range_days };
    let files = find_rollout_files(sessions_dir);
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
    let mut best_credits: Option<GrokCredits> = None;
    for entry in fresh.files.values() {
        for (key, day) in &entry.days {
            let Ok(date) = NaiveDate::parse_from_str(key, "%Y-%m-%d") else {
                continue;
            };
            merge_day(by_date.entry(date).or_default(), day);
        }
        if let Some(c) = credits_from_entry(entry) {
            let better = match &best_credits {
                None => true,
                Some(old) => c.as_of > old.as_of,
            };
            if better {
                best_credits = Some(c);
            }
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
        totals.tokens += day.tok;
        totals.input += day.input;
        totals.output += day.output;
        totals.cache_read += day.cache_read;
        totals.calls += day.calls;
        for (mid, m) in &day.models {
            let e = range_models.entry(mid.clone()).or_default();
            e.tok += m.tok;
            e.calls += m.calls;
        }
        per_day.push(GrokDayPoint {
            date: date.format("%Y-%m-%d").to_string(),
            cost_usd: 0.0,
            tokens: day.tok,
            calls: day.calls,
        });
    }

    let mut per_model: Vec<GrokModelTotal> = range_models
        .into_iter()
        .map(|(model, m)| GrokModelTotal {
            model,
            cost_usd: 0.0,
            tokens: m.tok,
            calls: m.calls,
        })
        .collect();
    per_model.sort_by(|a, b| {
        b.tokens
            .cmp(&a.tokens)
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
        credits: best_credits,
        totals,
        per_day,
        per_model,
        heatmap,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const JWT: &str = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWVyIjo1fQ.sig";

    fn tur(ts: &str, input: u64, output: u64, thread_tot: u64) -> String {
        serde_json::json!({
            "timestamp": ts,
            "type": "token_usage_record",
            "payload": {
                "usage": {
                    "input_tokens": input,
                    "cached_input_tokens": 10,
                    "output_tokens": output,
                    "total_tokens": input + output
                },
                "thread_token_usage": { "total_tokens": thread_tot }
            }
        })
        .to_string()
    }

    fn token_count(ts: &str, last_in: u64, last_out: u64, total: u64, pct: f64) -> String {
        serde_json::json!({
            "timestamp": ts,
            "type": "event_msg",
            "payload": {
                "type": "token_count",
                "info": {
                    "last_token_usage": {
                        "input_tokens": last_in,
                        "cached_input_tokens": 1,
                        "output_tokens": last_out,
                        "total_tokens": last_in + last_out
                    },
                    "total_token_usage": { "total_tokens": total }
                },
                "rate_limits": {
                    "plan_type": "pro",
                    "primary": {
                        "used_percent": pct,
                        "window_minutes": 10080,
                        "resets_at": 1781759888
                    }
                }
            }
        })
        .to_string()
    }

    fn turn_ctx(ts: &str, model: &str) -> String {
        serde_json::json!({
            "timestamp": ts,
            "type": "turn_context",
            "payload": { "model": model, "turn_id": "t1" }
        })
        .to_string()
    }

    fn write_rollout(dir: &Path, name: &str, body: &str) -> PathBuf {
        let sessions = dir.join("sessions/2026/09/06");
        std::fs::create_dir_all(&sessions).unwrap();
        let p = sessions.join(name);
        std::fs::write(&p, body).unwrap();
        p
    }

    #[test]
    fn two_tur_sum_not_last_thread_total() {
        let dir = tempfile::tempdir().unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 6).unwrap();
        write_rollout(
            dir.path(),
            "rollout-a.jsonl",
            &format!(
                "{}\n{}\n{JWT}\n",
                tur("2026-09-05T12:00:00Z", 100, 10, 110),
                tur("2026-09-06T12:00:00Z", 1000, 20, 999_999),
            ),
        );
        let cache = dir.path().join("cache.json");
        let sum = aggregate_incremental(&dir.path().join("sessions"), &cache, 7, today);
        assert_eq!(sum.totals.tokens, 1130, "must SUM usage, not last thread total");
        assert_eq!(sum.totals.cost_usd, 0.0);
        let json = serde_json::to_string(&sum).unwrap();
        assert!(!json.contains(JWT));
        assert!(!json.contains("access_token"));
    }

    #[test]
    fn token_count_sums_last_not_running_total() {
        let dir = tempfile::tempdir().unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 6).unwrap();
        write_rollout(
            dir.path(),
            "rollout-b.jsonl",
            &format!(
                "{}\n{}\n",
                token_count("2026-09-06T10:00:00Z", 50, 5, 55, 10.0),
                token_count("2026-09-06T11:00:00Z", 70, 7, 9999, 32.0),
            ),
        );
        let cache = dir.path().join("cache.json");
        let sum = aggregate_incremental(&dir.path().join("sessions"), &cache, 7, today);
        assert_eq!(sum.totals.tokens, 132);
        let credits = sum.credits.as_ref().expect("rate_limits");
        assert_eq!(credits.percent, 32.0);
        assert_eq!(credits.subscription_tier.as_deref(), Some("pro"));
    }

    #[test]
    fn both_types_count_only_tur() {
        let dir = tempfile::tempdir().unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 6).unwrap();
        write_rollout(
            dir.path(),
            "rollout-c.jsonl",
            &format!(
                "{}\n{}\n",
                token_count("2026-09-06T10:00:00Z", 50, 5, 55, 10.0),
                tur("2026-09-06T11:00:00Z", 20, 2, 22),
            ),
        );
        let cache = dir.path().join("cache.json");
        let sum = aggregate_incremental(&dir.path().join("sessions"), &cache, 7, today);
        assert_eq!(sum.totals.tokens, 22, "token_count must be ignored once tur exists");
    }

    #[test]
    fn turn_context_model_sticks_on_next_usage() {
        let dir = tempfile::tempdir().unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 6).unwrap();
        write_rollout(
            dir.path(),
            "rollout-d.jsonl",
            &format!(
                "{}\n{}\n",
                turn_ctx("2026-09-06T10:00:00Z", "gpt-6-astra"),
                tur("2026-09-06T10:00:01Z", 8, 2, 10),
            ),
        );
        let cache = dir.path().join("cache.json");
        let sum = aggregate_incremental(&dir.path().join("sessions"), &cache, 7, today);
        assert_eq!(sum.per_model[0].model, "gpt-6-astra");
        assert_eq!(sum.per_model[0].tokens, 10);
    }

    #[test]
    fn incremental_append_matches_fresh_scan() {
        let dir = tempfile::tempdir().unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 6).unwrap();
        let path = write_rollout(
            dir.path(),
            "rollout-e.jsonl",
            &(tur("2026-09-06T12:00:00Z", 50, 5, 55) + "\n"),
        );
        let cache = dir.path().join("cache.json");
        let first = aggregate_incremental(&dir.path().join("sessions"), &cache, 7, today);
        assert_eq!(first.totals.tokens, 55);

        use std::io::Write;
        let mut f = std::fs::OpenOptions::new().append(true).open(&path).unwrap();
        writeln!(f, "{}", tur("2026-09-06T13:00:00Z", 25, 5, 999)).unwrap();
        drop(f);

        let second = aggregate_incremental(&dir.path().join("sessions"), &cache, 7, today);
        let fresh = aggregate_incremental(
            &dir.path().join("sessions"),
            &dir.path().join("cache-fresh.json"),
            7,
            today,
        );
        assert_eq!(second.totals.tokens, 85);
        assert_eq!(second.totals.tokens, fresh.totals.tokens);
    }

    #[test]
    fn truncation_does_not_go_negative() {
        let dir = tempfile::tempdir().unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 6).unwrap();
        let path = write_rollout(
            dir.path(),
            "rollout-f.jsonl",
            &format!(
                "{}\n{}\n",
                tur("2026-09-06T12:00:00Z", 800, 0, 800),
                tur("2026-09-06T12:01:00Z", 200, 0, 1000),
            ),
        );
        let cache = dir.path().join("cache.json");
        let full = aggregate_incremental(&dir.path().join("sessions"), &cache, 7, today);
        assert_eq!(full.totals.tokens, 1000);

        std::fs::write(&path, tur("2026-09-06T12:00:00Z", 40, 0, 40) + "\n").unwrap();
        let after = aggregate_incremental(&dir.path().join("sessions"), &cache, 7, today);
        assert_eq!(after.totals.tokens, 40);
    }
}
