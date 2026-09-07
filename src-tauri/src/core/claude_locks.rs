//! Cooperate with Claude Code's own advisory locks while mutating its files.
//!
//! Claude Code guards its OAuth token refresh (and its `~/.claude.json` writes)
//! with npm `proper-lockfile`. The protocol, as observed in the installed
//! bundle:
//!
//! - the lock artifact is a **directory** — `mkdir` atomicity is the mutex;
//! - the refresh path takes the primary `<claude-dir>/.oauth_refresh.lock` and
//!   then the legacy `~/.claude.lock`, kept for external tools;
//! - a credential lock counts as stale only after 60s, and a live holder
//!   touches it every 5s; the config lock goes stale after 10s;
//! - Claude Code retries a held lock several times before giving up, so holding
//!   one briefly is cooperative rather than disruptive.
//!
//! Why a swap must hold them: Claude Code's refresh reads the credential,
//! refreshes over the network and saves — all inside the lock. A swap landing
//! in that window is overwritten by the refreshed *old* account's token, and
//! the backup taken alongside it keeps a pre-rotation refresh token. Under the
//! lock, Claude Code's re-read instead sees the swapped, unexpired credential
//! and skips its refresh.
#![allow(dead_code)] // wired up by the switch flow in a later task

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime};

use super::paths;
use crate::model::CoreError;

/// A credential lock is stale only after this long without a touch.
pub const CRED_LOCK_STALE_MS: u64 = 60_000;
/// The `~/.claude.json` lock uses the shorter default.
pub const CONFIG_LOCK_STALE_MS: u64 = 10_000;
/// A live holder re-touches its lock this often.
pub const LOCK_UPDATE_MS: u64 = 5_000;
/// How long we are willing to wait for a contended lock before giving up. Well
/// under the stale window, so waiting never turns into stealing.
pub const ACQUIRE_TIMEOUT_MS: u64 = 15_000;

/// Primary credential lock, next to the credential itself.
pub fn oauth_refresh_lock_path() -> PathBuf {
    paths::claude_dir().join(".oauth_refresh.lock")
}

/// Legacy credential lock (`~/.claude.lock`), still taken for compatibility.
pub fn legacy_lock_path() -> PathBuf {
    let dir = paths::claude_dir();
    let parent = dir.parent().map(Path::to_path_buf).unwrap_or_default();
    let name = dir
        .file_name()
        .map(|n| format!("{}.lock", n.to_string_lossy()))
        .unwrap_or_else(|| ".claude.lock".to_string());
    parent.join(name)
}

/// The `~/.claude.json` lock.
pub fn config_lock_path() -> PathBuf {
    let mut p = paths::dot_claude_json();
    let name = format!(
        "{}.lock",
        p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()
    );
    p.set_file_name(name);
    p
}

/// A held lock. Dropping it stops the heartbeat and removes the directory, so
/// every early return releases the lock without a dedicated unlock path.
#[derive(Debug)]
pub struct LockGuard {
    path: PathBuf,
    stop: Arc<AtomicBool>,
    heartbeat: Option<JoinHandle<()>>,
}

impl Drop for LockGuard {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(h) = self.heartbeat.take() {
            let _ = h.join();
        }
        let _ = fs::remove_dir(&self.path);
    }
}

/// Take one lock, waiting out a live holder and reclaiming an abandoned one.
///
/// `stale_ms` decides which is which: a lock whose mtime has not moved for that
/// long belongs to a process that died holding it, and reclaiming it is the
/// only way out. A lock that is still being touched is left alone until
/// `timeout_ms` elapses — waiting is always preferable to stealing, because the
/// holder may be mid-refresh.
pub fn acquire(path: &Path, stale_ms: u64, timeout_ms: u64) -> Result<LockGuard, CoreError> {
    let deadline = SystemTime::now() + Duration::from_millis(timeout_ms);
    let mut backoff_ms = 50u64;

    loop {
        match fs::create_dir(path) {
            Ok(()) => return Ok(spawn_guard(path.to_path_buf())),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                if age_ms(path).is_some_and(|age| age > stale_ms) {
                    // Abandoned: reclaim it. A racing reclaimer just means our
                    // create_dir below fails and we loop again.
                    let _ = fs::remove_dir(path);
                    continue;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // The parent directory does not exist — there is nothing to
                // guard, so there is nothing to wait for either.
                return Err(CoreError::Io(format!(
                    "cannot create lock at {}: parent missing",
                    path.display()
                )));
            }
            Err(e) => return Err(CoreError::Io(format!("lock {}: {e}", path.display()))),
        }

        if SystemTime::now() >= deadline {
            return Err(CoreError::LockBusy(path.display().to_string()));
        }
        // Jitter so two waiters do not retry in lockstep.
        let jitter = (SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.subsec_millis() as u64)
            .unwrap_or(0))
            % 50;
        thread::sleep(Duration::from_millis(backoff_ms + jitter));
        backoff_ms = (backoff_ms * 2).min(500);
    }
}

fn spawn_guard(path: PathBuf) -> LockGuard {
    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();
    let beat_path = path.clone();
    let heartbeat = thread::spawn(move || {
        // Touch every LOCK_UPDATE_MS so a holder that legitimately takes a
        // while (a refresh round trip) is never mistaken for a dead one. The
        // sleep is chopped up so Drop does not have to wait a full period.
        while !stop_thread.load(Ordering::SeqCst) {
            for _ in 0..(LOCK_UPDATE_MS / 100) {
                if stop_thread.load(Ordering::SeqCst) {
                    return;
                }
                thread::sleep(Duration::from_millis(100));
            }
            touch(&beat_path);
        }
    });
    LockGuard { path, stop, heartbeat: Some(heartbeat) }
}

/// Best-effort mtime bump. A platform that refuses it only means our lock looks
/// older than it is, which at worst lets a patient waiter reclaim it after the
/// stale window — never a correctness failure for a hold this short.
fn touch(path: &Path) {
    if let Ok(dir) = fs::File::open(path) {
        let times = fs::FileTimes::new().set_modified(SystemTime::now());
        let _ = dir.set_times(times);
    }
}

/// Milliseconds since the lock was last touched, or `None` if it vanished.
fn age_ms(path: &Path) -> Option<u64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    SystemTime::now()
        .duration_since(modified)
        .ok()
        .map(|d| d.as_millis() as u64)
}

/// Run `f` while holding both credential locks, in Claude Code's own order.
///
/// Both are released on every path out, including a panic-free early return
/// from `f`. Failing to take either is `LockBusy`, and `f` never runs — the
/// caller must treat that as a zero-change outcome.
pub fn with_claude_locks<T>(f: impl FnOnce() -> Result<T, CoreError>) -> Result<T, CoreError> {
    with_locks_at(
        &oauth_refresh_lock_path(),
        &legacy_lock_path(),
        ACQUIRE_TIMEOUT_MS,
        f,
    )
}

/// `with_claude_locks` against explicit paths (tests need no home directory).
pub fn with_locks_at<T>(
    primary: &Path,
    legacy: &Path,
    timeout_ms: u64,
    f: impl FnOnce() -> Result<T, CoreError>,
) -> Result<T, CoreError> {
    let _primary = acquire(primary, CRED_LOCK_STALE_MS, timeout_ms)?;
    let _legacy = acquire(legacy, CRED_LOCK_STALE_MS, timeout_ms)?;
    f()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn acquire_creates_and_drop_removes() {
        let dir = tempfile::tempdir().unwrap();
        let lock = dir.path().join(".oauth_refresh.lock");

        let guard = acquire(&lock, CRED_LOCK_STALE_MS, 1_000).expect("free lock");
        assert!(lock.exists());
        drop(guard);
        assert!(!lock.exists(), "Drop must release the lock");
    }

    #[test]
    fn a_fresh_holder_is_waited_out_not_stolen() {
        let dir = tempfile::tempdir().unwrap();
        let lock = dir.path().join(".oauth_refresh.lock");
        fs::create_dir(&lock).unwrap();

        let err = acquire(&lock, CRED_LOCK_STALE_MS, 200).expect_err("held");
        assert!(matches!(err, CoreError::LockBusy(_)), "got {err:?}");
        assert!(lock.exists(), "someone else's live lock must survive");
    }

    #[test]
    fn an_abandoned_lock_is_reclaimed() {
        let dir = tempfile::tempdir().unwrap();
        let lock = dir.path().join(".oauth_refresh.lock");
        fs::create_dir(&lock).unwrap();

        // stale_ms 0 makes any existing lock abandoned by definition.
        let guard = acquire(&lock, 0, 1_000).expect("stale lock is reclaimable");
        assert!(lock.exists());
        drop(guard);
    }

    #[test]
    fn with_locks_runs_the_body_and_releases_both() {
        let dir = tempfile::tempdir().unwrap();
        let primary = dir.path().join(".oauth_refresh.lock");
        let legacy = dir.path().join(".claude.lock");

        let out = with_locks_at(&primary, &legacy, 1_000, || {
            assert!(primary.exists() && legacy.exists());
            Ok(42)
        })
        .expect("body runs");
        assert_eq!(out, 42);
        assert!(!primary.exists() && !legacy.exists());
    }

    #[test]
    fn body_never_runs_when_a_lock_is_held() {
        let dir = tempfile::tempdir().unwrap();
        let primary = dir.path().join(".oauth_refresh.lock");
        let legacy = dir.path().join(".claude.lock");
        fs::create_dir(&legacy).unwrap();

        let mut ran = false;
        let err = with_locks_at(&primary, &legacy, 200, || {
            ran = true;
            Ok(())
        })
        .expect_err("legacy lock is held");
        assert!(matches!(err, CoreError::LockBusy(_)));
        assert!(!ran, "a contended lock must be a zero-change outcome");
        // The primary we did take is released again on the way out.
        assert!(!primary.exists());
    }

    #[test]
    fn heartbeat_keeps_a_held_lock_from_looking_stale() {
        let dir = tempfile::tempdir().unwrap();
        let lock = dir.path().join(".oauth_refresh.lock");
        let guard = acquire(&lock, CRED_LOCK_STALE_MS, 1_000).unwrap();

        // Backdate the lock, then let one heartbeat period elapse.
        let past = SystemTime::now() - Duration::from_secs(600);
        let f = fs::File::open(&lock).unwrap();
        f.set_times(fs::FileTimes::new().set_modified(past)).unwrap();
        assert!(age_ms(&lock).unwrap() > CRED_LOCK_STALE_MS);

        std::thread::sleep(Duration::from_millis(LOCK_UPDATE_MS + 400));
        assert!(
            age_ms(&lock).unwrap() < CRED_LOCK_STALE_MS,
            "heartbeat must refresh the lock's mtime"
        );
        drop(guard);
    }
}
