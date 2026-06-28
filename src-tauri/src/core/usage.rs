//! Streaming token-usage parser over `~/.claude/projects/**/*.jsonl`.
//!
//! Each `.jsonl` line is one session event; only `type:"assistant"` lines with a
//! `message.usage` block carry token counts. We stream every file line-by-line
//! (never loading a whole file), dedup retries by `(requestId, message.id)`,
//! bucket by **local** calendar day, and roll up totals / per-day / per-model /
//! a past-year heatmap, plus an estimated cost from a static pricing table.
//!
//! SAFETY: this module reads only token counts, model ids, and timestamps from
//! the logs — never a credential. Everything it produces is plain numbers.
//! ROBUSTNESS: malformed lines and unreadable files are skipped; it never panics.
#![allow(dead_code)] // `pricing`/`local_date` are also exercised by the unit tests

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use chrono::{DateTime, Duration, Local, NaiveDate};
use serde_json::Value;
use walkdir::WalkDir;

use crate::model::{DayPoint, HeatCell, ModelTotal, TokenTotals, UsageSummary};

/// USD price per **million** tokens for one model family.
#[derive(Debug, Clone, Copy)]
pub struct Rate {
    pub input: f64,
    pub output: f64,
    /// 5-minute cache-write (`cache_creation_input_tokens`).
    pub cache_write: f64,
    /// Cache-read (`cache_read_input_tokens`).
    pub cache_read: f64,
}

/// The per-model rate table: `(model-id substring, rate)` in match order
/// (first hit wins, matched case-insensitively). Covers the known Claude
/// families and a few common third-party models; anything else prices to 0.
pub fn pricing() -> Vec<(&'static str, Rate)> {
    vec![
        // Claude — USD / Mtok: input · output · cache-write(5m) · cache-read.
        ("claude-opus-4", Rate { input: 15.0, output: 75.0, cache_write: 18.75, cache_read: 1.50 }),
        ("claude-3-opus", Rate { input: 15.0, output: 75.0, cache_write: 18.75, cache_read: 1.50 }),
        ("claude-opus", Rate { input: 15.0, output: 75.0, cache_write: 18.75, cache_read: 1.50 }),
        ("claude-sonnet-4", Rate { input: 3.0, output: 15.0, cache_write: 3.75, cache_read: 0.30 }),
        ("claude-3-7-sonnet", Rate { input: 3.0, output: 15.0, cache_write: 3.75, cache_read: 0.30 }),
        ("claude-3-5-sonnet", Rate { input: 3.0, output: 15.0, cache_write: 3.75, cache_read: 0.30 }),
        ("claude-3-sonnet", Rate { input: 3.0, output: 15.0, cache_write: 3.75, cache_read: 0.30 }),
        ("claude-sonnet", Rate { input: 3.0, output: 15.0, cache_write: 3.75, cache_read: 0.30 }),
        ("claude-3-5-haiku", Rate { input: 0.80, output: 4.0, cache_write: 1.0, cache_read: 0.08 }),
        ("claude-haiku-4", Rate { input: 1.0, output: 5.0, cache_write: 1.25, cache_read: 0.10 }),
        ("claude-3-haiku", Rate { input: 0.25, output: 1.25, cache_write: 0.30, cache_read: 0.03 }),
        ("claude-haiku", Rate { input: 0.80, output: 4.0, cache_write: 1.0, cache_read: 0.08 }),
        // Common third-party Anthropic-compatible models (approximate list rates).
        ("glm-4", Rate { input: 0.60, output: 2.20, cache_write: 0.60, cache_read: 0.11 }),
        ("kimi-k2", Rate { input: 0.60, output: 2.50, cache_write: 0.60, cache_read: 0.15 }),
        ("deepseek-reasoner", Rate { input: 0.55, output: 2.19, cache_write: 0.55, cache_read: 0.14 }),
        ("deepseek", Rate { input: 0.27, output: 1.10, cache_write: 0.27, cache_read: 0.07 }),
        ("qwen", Rate { input: 0.40, output: 1.20, cache_write: 0.40, cache_read: 0.10 }),
    ]
}

/// Look up the rate for `model` (case-insensitive substring match); `None` ⇒ unpriced.
fn price_of(model: &str) -> Option<Rate> {
    let m = model.to_ascii_lowercase();
    pricing()
        .into_iter()
        .find(|(pat, _)| m.contains(pat))
        .map(|(_, r)| r)
}

/// Parse an ISO-8601 / RFC-3339 timestamp and project it onto the machine's
/// local calendar day. `None` for an unparseable timestamp (the line is skipped).
pub(crate) fn local_date(ts: &str) -> Option<NaiveDate> {
    DateTime::parse_from_rfc3339(ts)
        .ok()
        .map(|dt| dt.with_timezone(&Local).date_naive())
}

/// Map a daily token total to a heatmap intensity bucket 0..=4 (0 = no activity),
/// using quarter-of-max thresholds over the busiest day in the window.
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

/// Walk `projects_dir` for `*.jsonl`, stream-parse the assistant usage lines, and
/// aggregate into a [`UsageSummary`]. `today_local` is injected so the range /
/// year windows are deterministic in tests (callers pass the real local today).
pub fn aggregate(projects_dir: &Path, range_days: u32, today_local: NaiveDate) -> UsageSummary {
    let range_days = if range_days == 0 { 30 } else { range_days };
    let range_start = today_local - Duration::days(range_days as i64 - 1);
    let year_start = today_local - Duration::days(364);

    // Retry dedup across all files.
    let mut seen: HashSet<(String, String)> = HashSet::new();
    // Every observed day → total tokens (feeds the past-year heatmap).
    let mut by_date_total: HashMap<NaiveDate, u64> = HashMap::new();
    // Range-scoped day → token kinds (feeds the per-day series + totals).
    let mut by_date_kinds: HashMap<NaiveDate, TokenTotals> = HashMap::new();
    // Range-scoped model → token kinds (feeds per-model ranking + cost).
    let mut by_model: HashMap<String, TokenTotals> = HashMap::new();

    for entry in WalkDir::new(projects_dir).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let file = match File::open(path) {
            Ok(f) => f,
            Err(_) => continue, // unreadable file → skip, never fail
        };

        for line in BufReader::new(file).lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => continue, // unreadable line → skip
            };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let v: Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                Err(_) => continue, // malformed JSON → skip
            };

            // Only assistant lines that actually carry a usage block.
            if v.get("type").and_then(Value::as_str) != Some("assistant") {
                continue;
            }
            let message = match v.get("message") {
                Some(m) => m,
                None => continue,
            };
            let usage = match message.get("usage") {
                Some(u) => u,
                None => continue,
            };

            // Dedup retries by (requestId, message.id). Skip dedup only when both
            // ids are absent (don't collapse all id-less lines into one).
            let req_id = v.get("requestId").and_then(Value::as_str).unwrap_or("");
            let msg_id = message.get("id").and_then(Value::as_str).unwrap_or("");
            if !(req_id.is_empty() && msg_id.is_empty())
                && !seen.insert((req_id.to_string(), msg_id.to_string()))
            {
                continue;
            }

            let date = match v.get("timestamp").and_then(Value::as_str).and_then(local_date) {
                Some(d) => d,
                None => continue,
            };

            let u = |k: &str| usage.get(k).and_then(Value::as_u64).unwrap_or(0);
            let input = u("input_tokens");
            let output = u("output_tokens");
            let cache_creation = u("cache_creation_input_tokens");
            let cache_read = u("cache_read_input_tokens");
            let total = input + output + cache_creation + cache_read;

            // Past-year heatmap counts every day.
            *by_date_total.entry(date).or_insert(0) += total;

            // Totals / per-day / per-model are scoped to the active range window.
            if date >= range_start && date <= today_local {
                let d = by_date_kinds.entry(date).or_default();
                d.input += input;
                d.output += output;
                d.cache_creation += cache_creation;
                d.cache_read += cache_read;

                let model = message
                    .get("model")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_string();
                let m = by_model.entry(model).or_default();
                m.input += input;
                m.output += output;
                m.cache_creation += cache_creation;
                m.cache_read += cache_read;
            }
        }
    }

    // Range totals + per-model ranking + estimated cost (unknown models price 0).
    let mut totals = TokenTotals::default();
    let mut per_model: Vec<ModelTotal> = Vec::new();
    let mut unknown_models: Vec<String> = Vec::new();
    let mut est_cost_usd = 0.0_f64;
    for (model, t) in &by_model {
        totals.input += t.input;
        totals.output += t.output;
        totals.cache_creation += t.cache_creation;
        totals.cache_read += t.cache_read;

        per_model.push(ModelTotal {
            model: model.clone(),
            tokens: t.input + t.output + t.cache_creation + t.cache_read,
        });

        match price_of(model) {
            Some(r) => {
                est_cost_usd += (t.input as f64) * r.input / 1e6
                    + (t.output as f64) * r.output / 1e6
                    + (t.cache_creation as f64) * r.cache_write / 1e6
                    + (t.cache_read as f64) * r.cache_read / 1e6;
            }
            None => unknown_models.push(model.clone()),
        }
    }
    per_model.sort_by(|a, b| b.tokens.cmp(&a.tokens).then_with(|| a.model.cmp(&b.model)));
    unknown_models.sort();
    unknown_models.dedup();

    // Zero-filled per-day series over the range (oldest → newest).
    let mut per_day: Vec<DayPoint> = Vec::with_capacity(range_days as usize);
    for i in 0..range_days as i64 {
        let date = range_start + Duration::days(i);
        let k = by_date_kinds.get(&date).cloned().unwrap_or_default();
        per_day.push(DayPoint {
            date: date.format("%Y-%m-%d").to_string(),
            output: k.output,
            input: k.input,
            cache_read: k.cache_read,
        });
    }

    // Past-year heatmap (365 days), level from quarter-of-max thresholds.
    let max_day = (0..365i64)
        .filter_map(|i| by_date_total.get(&(year_start + Duration::days(i))).copied())
        .max()
        .unwrap_or(0);
    let mut heatmap: Vec<HeatCell> = Vec::with_capacity(365);
    for i in 0..365i64 {
        let date = year_start + Duration::days(i);
        let tokens = by_date_total.get(&date).copied().unwrap_or(0);
        heatmap.push(HeatCell {
            date: date.format("%Y-%m-%d").to_string(),
            tokens,
            level: level_of(tokens, max_day),
        });
    }

    UsageSummary {
        range_days,
        totals,
        est_cost_usd,
        unknown_models,
        per_day,
        per_model,
        heatmap,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    /// Today fixed so the range/year windows are deterministic regardless of host.
    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2024, 6, 15).unwrap()
    }

    /// Write `lines` into `<dir>/<subdir>/<name>.jsonl`.
    fn write_jsonl(dir: &Path, subdir: &str, name: &str, lines: &[&str]) {
        let sub = dir.join(subdir);
        fs::create_dir_all(&sub).unwrap();
        let mut f = fs::File::create(sub.join(name)).unwrap();
        for l in lines {
            writeln!(f, "{}", l).unwrap();
        }
    }

    #[test]
    fn dedup_cache_two_models_two_dates_malformed_and_cost() {
        let tmp = tempfile::tempdir().unwrap();
        let lines = [
            // Sonnet on day 1.
            r#"{"type":"assistant","timestamp":"2024-06-10T12:00:00.000Z","requestId":"r1","message":{"id":"m1","model":"claude-3-5-sonnet-20241022","usage":{"input_tokens":100,"output_tokens":200,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}"#,
            // Exact retry of r1/m1 with different counts — must be ignored.
            r#"{"type":"assistant","timestamp":"2024-06-10T12:01:00.000Z","requestId":"r1","message":{"id":"m1","model":"claude-3-5-sonnet-20241022","usage":{"input_tokens":999,"output_tokens":999}}}"#,
            // Opus cache line on day 1.
            r#"{"type":"assistant","timestamp":"2024-06-10T12:02:00.000Z","requestId":"r2","message":{"id":"m2","model":"claude-opus-4-20250514","usage":{"input_tokens":10,"output_tokens":20,"cache_creation_input_tokens":50,"cache_read_input_tokens":500}}}"#,
            // A non-assistant line — no usage, must be ignored.
            r#"{"type":"user","timestamp":"2024-06-12T12:00:00.000Z","message":{"role":"user"}}"#,
            // Malformed JSON — must be skipped.
            r#"{not valid json"#,
            // Sonnet on day 2.
            r#"{"type":"assistant","timestamp":"2024-06-12T12:00:00.000Z","requestId":"r3","message":{"id":"m3","model":"claude-3-5-sonnet-20241022","usage":{"input_tokens":1,"output_tokens":2}}}"#,
            // Unknown model on day 2 — priced 0 + flagged.
            r#"{"type":"assistant","timestamp":"2024-06-12T12:01:00.000Z","requestId":"r4","message":{"id":"m4","model":"mystery-model-7","usage":{"input_tokens":1000,"output_tokens":1000}}}"#,
        ];
        write_jsonl(tmp.path(), "proj-a", "session.jsonl", &lines);

        let s = aggregate(tmp.path(), 30, today());

        // Dedup: r1/m1 counted once (output 200, not 200+999). Totals prove it.
        assert_eq!(s.totals.input, 1111, "100+10+1+1000");
        assert_eq!(s.totals.output, 1222, "200+20+2+1000 (retry ignored)");
        assert_eq!(s.totals.cache_creation, 50, "the opus cache-write line");
        assert_eq!(s.totals.cache_read, 500, "the opus cache-read line");

        // Two distinct local dates → exactly two non-zero day points.
        let nonzero: Vec<&DayPoint> = s
            .per_day
            .iter()
            .filter(|d| d.input + d.output + d.cache_read > 0)
            .collect();
        assert_eq!(nonzero.len(), 2, "day 1 + day 2");
        assert_eq!(s.per_day.len(), 30, "range zero-filled to 30 days");

        // Per-model ranking by tokens desc: mystery (2000) > opus (580) > sonnet (303).
        assert_eq!(s.per_model.len(), 3);
        assert_eq!(s.per_model[0].tokens, 2000);
        assert!(s.per_model[0].model.contains("mystery"));
        let sonnet = s.per_model.iter().find(|m| m.model.contains("sonnet")).unwrap();
        assert_eq!(sonnet.tokens, 303, "101 input + 202 output");

        // Cost: sonnet 0.003333 + opus 0.0033375; mystery contributes 0.
        let expected = (101.0 * 3.0 + 202.0 * 15.0) / 1e6
            + (10.0 * 15.0 + 20.0 * 75.0 + 50.0 * 18.75 + 500.0 * 1.5) / 1e6;
        assert!((s.est_cost_usd - expected).abs() < 1e-9, "got {}", s.est_cost_usd);
        assert_eq!(s.unknown_models, vec!["mystery-model-7".to_string()]);
    }

    #[test]
    fn heatmap_levels_scale_with_daily_totals() {
        let tmp = tempfile::tempdir().unwrap();
        // Four single-line days with totals 10/20/30/40 (max 40) → levels 1/2/3/4.
        let lines = [
            r#"{"type":"assistant","timestamp":"2024-06-01T12:00:00.000Z","requestId":"a","message":{"id":"a","model":"claude-3-5-sonnet","usage":{"input_tokens":10,"output_tokens":0}}}"#,
            r#"{"type":"assistant","timestamp":"2024-06-02T12:00:00.000Z","requestId":"b","message":{"id":"b","model":"claude-3-5-sonnet","usage":{"input_tokens":20,"output_tokens":0}}}"#,
            r#"{"type":"assistant","timestamp":"2024-06-03T12:00:00.000Z","requestId":"c","message":{"id":"c","model":"claude-3-5-sonnet","usage":{"input_tokens":30,"output_tokens":0}}}"#,
            r#"{"type":"assistant","timestamp":"2024-06-04T12:00:00.000Z","requestId":"d","message":{"id":"d","model":"claude-3-5-sonnet","usage":{"input_tokens":40,"output_tokens":0}}}"#,
        ];
        write_jsonl(tmp.path(), "proj-b", "s.jsonl", &lines);

        let s = aggregate(tmp.path(), 30, today());
        let level_on = |ts: &str| {
            let d = local_date(ts).unwrap().format("%Y-%m-%d").to_string();
            s.heatmap.iter().find(|c| c.date == d).unwrap().level
        };
        assert_eq!(level_on("2024-06-01T12:00:00.000Z"), 1);
        assert_eq!(level_on("2024-06-02T12:00:00.000Z"), 2);
        assert_eq!(level_on("2024-06-03T12:00:00.000Z"), 3);
        assert_eq!(level_on("2024-06-04T12:00:00.000Z"), 4);
        // A day with no activity is level 0.
        assert_eq!(level_on("2024-06-05T12:00:00.000Z"), 0);
        assert_eq!(s.heatmap.len(), 365, "a full trailing year of cells");
    }

    #[test]
    fn missing_dir_yields_zeroed_summary() {
        let tmp = tempfile::tempdir().unwrap();
        let s = aggregate(&tmp.path().join("does-not-exist"), 7, today());
        assert_eq!(s.range_days, 7);
        assert_eq!(s.totals.input, 0);
        assert_eq!(s.totals.output, 0);
        assert_eq!(s.est_cost_usd, 0.0);
        assert!(s.unknown_models.is_empty());
        assert!(s.per_model.is_empty());
        assert_eq!(s.per_day.len(), 7);
        assert!(s.per_day.iter().all(|d| d.output == 0));
        assert!(s.heatmap.iter().all(|c| c.level == 0));
    }

    #[test]
    fn range_zero_defaults_to_thirty() {
        let tmp = tempfile::tempdir().unwrap();
        let s = aggregate(tmp.path(), 0, today());
        assert_eq!(s.range_days, 30);
        assert_eq!(s.per_day.len(), 30);
    }
}
