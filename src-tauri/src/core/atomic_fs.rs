//! The safe write primitive every Clavis writer is built on.
//!
//! - `atomic_write`: write a temp file in the SAME directory, fsync, rename over
//!   the target (atomic on one filesystem), then chmod (0600) on unix. Never
//!   truncate-in-place — Claude Code may be reading concurrently (G2).
//! - `backup` / `restore`: timestamped copies with keep-up-to-10 rotation, so a
//!   failed switch can always be rolled back (G1).
//! - `write_json_preserving`: parse -> mutate only the targeted keys -> atomic
//!   write, keeping every unknown key in its original order (G11, preserve_order).
#![allow(dead_code)] // scaffolding: callers (credentials/settings/switch) land later

use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

use crate::model::CoreError;

/// How many timestamped backups to keep per file before pruning the oldest.
const BACKUP_KEEP: usize = 10;
/// Infix used in backup file names: `<file>.clavis.bak.<epoch_millis>`.
const BACKUP_INFIX: &str = ".clavis.bak.";

/// Monotonic counter so two temp files created in the same millisecond don't
/// collide (the timestamp alone is not unique enough under rapid writes).
static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// Epoch milliseconds via `std::time` only.
pub fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn io_err(e: io::Error) -> CoreError {
    CoreError::Io(e.to_string())
}

/// Path of the in-same-directory temp file used for an atomic write.
fn temp_sibling(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "tmp".to_string());
    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let unique = format!(".{name}.clavis.tmp.{}.{seq}", now_millis());
    match path.parent() {
        Some(dir) => dir.join(unique),
        None => PathBuf::from(unique),
    }
}

/// Atomically replace `path` with `bytes`: temp file in the same dir -> fsync ->
/// chmod (unix, if `mode` given) -> rename. On any failure the temp is cleaned
/// up and an error is returned; the target is left untouched until the rename.
pub fn atomic_write(path: &Path, bytes: &[u8], mode: Option<u32>) -> Result<(), CoreError> {
    let dir = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    fs::create_dir_all(&dir).map_err(io_err)?;

    let tmp = temp_sibling(path);

    // Write + flush + fsync the temp file, then drop the handle.
    let write_result = (|| -> io::Result<()> {
        let mut f = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp)?;
        f.write_all(bytes)?;
        f.flush()?;
        f.sync_all()?;
        Ok(())
    })();
    if let Err(e) = write_result {
        let _ = fs::remove_file(&tmp);
        return Err(io_err(e));
    }

    // chmod the temp BEFORE the rename so the target never appears with loose
    // perms even for an instant.
    #[cfg(unix)]
    if let Some(m) = mode {
        use std::os::unix::fs::PermissionsExt;
        if let Err(e) = fs::set_permissions(&tmp, fs::Permissions::from_mode(m)) {
            let _ = fs::remove_file(&tmp);
            return Err(io_err(e));
        }
    }
    #[cfg(not(unix))]
    let _ = mode;

    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(io_err(e));
    }
    Ok(())
}

/// A backup of `original` stored at `backup`. Hold onto it to `restore` later.
#[derive(Debug, Clone)]
pub struct BackupHandle {
    pub original: PathBuf,
    pub backup: PathBuf,
}

struct BackupEntry {
    millis: u128,
    path: PathBuf,
}

fn backup_name(path: &Path, millis: u128) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(format!("{BACKUP_INFIX}{millis}"));
    PathBuf::from(name)
}

/// Enumerate existing backups for `path` (parsing the epoch-millis suffix).
fn list_backups(path: &Path) -> Vec<BackupEntry> {
    let dir = match path.parent() {
        Some(d) if !d.as_os_str().is_empty() => d.to_path_buf(),
        _ => PathBuf::from("."),
    };
    let fname = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n.to_string(),
        None => return Vec::new(),
    };
    let prefix = format!("{fname}{BACKUP_INFIX}");

    let mut out = Vec::new();
    let rd = match fs::read_dir(&dir) {
        Ok(r) => r,
        Err(_) => return out,
    };
    for entry in rd.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if let Some(suffix) = name.strip_prefix(&prefix) {
            if let Ok(millis) = suffix.parse::<u128>() {
                out.push(BackupEntry {
                    millis,
                    path: entry.path(),
                });
            }
        }
    }
    out.sort_by_key(|e| e.millis);
    out
}

/// Keep at most `BACKUP_KEEP` backups for `path`, pruning the oldest first.
fn rotate_backups(path: &Path) {
    let mut backups = list_backups(path);
    while backups.len() > BACKUP_KEEP {
        let oldest = backups.remove(0);
        let _ = fs::remove_file(&oldest.path);
    }
}

/// Copy `path` to `path.clavis.bak.<epoch_millis>` and rotate. Returns `None`
/// when `path` does not exist (nothing to back up).
pub fn backup(path: &Path) -> Result<Option<BackupHandle>, CoreError> {
    backup_at(path, now_millis())
}

/// `backup` with an explicit timestamp (so tests can assert rotation order).
fn backup_at(path: &Path, millis: u128) -> Result<Option<BackupHandle>, CoreError> {
    if !path.exists() {
        return Ok(None);
    }
    let backup = backup_name(path, millis);
    fs::copy(path, &backup).map_err(io_err)?;

    // Carry the original's permission bits onto the backup so a 0600 credential
    // backup is never world-readable.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(path) {
            let mode = meta.permissions().mode() & 0o777;
            let _ = fs::set_permissions(&backup, fs::Permissions::from_mode(mode));
        }
    }

    rotate_backups(path);
    Ok(Some(BackupHandle {
        original: path.to_path_buf(),
        backup,
    }))
}

/// Restore the original file from a backup handle (atomic write, carrying the
/// backup's permission bits so restricted files stay restricted).
pub fn restore(handle: &BackupHandle) -> Result<(), CoreError> {
    let bytes = fs::read(&handle.backup).map_err(io_err)?;
    let mode = backup_mode(&handle.backup);
    atomic_write(&handle.original, &bytes, mode)
}

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

/// Read `path` as a `serde_json::Value` (preserve_order). A parse failure maps
/// to `CoreError::CorruptFile` rather than panicking.
pub fn read_json_value(path: &Path) -> Result<Value, CoreError> {
    let bytes = fs::read(path).map_err(io_err)?;
    serde_json::from_slice(&bytes).map_err(|_| CoreError::CorruptFile(path.display().to_string()))
}

/// Read the JSON at `path` (or start from `{}` if absent), apply `mutate` to the
/// targeted keys only, and atomically write it back. Unknown keys and their
/// order are preserved (serde_json `preserve_order`). `mode` controls the unix
/// permission bits of the written file (e.g. `Some(0o600)` for credentials).
pub fn write_json_preserving<F>(
    path: &Path,
    mode: Option<u32>,
    mutate: F,
) -> Result<(), CoreError>
where
    F: FnOnce(&mut Value),
{
    let mut value = if path.exists() {
        read_json_value(path)?
    } else {
        Value::Object(serde_json::Map::new())
    };
    mutate(&mut value);
    let bytes = serde_json::to_vec_pretty(&value).map_err(CoreError::from)?;
    atomic_write(path, &bytes, mode)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    fn mode_of(path: &Path) -> u32 {
        use std::os::unix::fs::PermissionsExt;
        fs::metadata(path).unwrap().permissions().mode() & 0o777
    }

    fn temp_leftovers(dir: &Path) -> Vec<String> {
        fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains(".clavis.tmp."))
            .collect()
    }

    #[test]
    #[cfg(unix)]
    fn atomic_write_sets_0600_and_leaves_no_temp() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("secret.json");

        atomic_write(&target, b"{\"a\":1}", Some(0o600)).unwrap();

        assert_eq!(mode_of(&target), 0o600);
        assert_eq!(fs::read(&target).unwrap(), b"{\"a\":1}");
        assert!(
            temp_leftovers(dir.path()).is_empty(),
            "temp file leaked: {:?}",
            temp_leftovers(dir.path())
        );
    }

    #[test]
    fn backup_and_restore_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("data.json");
        atomic_write(&target, b"original", Some(0o600)).unwrap();

        let handle = backup(&target).unwrap().expect("backup should exist");

        atomic_write(&target, b"changed", Some(0o600)).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"changed");

        restore(&handle).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"original");
        #[cfg(unix)]
        assert_eq!(mode_of(&target), 0o600, "restore must keep 0600");
    }

    #[test]
    fn backup_of_missing_file_is_none() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("nope.json");
        assert!(backup(&target).unwrap().is_none());
    }

    #[test]
    fn rotation_keeps_up_to_ten_pruning_oldest() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("rot.json");
        atomic_write(&target, b"x", Some(0o600)).unwrap();

        // 12 backups with strictly increasing timestamps; only the newest 10 survive.
        for i in 0..12u128 {
            backup_at(&target, 1_000 + i).unwrap();
        }

        let backups = list_backups(&target);
        assert_eq!(backups.len(), 10, "should retain exactly 10");
        assert_eq!(backups.first().unwrap().millis, 1_002, "oldest two pruned");
        assert_eq!(backups.last().unwrap().millis, 1_011, "newest retained");
    }

    #[test]
    fn write_json_preserving_keeps_unknown_keys_and_order() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("preserve.json");
        // Explicit insertion order: z, mcpOAuth, claudeAiOauth, a.
        let seed = r#"{"z":1,"mcpOAuth":{"keep":true},"claudeAiOauth":{"old":1},"a":2}"#;
        atomic_write(&target, seed.as_bytes(), Some(0o600)).unwrap();

        write_json_preserving(&target, Some(0o600), |v| {
            v.as_object_mut()
                .unwrap()
                .insert("claudeAiOauth".into(), serde_json::json!({ "new": 1 }));
        })
        .unwrap();

        let txt = fs::read_to_string(&target).unwrap();
        let val: Value = serde_json::from_str(&txt).unwrap();
        let obj = val.as_object().unwrap();

        // Unknown keys preserved untouched.
        assert_eq!(obj.get("z"), Some(&serde_json::json!(1)));
        assert_eq!(obj.get("mcpOAuth"), Some(&serde_json::json!({ "keep": true })));
        assert_eq!(obj.get("a"), Some(&serde_json::json!(2)));
        // Targeted key replaced.
        assert_eq!(obj.get("claudeAiOauth"), Some(&serde_json::json!({ "new": 1 })));
        // Original key order preserved (requires serde_json preserve_order).
        let keys: Vec<String> = obj.keys().cloned().collect();
        assert_eq!(keys, vec!["z", "mcpOAuth", "claudeAiOauth", "a"]);

        #[cfg(unix)]
        assert_eq!(mode_of(&target), 0o600);
        assert!(temp_leftovers(dir.path()).is_empty());
    }

    #[test]
    fn write_json_preserving_creates_when_absent() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("new.json");
        write_json_preserving(&target, None, |v| {
            v.as_object_mut()
                .unwrap()
                .insert("hello".into(), serde_json::json!("world"));
        })
        .unwrap();

        let val = read_json_value(&target).unwrap();
        assert_eq!(val.get("hello"), Some(&serde_json::json!("world")));
    }

    #[test]
    fn read_json_value_rejects_corrupt() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("bad.json");
        atomic_write(&target, b"{ not json", None).unwrap();

        match read_json_value(&target) {
            Err(CoreError::CorruptFile(_)) => {}
            other => panic!("expected CorruptFile, got {other:?}"),
        }
    }
}
