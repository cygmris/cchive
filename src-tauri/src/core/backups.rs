//! Rotating, restorable snapshots of the Claude files Clavis mutates.
//!
//! Before each account/provider switch, `snapshot` copies every EXISTING Claude
//! file into a per-name rotating store under `<clavis>/backups/`, then prunes each
//! name to the newest `KEEP`. `list` enumerates the store newest-first and
//! `restore` brings a chosen backup back to its original path — snapshotting the
//! CURRENT state first, so the pre-restore state is itself recoverable.
//!
//! SAFETY: only Claude file CONTENT is ever copied. The OS keyring (account /
//! provider secret blobs) is never read or written here — a backup is a plain file
//! copy. Copies are atomic, the backups dir is `0700` and each backup file is
//! `0600`. A backup file is named `<original-name>.<epoch_millis>.bak`, so `list`
//! and `restore` recover the original name + timestamp from the file name alone
//! (no manifest, no fingerprinted sidecar).
#![allow(dead_code)] // the snapshot hook + commands wire these entry points up

use std::fs;
use std::path::{Path, PathBuf};

use super::{atomic_fs, paths};
use crate::model::{BackupEntry, CoreError};

/// How many timestamped backups to keep per original file before pruning oldest.
const KEEP: usize = 20;
/// Subdir under the Clavis config dir that holds the rotating backups.
const BACKUPS_SUBDIR: &str = "backups";
/// Suffix marking a Clavis backup file: `<name>.<epoch_millis>.bak`.
const BAK_SUFFIX: &str = ".bak";
/// Unix permission bits: `0700` for the backups dir, `0600` for each backup file.
const DIR_MODE: u32 = 0o700;
const FILE_MODE: u32 = 0o600;

// ---------------------------------------------------------------------------
// Public API (path-injectable so the live hook passes real paths, tests temps)
// ---------------------------------------------------------------------------

/// Snapshot each EXISTING file in `claude_paths` into `<clavis_dir>/backups/`
/// (atomic, `0600`, dir `0700`), then prune each name to the newest `KEEP`.
/// Missing files are skipped — a snapshot never fails because a file is absent.
pub fn snapshot(clavis_dir: &Path, claude_paths: &[PathBuf]) -> Result<(), CoreError> {
    snapshot_at(clavis_dir, claude_paths, atomic_fs::now_millis())
}

/// List the backups store newest-first (by timestamp, then id). A missing/empty
/// backups dir yields an empty list — listing never errors.
pub fn list(clavis_dir: &Path) -> Vec<BackupEntry> {
    let backups_dir = clavis_dir.join(BACKUPS_SUBDIR);
    let rd = match fs::read_dir(&backups_dir) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    let mut out: Vec<BackupEntry> = Vec::new();
    for entry in rd.flatten() {
        let fname = entry.file_name();
        let fname = fname.to_string_lossy().into_owned();
        if let Some((name, ts)) = parse_backup(&fname) {
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            out.push(BackupEntry {
                id: fname,
                original: name,
                timestamp: ts as i64,
                size,
            });
        }
    }
    // Newest-first; id as a stable tiebreak for equal timestamps.
    out.sort_by(|a, b| b.timestamp.cmp(&a.timestamp).then(b.id.cmp(&a.id)));
    out
}

/// Restore the backup `id` back to its original path: snapshot the CURRENT state
/// first (so the pre-restore state stays recoverable), then atomically copy the
/// backup's content back. The original path is recovered by matching the backup's
/// name against the live Claude files.
pub fn restore(clavis_dir: &Path, id: &str) -> Result<(), CoreError> {
    restore_inner(clavis_dir, id, &claude_snapshot_paths())
}

/// Resolve the live Clavis config dir + the Claude files a switch mutates and
/// snapshot them best-effort. Inserted before each account/provider switch so the
/// prior state is always recoverable; a snapshot failure NEVER blocks the switch
/// (the backup is a safety net, not a gate).
pub fn auto_snapshot() {
    let _ = snapshot(&paths::clavis_config_dir(), &claude_snapshot_paths());
}

// ---------------------------------------------------------------------------
// Internals (timestamp/originals injectable so tests need no live paths/clock)
// ---------------------------------------------------------------------------

/// The Claude files Clavis backs up before a switch: the live credential, the
/// `settings.json` provider block, and the `~/.claude.json` identity cache.
fn claude_snapshot_paths() -> Vec<PathBuf> {
    vec![
        paths::credentials_path(),
        paths::settings_path(),
        paths::dot_claude_json(),
    ]
}

/// `snapshot` with an explicit timestamp (so tests can assert rotation order).
fn snapshot_at(clavis_dir: &Path, claude_paths: &[PathBuf], millis: u128) -> Result<(), CoreError> {
    let backups_dir = clavis_dir.join(BACKUPS_SUBDIR);
    let mut ensured = false;
    for original in claude_paths {
        if !original.exists() {
            continue;
        }
        let name = match original.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        // Create the backups dir once, tightened to 0700, only when there is
        // something to write (an all-missing snapshot leaves no empty dir behind).
        if !ensured {
            ensure_dir_0700(&backups_dir)?;
            ensured = true;
        }
        let bytes = fs::read(original).map_err(CoreError::from)?;
        let dest = backups_dir.join(format!("{name}.{millis}{BAK_SUFFIX}"));
        atomic_fs::atomic_write(&dest, &bytes, Some(FILE_MODE))?;
        prune(&backups_dir, &name, KEEP);
    }
    Ok(())
}

/// `restore` against an explicit set of original paths (so tests need no live
/// Claude files). Snapshots the current original first, then copies the backup back.
fn restore_inner(clavis_dir: &Path, id: &str, originals: &[PathBuf]) -> Result<(), CoreError> {
    let backups_dir = clavis_dir.join(BACKUPS_SUBDIR);
    let backup_path = backups_dir.join(id);
    if !backup_path.exists() {
        return Err(CoreError::NotFound(format!("backup {id}")));
    }
    let (name, _ts) =
        parse_backup(id).ok_or_else(|| CoreError::InvalidInput(format!("malformed backup id {id}")))?;
    let original = originals
        .iter()
        .find(|p| p.file_name().and_then(|n| n.to_str()) == Some(name.as_str()))
        .ok_or_else(|| CoreError::NotFound(format!("no original file for backup {id}")))?;

    // Snapshot the CURRENT state first so the pre-restore content is recoverable.
    let _ = snapshot(clavis_dir, std::slice::from_ref(original));

    // Atomically copy the backup back, carrying the backup's (tight) mode so the
    // restored file is never left world-readable.
    let bytes = fs::read(&backup_path).map_err(CoreError::from)?;
    atomic_fs::atomic_write(original, &bytes, backup_mode(&backup_path))
}

/// Keep at most `keep` backups for `name`, pruning the oldest first.
fn prune(backups_dir: &Path, name: &str, keep: usize) {
    let mut entries: Vec<(u128, PathBuf)> = Vec::new();
    let rd = match fs::read_dir(backups_dir) {
        Ok(r) => r,
        Err(_) => return,
    };
    for entry in rd.flatten() {
        let fname = entry.file_name();
        let fname = fname.to_string_lossy();
        if let Some((n, ts)) = parse_backup(&fname) {
            if n == name {
                entries.push((ts, entry.path()));
            }
        }
    }
    entries.sort_by_key(|(ts, _)| *ts);
    while entries.len() > keep {
        let (_, path) = entries.remove(0);
        let _ = fs::remove_file(&path);
    }
}

/// Parse a backup file name `<name>.<epoch_millis>.bak` into its original name +
/// timestamp. Anything else (no `.bak`, non-numeric suffix) yields `None`.
fn parse_backup(fname: &str) -> Option<(String, u128)> {
    let stem = fname.strip_suffix(BAK_SUFFIX)?;
    let (name, ts) = stem.rsplit_once('.')?;
    if name.is_empty() {
        return None;
    }
    Some((name.to_string(), ts.parse::<u128>().ok()?))
}

/// Create `dir` (and parents) and tighten it to `0700` on unix.
fn ensure_dir_0700(dir: &Path) -> Result<(), CoreError> {
    fs::create_dir_all(dir).map_err(CoreError::from)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(dir, fs::Permissions::from_mode(DIR_MODE));
    }
    Ok(())
}

/// The unix permission bits of a backup file (always written `0600`), so a restore
/// carries them back to the original. `None` off-unix.
fn backup_mode(p: &Path) -> Option<u32> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::metadata(p).ok().map(|m| m.permissions().mode() & 0o777)
    }
    #[cfg(not(unix))]
    {
        let _ = p;
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    fn mode_of(p: &Path) -> u32 {
        use std::os::unix::fs::PermissionsExt;
        fs::metadata(p).unwrap().permissions().mode() & 0o777
    }

    fn write(path: &Path, bytes: &[u8]) {
        atomic_fs::atomic_write(path, bytes, Some(0o600)).unwrap();
    }

    #[test]
    fn snapshot_writes_copy_and_prune_keeps_newest_twenty() {
        let dir = tempfile::tempdir().unwrap();
        let clavis = dir.path().join("clavis");
        let original = dir.path().join(".credentials.json");
        write(&original, b"cred-content");

        // 22 snapshots with strictly increasing timestamps; only the newest 20 survive.
        for ts in 1_000..1_022u128 {
            snapshot_at(&clavis, std::slice::from_ref(&original), ts).unwrap();
        }

        let entries = list(&clavis);
        assert_eq!(entries.len(), KEEP, "prune keeps exactly 20 newest");
        assert_eq!(entries.first().unwrap().timestamp, 1_021, "newest first");
        assert_eq!(entries.last().unwrap().timestamp, 1_002, "oldest two pruned");
        assert!(entries.iter().all(|e| e.original == ".credentials.json"));

        // The backup holds the file CONTENT and is 0600; the dir is 0700.
        let newest = clavis.join(BACKUPS_SUBDIR).join(&entries[0].id);
        assert_eq!(fs::read(&newest).unwrap(), b"cred-content");
        #[cfg(unix)]
        {
            assert_eq!(mode_of(&newest), 0o600, "backup file 0600");
            assert_eq!(mode_of(&clavis.join(BACKUPS_SUBDIR)), 0o700, "backups dir 0700");
        }
    }

    #[test]
    fn list_is_newest_first_across_names() {
        let dir = tempfile::tempdir().unwrap();
        let clavis = dir.path().join("clavis");
        let settings = dir.path().join("settings.json");
        let cred = dir.path().join(".credentials.json");
        write(&settings, b"s");
        write(&cred, b"c");

        snapshot_at(&clavis, std::slice::from_ref(&settings), 1_000).unwrap();
        snapshot_at(&clavis, std::slice::from_ref(&cred), 2_000).unwrap();
        snapshot_at(&clavis, std::slice::from_ref(&settings), 3_000).unwrap();

        let timestamps: Vec<i64> = list(&clavis).iter().map(|e| e.timestamp).collect();
        assert_eq!(timestamps, vec![3_000, 2_000, 1_000], "newest-first across files");
    }

    #[test]
    fn snapshot_skips_missing_files() {
        let dir = tempfile::tempdir().unwrap();
        let clavis = dir.path().join("clavis");
        let present = dir.path().join("settings.json");
        let absent = dir.path().join(".credentials.json");
        write(&present, b"x");

        snapshot_at(&clavis, &[present.clone(), absent.clone()], 1_000).unwrap();

        let entries = list(&clavis);
        assert_eq!(entries.len(), 1, "only the existing file is backed up");
        assert_eq!(entries[0].original, "settings.json");
    }

    #[test]
    fn restore_copies_back_and_snapshots_current_first() {
        let dir = tempfile::tempdir().unwrap();
        let clavis = dir.path().join("clavis");
        let original = dir.path().join("settings.json");

        // v1 captured into the store.
        write(&original, b"v1-original");
        snapshot_at(&clavis, std::slice::from_ref(&original), 1_000).unwrap();
        let id = list(&clavis)[0].id.clone();

        // The live file moves on to v2 (the "current" state).
        write(&original, b"v2-current");

        // Restoring v1 must snapshot v2 FIRST, then bring v1 back.
        restore_inner(&clavis, &id, std::slice::from_ref(&original)).unwrap();

        assert_eq!(fs::read(&original).unwrap(), b"v1-original", "backup restored");
        #[cfg(unix)]
        assert_eq!(mode_of(&original), 0o600, "restore keeps 0600");

        // Two backups now exist; the newest holds the pre-restore v2 content.
        let after = list(&clavis);
        assert_eq!(after.len(), 2, "current state snapshotted before restore");
        let newest = clavis.join(BACKUPS_SUBDIR).join(&after[0].id);
        assert_eq!(fs::read(&newest).unwrap(), b"v2-current", "pre-restore state saved");
    }

    #[test]
    fn list_missing_backups_dir_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        // No snapshot was ever taken -> the backups dir does not exist.
        assert!(list(&dir.path().join("clavis")).is_empty());
    }

    #[test]
    fn restore_unknown_id_is_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let clavis = dir.path().join("clavis");
        match restore_inner(&clavis, "settings.json.999.bak", &[]) {
            Err(CoreError::NotFound(_)) => {}
            other => panic!("expected NotFound for an absent backup, got {other:?}"),
        }
    }
}
