//! A small capped, atomic "recent activity" log for the Overview feed.
//!
//! Entries are labels ONLY — `{ kind, message, timestamp }` where `message` is a
//! human label (e.g. "Switched account to Work") and `timestamp` is epoch
//! milliseconds. NO secret ever lands here: callers pass display labels, never a
//! token. The log lives at `<cchive-config>/activity.json` as a JSON array of the
//! newest `CAP` entries (oldest→newest on disk); reads return newest-first. A
//! missing or corrupt file is treated as empty (this module never panics on bad
//! input).
#![allow(dead_code)] // callers (commands) wire these up alongside this task

use std::path::{Path, PathBuf};

use super::atomic_fs;
use crate::model::{ActivityEntry, CoreError};

/// Keep at most this many entries (the newest); older ones drop off on append.
const CAP: usize = 50;
/// The capped activity-log file under the app config dir.
const ACTIVITY_FILE: &str = "activity.json";

/// Resolve the activity-log path under `config_dir`.
fn activity_path(config_dir: &Path) -> PathBuf {
    config_dir.join(ACTIVITY_FILE)
}

/// Read the on-disk log (oldest→newest). A missing or corrupt file is empty —
/// never an error, never a panic.
fn read_all(path: &Path) -> Vec<ActivityEntry> {
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// Append `{ kind, message, now_ms }` to the log, then truncate to the newest
/// `CAP` entries and atomically write it back (creating the file/dir when
/// absent). `message` is a display label only — never a secret.
pub fn append(config_dir: &Path, kind: &str, message: &str) -> Result<(), CoreError> {
    let path = activity_path(config_dir);
    let mut entries = read_all(&path);
    entries.push(ActivityEntry {
        kind: kind.to_string(),
        message: message.to_string(),
        timestamp: atomic_fs::now_millis() as i64,
    });
    // Cap: keep only the newest CAP, dropping the oldest from the front.
    if entries.len() > CAP {
        let drop = entries.len() - CAP;
        entries.drain(0..drop);
    }
    let bytes = serde_json::to_vec_pretty(&entries)?;
    atomic_fs::atomic_write(&path, &bytes, None)
}

/// Return up to `limit` entries, newest-first. A missing or corrupt file yields
/// an empty list (never panics).
pub fn read(config_dir: &Path, limit: usize) -> Vec<ActivityEntry> {
    let mut entries = read_all(&activity_path(config_dir));
    entries.reverse(); // stored oldest→newest; serve newest-first
    entries.truncate(limit);
    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_missing_file_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read(dir.path(), 10).is_empty());
    }

    #[test]
    fn read_corrupt_file_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        atomic_fs::atomic_write(&activity_path(dir.path()), b"{ not json", None).unwrap();
        // Corrupt JSON degrades to empty rather than panicking or erroring.
        assert!(read(dir.path(), 10).is_empty());
    }

    #[test]
    fn append_caps_at_50_keeping_newest() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..60 {
            append(dir.path(), "account", &format!("msg {i}")).unwrap();
        }
        let all = read(dir.path(), 1000);
        assert_eq!(all.len(), CAP, "log must cap at 50");
        // Newest-first: the latest append (msg 59) leads; the oldest kept is msg 10.
        assert_eq!(all.first().unwrap().message, "msg 59");
        assert_eq!(all.last().unwrap().message, "msg 10");
    }

    #[test]
    fn read_returns_newest_first_up_to_limit() {
        let dir = tempfile::tempdir().unwrap();
        append(dir.path(), "account", "first").unwrap();
        append(dir.path(), "provider", "second").unwrap();
        append(dir.path(), "mcp", "third").unwrap();

        let top2 = read(dir.path(), 2);
        assert_eq!(top2.len(), 2, "limit caps the returned count");
        assert_eq!(top2[0].message, "third", "newest first");
        assert_eq!(top2[0].kind, "mcp");
        assert_eq!(top2[1].message, "second");
    }

    #[test]
    fn append_is_atomic_and_leaves_no_temp() {
        let dir = tempfile::tempdir().unwrap();
        append(dir.path(), "skill", "Enabled skill X").unwrap();
        append(dir.path(), "memory", "Updated memory ~/.claude/CLAUDE.md").unwrap();

        let leftovers: Vec<String> = std::fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains(".cchive.tmp."))
            .collect();
        assert!(leftovers.is_empty(), "atomic write leaked temp: {leftovers:?}");
        assert!(activity_path(dir.path()).exists(), "log file persisted");
    }
}
