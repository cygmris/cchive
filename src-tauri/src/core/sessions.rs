//! Detect running Claude Code instances.
//!
//! Claude Code writes one record per session to `~/.claude/sessions/<pid>.json`
//! (fields observed on 2.1.263: `pid`, `sessionId`, `cwd`, `startedAt`,
//! `procStart`, `version`, `status`, …). The records outlive the processes that
//! wrote them, and the OS recycles pids — so a record alone proves nothing.
//! `procStart` is the guard: on Linux it is the process's start time in clock
//! ticks since boot (field 22 of `/proc/<pid>/stat`, verified against a live
//! session), fixed for that process's lifetime, so a mismatch means the pid now
//! belongs to something else.
//!
//! **What this can and cannot tell us.** Every Claude Code session on this
//! machine reads the *same* `~/.claude/.credentials.json`, so a live session
//! holds whichever account is currently active — never a specific stored one.
//! That is why the switch gates its refresh on "the target is not the active
//! account" and uses this module only to warn that other sessions are running
//! (they keep their in-memory credential and will not notice the swap).
//! claude-swap can attribute a session to one account because `cswap run` gives
//! each account its own config dir; cchive has no such per-account session, so
//! that half of its ownership model does not transfer.
//!
//! Every read here is best-effort: any IO or parse failure degrades to "cannot
//! tell", never to a blocked switch. A broken detector must not be able to stop
//! the user from switching accounts.
#![allow(dead_code)] // surfaced by the switch flow / UI in a later task

use std::path::{Path, PathBuf};

use serde_json::Value;

use super::paths;

/// A Claude Code process that is still running.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LiveSession {
    pub pid: u32,
    /// Claude Code's own session id, when the record carries one.
    pub session_id: Option<String>,
    /// Working directory the session was started in.
    pub cwd: Option<String>,
    /// Claude Code version that wrote the record.
    pub version: Option<String>,
}

/// Directory Claude Code keeps its session records in.
pub fn sessions_dir() -> PathBuf {
    paths::claude_dir().join("sessions")
}

/// Every Claude Code process that is still alive, newest record first.
pub fn live_sessions() -> Vec<LiveSession> {
    live_sessions_at(&sessions_dir(), &ProcTable)
}

/// How many Claude Code processes are running. Zero also covers "could not
/// tell" — callers use it to soften a warning, never to gate an action.
pub fn live_session_count() -> usize {
    live_sessions().len()
}

/// The process facts this module needs, abstracted so tests need no real pids.
pub trait ProcInfo {
    /// Start time of `pid` in the same unit the record's `procStart` uses, or
    /// `None` when the process is gone (or cannot be inspected).
    fn start_ticks(&self, pid: u32) -> Option<String>;
}

/// Reads `/proc/<pid>/stat` on Linux; on other platforms it reports "unknown",
/// which makes every record fail the liveness check (see `is_live`).
pub struct ProcTable;

impl ProcInfo for ProcTable {
    #[cfg(target_os = "linux")]
    fn start_ticks(&self, pid: u32) -> Option<String> {
        let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
        // The comm field is parenthesised and may contain spaces, so fields are
        // counted from after the LAST ')' — splitting the whole line on spaces
        // silently shifts every index for a process whose name has one.
        let rest = stat.rsplit_once(')')?.1;
        // After comm: state is field 3, so starttime (field 22) is the 20th here.
        rest.split_whitespace().nth(19).map(str::to_string)
    }

    #[cfg(not(target_os = "linux"))]
    fn start_ticks(&self, _pid: u32) -> Option<String> {
        None
    }
}

/// `live_sessions` against an explicit directory and process table.
pub fn live_sessions_at(dir: &Path, proc_info: &dyn ProcInfo) -> Vec<LiveSession> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new(); // no directory, no sessions we can prove
    };

    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        let Ok(record) = serde_json::from_str::<Value>(&text) else { continue };
        let Some(session) = live_from_record(&record, proc_info) else { continue };
        out.push(session);
    }
    out.sort_by_key(|s| s.pid);
    out
}

/// Turn one record into a `LiveSession`, or `None` when it does not describe a
/// process that is still running.
fn live_from_record(record: &Value, proc_info: &dyn ProcInfo) -> Option<LiveSession> {
    let pid = record.get("pid").and_then(Value::as_u64)? as u32;
    let recorded = record.get("procStart").and_then(Value::as_str)?;
    if !is_live(pid, recorded, proc_info) {
        return None;
    }
    Some(LiveSession {
        pid,
        session_id: str_field(record, "sessionId"),
        cwd: str_field(record, "cwd"),
        version: str_field(record, "version"),
    })
}

fn str_field(record: &Value, key: &str) -> Option<String> {
    record.get(key).and_then(Value::as_str).map(str::to_string)
}

/// A pid is live only when the OS agrees it started when the record says.
/// Unknown (process gone, `/proc` unreadable, non-Linux) counts as not live:
/// over-reporting a session would show the user a warning about processes that
/// no longer exist.
fn is_live(pid: u32, recorded_start: &str, proc_info: &dyn ProcInfo) -> bool {
    match proc_info.start_ticks(pid) {
        Some(actual) => actual == recorded_start,
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::fs;

    struct FakeProc(HashMap<u32, String>);

    impl ProcInfo for FakeProc {
        fn start_ticks(&self, pid: u32) -> Option<String> {
            self.0.get(&pid).cloned()
        }
    }

    fn write_record(dir: &Path, pid: u32, proc_start: &str) {
        let body = serde_json::json!({
            "pid": pid,
            "sessionId": format!("sess-{pid}"),
            "cwd": "/work",
            "procStart": proc_start,
            "version": "2.1.263",
        });
        fs::write(dir.join(format!("{pid}.json")), body.to_string()).unwrap();
    }

    #[test]
    fn a_matching_proc_start_counts_as_live() {
        let dir = tempfile::tempdir().unwrap();
        write_record(dir.path(), 100, "84585224");
        let proc = FakeProc(HashMap::from([(100, "84585224".to_string())]));

        let live = live_sessions_at(dir.path(), &proc);
        assert_eq!(live.len(), 1);
        assert_eq!(live[0].pid, 100);
        assert_eq!(live[0].session_id.as_deref(), Some("sess-100"));
    }

    #[test]
    fn a_dead_pid_is_not_reported() {
        let dir = tempfile::tempdir().unwrap();
        write_record(dir.path(), 101, "1234");
        let proc = FakeProc(HashMap::new()); // process gone

        assert!(live_sessions_at(dir.path(), &proc).is_empty());
    }

    #[test]
    fn a_recycled_pid_is_not_reported() {
        let dir = tempfile::tempdir().unwrap();
        write_record(dir.path(), 102, "1234");
        // Same pid, different process: start time does not match.
        let proc = FakeProc(HashMap::from([(102, "999999".to_string())]));

        assert!(live_sessions_at(dir.path(), &proc).is_empty());
    }

    #[test]
    fn corrupt_and_foreign_files_are_skipped_not_fatal() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("103.json"), "{ not json").unwrap();
        fs::write(dir.path().join("104.json"), r#"{"pid":104}"#).unwrap(); // no procStart
        fs::write(dir.path().join("105.key"), "opaque").unwrap();
        write_record(dir.path(), 106, "42");
        let proc = FakeProc(HashMap::from([
            (103, "42".to_string()),
            (104, "42".to_string()),
            (106, "42".to_string()),
        ]));

        let live = live_sessions_at(dir.path(), &proc);
        assert_eq!(live.iter().map(|s| s.pid).collect::<Vec<_>>(), vec![106]);
    }

    #[test]
    fn a_missing_directory_reports_nothing_rather_than_failing() {
        let proc = FakeProc(HashMap::new());
        assert!(live_sessions_at(Path::new("/nonexistent/sessions"), &proc).is_empty());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn proc_table_reads_this_processs_own_start_time() {
        // Positive control: the parser must work on a pid we know is alive.
        let me = std::process::id();
        let ticks = ProcTable.start_ticks(me).expect("own /proc entry");
        assert!(ticks.chars().all(|c| c.is_ascii_digit()), "got {ticks:?}");
        assert!(ProcTable.start_ticks(me) == Some(ticks), "start time is stable");
    }
}
