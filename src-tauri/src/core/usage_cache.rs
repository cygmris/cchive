//! Incremental parse cache for `core::usage`.
//!
//! Parsing `~/.claude/projects/**/*.jsonl` is O(all history) — seconds on a large
//! setup. This caches each file's parsed [`UsageEvent`]s keyed by (mtime, size), so a
//! later `readUsage` re-parses only files that changed and re-aggregates the rest from
//! cache. Cold cache (missing / corrupt / different version) → one full parse.
//!
//! The produced [`UsageSummary`] is identical to `usage::aggregate` for the same inputs:
//! files are fed to `events_to_summary` in the SAME WalkDir order, so the global retry
//! dedup keeps the same winner.
//!
//! SAFETY: token counts only — never a credential. ROBUSTNESS: never panics; any cache
//! failure degrades to a full parse.
use std::collections::{BTreeMap, HashSet};
use std::path::Path;
use std::time::UNIX_EPOCH;

use chrono::{Datelike, NaiveDate};
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use super::atomic_fs;
use super::usage::{self, UsageEvent};
use crate::model::UsageSummary;

/// Bump when `UsageEvent`'s cached shape changes → old caches are ignored (full reparse).
const CACHE_VERSION: u32 = 1;

/// One event, stored positionally to keep the JSON compact:
/// `[key, dateDays, model, input, output, cacheCreation, cacheRead]`.
type EventRepr = (u64, i32, String, u64, u64, u64, u64);

#[derive(Serialize, Deserialize, Default)]
struct FileEntry {
    mtime_ns: u128,
    size: u64,
    events: Vec<EventRepr>,
}

#[derive(Serialize, Deserialize)]
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

fn to_repr(ev: &UsageEvent) -> EventRepr {
    (
        ev.key,
        ev.date.num_days_from_ce(),
        ev.model.clone(),
        ev.input,
        ev.output,
        ev.cache_creation,
        ev.cache_read,
    )
}

fn from_repr(r: &EventRepr) -> Option<UsageEvent> {
    Some(UsageEvent {
        key: r.0,
        date: NaiveDate::from_num_days_from_ce_opt(r.1)?,
        model: r.2.clone(),
        input: r.3,
        output: r.4,
        cache_creation: r.5,
        cache_read: r.6,
    })
}

/// Load the cache; any error or a version mismatch yields an empty (cold) cache.
fn load(path: &Path) -> ParseCache {
    let Ok(text) = std::fs::read_to_string(path) else {
        return ParseCache::default();
    };
    match serde_json::from_str::<ParseCache>(&text) {
        Ok(c) if c.version == CACHE_VERSION => c,
        _ => ParseCache::default(),
    }
}

/// Persist the cache atomically. Best-effort — a failed save just costs a colder next run.
fn save(path: &Path, cache: &ParseCache) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(bytes) = serde_json::to_vec(cache) {
        let _ = atomic_fs::atomic_write(path, &bytes, Some(0o600));
    }
}

/// File `(mtime_ns, size)` fingerprint. `None` when the file cannot be stat'd.
fn fingerprint(path: &Path) -> Option<(u128, u64)> {
    let m = std::fs::metadata(path).ok()?;
    let mtime_ns = m
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    Some((mtime_ns, m.len()))
}

/// Aggregate usage from `projects_dir`, re-parsing only files whose (mtime, size)
/// changed since `cache_path` was written. Equivalent to `usage::aggregate` but cheaper
/// on repeat runs. Cold/corrupt cache → full parse.
pub fn aggregate_incremental(
    projects_dir: &Path,
    cache_path: &Path,
    range_days: u32,
    today_local: NaiveDate,
) -> UsageSummary {
    let mut cache = load(cache_path);
    let mut all_events: Vec<UsageEvent> = Vec::new();
    let mut live: HashSet<String> = HashSet::new();

    // Sorted walk MUST match usage::aggregate so the global dedup winner is the same.
    for entry in WalkDir::new(projects_dir)
        .sort_by_file_name()
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let (mtime_ns, size) = match fingerprint(path) {
            Some(fp) => fp,
            None => continue, // unreadable → skip, matching the parser
        };
        let key = path.to_string_lossy().into_owned();
        live.insert(key.clone());

        // Reuse unchanged files from cache; otherwise parse + upsert.
        if let Some(hit) = cache.files.get(&key) {
            if hit.mtime_ns == mtime_ns && hit.size == size {
                for r in &hit.events {
                    if let Some(ev) = from_repr(r) {
                        all_events.push(ev);
                    }
                }
                continue;
            }
        }
        let events = usage::parse_file_events(path);
        all_events.extend(events.iter().cloned());
        cache.files.insert(
            key,
            FileEntry {
                mtime_ns,
                size,
                events: events.iter().map(to_repr).collect(),
            },
        );
    }

    // Drop entries for files that no longer exist.
    cache.files.retain(|k, _| live.contains(k));

    let summary = usage::events_to_summary(all_events, range_days, today_local);
    save(cache_path, &cache);
    summary
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2024, 6, 15).unwrap()
    }

    /// An assistant-usage line with the given ids/model/tokens on 2024-06-14.
    fn line(req: &str, msg: &str, model: &str, input: u64, output: u64) -> String {
        format!(
            r#"{{"type":"assistant","requestId":"{req}","timestamp":"2024-06-14T10:00:00Z","message":{{"id":"{msg}","model":"{model}","usage":{{"input_tokens":{input},"output_tokens":{output},"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}}}}"#
        )
    }

    fn write(dir: &Path, sub: &str, name: &str, lines: &[String]) -> std::path::PathBuf {
        let d = dir.join(sub);
        fs::create_dir_all(&d).unwrap();
        let p = d.join(name);
        let mut f = fs::File::create(&p).unwrap();
        for l in lines {
            writeln!(f, "{l}").unwrap();
        }
        p
    }

    fn eq(a: &UsageSummary, b: &UsageSummary) -> bool {
        serde_json::to_value(a).unwrap() == serde_json::to_value(b).unwrap()
    }

    #[test]
    fn incremental_matches_fresh_across_add_append_delete() {
        let proj = tempfile::tempdir().unwrap();
        let cachedir = tempfile::tempdir().unwrap();
        let cache = cachedir.path().join("usage-parse-cache.json");

        write(proj.path(), "a", "s.jsonl", &[line("r1", "m1", "claude-sonnet-4", 100, 50)]);
        let fb = write(proj.path(), "b", "s.jsonl", &[line("r2", "m2", "claude-opus-4", 10, 5)]);

        // Cold cache: incremental == fresh, and the cache file is now written.
        let inc = aggregate_incremental(proj.path(), &cache, 30, today());
        assert!(eq(&inc, &usage::aggregate(proj.path(), 30, today())));
        assert!(cache.exists());

        // Append to file b (mtime+size change) → re-parsed; still exact.
        let mut f = fs::OpenOptions::new().append(true).open(&fb).unwrap();
        writeln!(f, "{}", line("r3", "m3", "claude-sonnet-4", 7, 3)).unwrap();
        let inc2 = aggregate_incremental(proj.path(), &cache, 30, today());
        assert!(eq(&inc2, &usage::aggregate(proj.path(), 30, today())));

        // Add a new file → picked up; still exact.
        write(proj.path(), "c", "s.jsonl", &[line("r4", "m4", "claude-haiku-4", 4, 2)]);
        let inc3 = aggregate_incremental(proj.path(), &cache, 30, today());
        assert!(eq(&inc3, &usage::aggregate(proj.path(), 30, today())));

        // Delete file a → entry dropped; still exact.
        fs::remove_file(proj.path().join("a").join("s.jsonl")).unwrap();
        let inc4 = aggregate_incremental(proj.path(), &cache, 30, today());
        assert!(eq(&inc4, &usage::aggregate(proj.path(), 30, today())));
    }

    #[test]
    fn cross_file_duplicate_counted_once() {
        let proj = tempfile::tempdir().unwrap();
        let cachedir = tempfile::tempdir().unwrap();
        let cache = cachedir.path().join("c.json");

        // Same (req,msg) in two files (a resumed/copied session) + a unique line each.
        let dup = line("rDUP", "mDUP", "claude-sonnet-4", 1000, 1000);
        write(proj.path(), "a", "s.jsonl", &[dup.clone(), line("rA", "mA", "claude-sonnet-4", 1, 1)]);
        write(proj.path(), "b", "s.jsonl", &[dup, line("rB", "mB", "claude-sonnet-4", 2, 2)]);

        let inc = aggregate_incremental(proj.path(), &cache, 30, today());
        let fresh = usage::aggregate(proj.path(), 30, today());
        assert!(eq(&inc, &fresh));
        // The dup's 2000 input is counted once (1000) + 1 + 2 = 1003, not 2003.
        assert_eq!(inc.totals.input, 1000 + 1 + 2);
    }

    #[test]
    fn cold_corrupt_and_versioned_cache_fall_back() {
        let proj = tempfile::tempdir().unwrap();
        let cachedir = tempfile::tempdir().unwrap();
        write(proj.path(), "a", "s.jsonl", &[line("r1", "m1", "claude-sonnet-4", 100, 50)]);
        let expected = usage::aggregate(proj.path(), 30, today());

        // Missing cache → full parse.
        let miss = cachedir.path().join("missing.json");
        assert!(eq(&aggregate_incremental(proj.path(), &miss, 30, today()), &expected));

        // Corrupt cache → no panic, full parse.
        let garbage = cachedir.path().join("garbage.json");
        fs::write(&garbage, b"not json at all {[").unwrap();
        assert!(eq(&aggregate_incremental(proj.path(), &garbage, 30, today()), &expected));

        // Wrong version → ignored, full parse.
        let stale = cachedir.path().join("stale.json");
        fs::write(&stale, br#"{"version":999,"files":{}}"#).unwrap();
        assert!(eq(&aggregate_incremental(proj.path(), &stale, 30, today()), &expected));
    }
}
