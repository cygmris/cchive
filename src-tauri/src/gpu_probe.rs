//! Pick the WebKitGTK render path that actually works on this GPU, once per
//! driver + card, and remember it.
//!
//! On NVIDIA + Wayland, WebKitGTK's DMA-BUF renderer can trip a compositor
//! protocol error before the first window is shown —
//! `Gdk-Message: Error 71 (Protocol error) dispatching to Wayland display` —
//! and the app exits. `WEBKIT_DISABLE_DMABUF_RENDERER=1` avoids it at the cost
//! of the zero-copy path. Whether the fast path works depends on the driver,
//! the card and the compositor, and changes when any of them is upgraded, so
//! instead of disabling it unconditionally this module probes it the first
//! time a driver/card combination is seen and records the answer.
//!
//! The two verdicts are deliberately asymmetric, because a wrong record sticks
//! until the next driver or card change:
//! - **fast path works** is written only on hard evidence: the probe child
//!   finished loading its page and stayed alive [`OK_GRACE`] afterwards;
//! - **needs the switch** is written only by the re-launched run that has the
//!   switch on, once *its* page has loaded — so an unrelated startup failure
//!   (keyring, corrupt config) is never mistaken for a render problem.
//! Anything else — a locked session, an autostart, a probe that never reaches
//! its page — writes nothing and launches with the switch on.
//!
//! Known limit: the key is driver version + card, not compositor version, so a
//! KWin upgrade alone does not trigger a fresh probe.

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// The switch itself, read by WebKitGTK.
const SWITCH: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
/// NVIDIA's own escape hatch. A user who set it has already chosen a path.
const NV_SWITCH: &str = "__NV_DISABLE_EXPLICIT_SYNC";
/// Probe child → touch this file once the page has loaded. Also marks the
/// process as the probe child, so it never probes again itself.
const MARKER_ENV: &str = "CCHIVE_GPU_PROBE_MARKER";
/// Re-launched run with the switch on → write "needs the switch" for this key
/// once its own page has loaded.
const CONFIRM_ENV: &str = "CCHIVE_GPU_PROBE_CONFIRM";

/// The child must survive this long after its page loaded to count as working.
const OK_GRACE: Duration = Duration::from_secs(2);
/// No page load within this long means the probe saw nothing either way.
const PROBE_TIMEOUT: Duration = Duration::from_secs(15);

/// What was learned for one driver + card combination.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub key: String,
    pub needs_workaround: bool,
}

/// Everything [`decide`] looks at, gathered from the environment up front.
#[derive(Debug, Clone, Default)]
pub struct Facts {
    pub nvidia_wayland: bool,
    pub user_override: bool,
    pub is_probe_child: bool,
    pub key: String,
    pub record: Option<Record>,
    pub autostart: bool,
    /// `None` when the lock state could not be read.
    pub locked: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Plan {
    /// Leave the environment alone.
    Nothing,
    /// Turn the switch on for this launch; write nothing.
    Workaround,
    /// Try the fast path in a child process and record the result.
    Probe,
}

pub fn decide(f: &Facts) -> Plan {
    if !f.nvidia_wayland || f.user_override || f.is_probe_child {
        return Plan::Nothing;
    }
    if let Some(r) = &f.record {
        if r.key == f.key {
            return if r.needs_workaround { Plan::Workaround } else { Plan::Nothing };
        }
    }
    // A probe needs a window that actually gets painted: an autostart may come
    // up hidden, and a locked session paints nothing while every process stays
    // alive — both would read as "works" and poison the record.
    if f.autostart || f.locked != Some(false) {
        return Plan::Workaround;
    }
    Plan::Probe
}

/// What the probe child has done so far, as seen by the parent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ChildState {
    /// Exit code once the child has exited (`None` while running; a signal
    /// death reports as `Some(-1)`).
    pub exit: Option<i32>,
    /// Time since the child's page finished loading, if it has.
    pub since_ready: Option<Duration>,
    pub elapsed: Duration,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// Still undecided; keep polling.
    Pending,
    /// The fast path rendered and stayed up.
    Ok,
    /// Died early — retry with the switch on.
    Crashed,
    /// Exited cleanly (e.g. handed off to an already-running instance).
    Exited,
    /// Never reached its page in time; learn nothing.
    Inconclusive,
}

pub fn classify(s: &ChildState) -> Verdict {
    match s.exit {
        Some(0) => Verdict::Exited,
        // A crash after the grace period is not a startup render failure.
        Some(_) if s.since_ready.is_some_and(|d| d >= OK_GRACE) => Verdict::Exited,
        Some(_) => Verdict::Crashed,
        None if s.since_ready.is_some_and(|d| d >= OK_GRACE) => Verdict::Ok,
        None if s.since_ready.is_none() && s.elapsed >= PROBE_TIMEOUT => Verdict::Inconclusive,
        None => Verdict::Pending,
    }
}

/// Identity of the render stack the verdict applies to: the NVIDIA driver
/// version plus every NVIDIA display device id. `None` when no version can be
/// read (then there is nothing stable to key a record on).
pub fn key_from(driver_version_file: &str, device_ids: &[String]) -> Option<String> {
    let version = driver_version_file
        .lines()
        .next()?
        .split_whitespace()
        .find(|w| w.chars().next().is_some_and(|c| c.is_ascii_digit()) && w.contains('.'))?;
    let mut ids = device_ids.to_vec();
    ids.sort();
    Some(format!("{version}|{}", ids.join(",")))
}

/// NVIDIA display controllers under `sysfs_pci` (`/sys/bus/pci/devices`).
pub fn nvidia_display_ids(sysfs_pci: &Path) -> Vec<String> {
    let read = |p: PathBuf| std::fs::read_to_string(p).map(|s| s.trim().to_string()).ok();
    let Ok(entries) = std::fs::read_dir(sysfs_pci) else { return Vec::new() };
    entries
        .flatten()
        .filter_map(|e| {
            let d = e.path();
            let vendor = read(d.join("vendor"))?;
            let class = read(d.join("class"))?;
            // 0x03xxxx = display controller (VGA / 3D / other).
            (vendor == "0x10de" && class.starts_with("0x03")).then(|| read(d.join("device")))?
        })
        .collect()
}

/// Parse `gdbus call … org.freedesktop.ScreenSaver.GetActive` output.
pub fn parse_locked(gdbus_output: &str) -> Option<bool> {
    match gdbus_output.trim() {
        "(true,)" => Some(true),
        "(false,)" => Some(false),
        _ => None,
    }
}

pub fn read_record(file: &Path) -> Option<Record> {
    serde_json::from_slice(&std::fs::read(file).ok()?).ok()
}

pub fn write_record(file: &Path, record: &Record) {
    if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(bytes) = serde_json::to_vec_pretty(record) {
        // Best effort: failing to remember only means probing again next time.
        let _ = crate::core::atomic_fs::atomic_write(file, &bytes, Some(0o644));
    }
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/// Where the verdict for the current driver + card is kept.
fn record_path() -> PathBuf {
    crate::core::paths::cchive_config_dir().join("gpu-probe.json")
}

/// Run before Tauri starts. Sets the switch, leaves it off, or runs the probe
/// (which either exits this process or replaces it).
pub fn prepare() {
    let nvidia = Path::new("/proc/driver/nvidia/version");
    let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some()
        && std::env::var("GDK_BACKEND").map_or(true, |b| !b.starts_with("x11"));
    let key = std::fs::read_to_string(nvidia)
        .ok()
        .and_then(|v| key_from(&v, &nvidia_display_ids(Path::new("/sys/bus/pci/devices"))));

    let mut facts = Facts {
        nvidia_wayland: nvidia.exists() && wayland,
        user_override: std::env::var_os(SWITCH).is_some() || std::env::var_os(NV_SWITCH).is_some(),
        is_probe_child: std::env::var_os(MARKER_ENV).is_some(),
        key: key.clone().unwrap_or_default(),
        record: read_record(&record_path()),
        autostart: std::env::args().any(|a| a == "--autostart"),
        // Optimistic placeholder: the lock state only matters on the branch
        // that would probe, so the `gdbus` call is made only when needed.
        locked: Some(false),
    };
    // An NVIDIA driver whose version cannot be read gives nothing to key a
    // record on — run safe, remember nothing.
    if facts.nvidia_wayland && key.is_none() {
        facts.locked = None;
    }

    let mut plan = decide(&facts);
    if plan == Plan::Probe {
        facts.locked = session_locked();
        plan = decide(&facts);
    }
    match plan {
        Plan::Nothing => {}
        Plan::Workaround => std::env::set_var(SWITCH, "1"),
        Plan::Probe => probe(&facts.key),
    }
}

/// Called when the main webview finishes loading — the first moment the render
/// path has demonstrably worked. Acts once per process.
pub fn on_page_ready() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        if let Some(marker) = std::env::var_os(MARKER_ENV) {
            let _ = std::fs::write(marker, b"");
        }
        if let Ok(key) = std::env::var(CONFIRM_ENV) {
            // This run had the switch on and got its page up: the switch is
            // what makes this driver + card work.
            write_record(&record_path(), &Record { key, needs_workaround: true });
        }
    });
}

fn session_locked() -> Option<bool> {
    let out = std::process::Command::new("gdbus")
        .args([
            "call",
            "--session",
            "--dest",
            "org.freedesktop.ScreenSaver",
            "--object-path",
            "/ScreenSaver",
            "--method",
            "org.freedesktop.ScreenSaver.GetActive",
        ])
        .output()
        .ok()?;
    parse_locked(&String::from_utf8_lossy(&out.stdout))
}

/// Try the fast path in a child and act on the result. Returns only when the
/// probe could not be run, after turning the switch on for this process.
fn probe(key: &str) {
    use std::os::unix::process::CommandExt;
    use std::process::Command;
    use std::time::Instant;

    let exe = match std::env::current_exe() {
        Ok(e) => e,
        Err(_) => return std::env::set_var(SWITCH, "1"),
    };
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let marker = std::env::temp_dir().join(format!("cchive-gpu-probe-{}", std::process::id()));
    let _ = std::fs::remove_file(&marker);

    let mut child = match Command::new(&exe).args(&args).env(MARKER_ENV, &marker).spawn() {
        Ok(c) => c,
        Err(_) => return std::env::set_var(SWITCH, "1"),
    };

    let start = Instant::now();
    let mut ready_at: Option<Instant> = None;
    loop {
        // Check the marker before reaping, so a child that loaded its page and
        // died in the same poll interval is still seen as "died right after".
        if ready_at.is_none() && marker.exists() {
            ready_at = Some(Instant::now());
        }
        // `try_wait` reaps the child when it has exited, so there is no zombie
        // to carry across the `exec` below.
        let exit = match child.try_wait() {
            Ok(Some(st)) => Some(st.code().unwrap_or(-1)),
            Ok(None) => None,
            Err(_) => Some(-1),
        };
        let state = ChildState {
            exit,
            since_ready: ready_at.map(|t| t.elapsed()),
            elapsed: start.elapsed(),
        };
        match classify(&state) {
            Verdict::Pending => std::thread::sleep(Duration::from_millis(100)),
            Verdict::Ok => {
                let _ = std::fs::remove_file(&marker);
                write_record(&record_path(), &Record { key: key.to_string(), needs_workaround: false });
                // The child keeps running as the app; this launcher is done.
                std::process::exit(0);
            }
            Verdict::Exited | Verdict::Inconclusive => {
                let _ = std::fs::remove_file(&marker);
                std::process::exit(exit.unwrap_or(0));
            }
            Verdict::Crashed => {
                let _ = std::fs::remove_file(&marker);
                // Same pid, switch on; that run confirms and records "needs"
                // once its own page has loaded. `exec` returns only on failure.
                let _ = Command::new(&exe).args(&args).env(SWITCH, "1").env(CONFIRM_ENV, key).exec();
                return std::env::set_var(SWITCH, "1");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts() -> Facts {
        Facts {
            nvidia_wayland: true,
            key: "615.71.09|0x2d04".into(),
            locked: Some(false),
            ..Facts::default()
        }
    }

    fn rec(key: &str, needs: bool) -> Option<Record> {
        Some(Record { key: key.into(), needs_workaround: needs })
    }

    #[test]
    fn nothing_off_nvidia_wayland_or_when_overridden_or_in_the_child() {
        assert_eq!(decide(&Facts { nvidia_wayland: false, ..facts() }), Plan::Nothing);
        assert_eq!(decide(&Facts { user_override: true, ..facts() }), Plan::Nothing);
        assert_eq!(decide(&Facts { is_probe_child: true, ..facts() }), Plan::Nothing);
    }

    #[test]
    fn a_matching_record_is_followed_without_probing() {
        assert_eq!(decide(&Facts { record: rec("615.71.09|0x2d04", true), ..facts() }), Plan::Workaround);
        assert_eq!(decide(&Facts { record: rec("615.71.09|0x2d04", false), ..facts() }), Plan::Nothing);
    }

    #[test]
    fn a_new_driver_or_card_probes_again() {
        assert_eq!(decide(&Facts { record: rec("610.57.04|0x2d04", true), ..facts() }), Plan::Probe);
        assert_eq!(decide(&facts()), Plan::Probe);
    }

    #[test]
    fn never_probe_when_the_window_may_not_be_painted() {
        assert_eq!(decide(&Facts { autostart: true, ..facts() }), Plan::Workaround);
        assert_eq!(decide(&Facts { locked: Some(true), ..facts() }), Plan::Workaround);
        assert_eq!(decide(&Facts { locked: None, ..facts() }), Plan::Workaround);
        // …but a matching record still wins over the conservative default.
        assert_eq!(
            decide(&Facts { autostart: true, record: rec("615.71.09|0x2d04", false), ..facts() }),
            Plan::Nothing
        );
    }

    fn st(exit: Option<i32>, ready_ms: Option<u64>, elapsed_ms: u64) -> ChildState {
        ChildState {
            exit,
            since_ready: ready_ms.map(Duration::from_millis),
            elapsed: Duration::from_millis(elapsed_ms),
        }
    }

    #[test]
    fn classify_covers_every_outcome() {
        // The measured failure: non-zero exit ~0.9s in, page never loaded.
        assert_eq!(classify(&st(Some(1), None, 900)), Verdict::Crashed);
        // Died right after the page loaded — still a render failure.
        assert_eq!(classify(&st(Some(1), Some(500), 1500)), Verdict::Crashed);
        assert_eq!(classify(&st(Some(-1), None, 900)), Verdict::Crashed);
        // Handed off to a running instance.
        assert_eq!(classify(&st(Some(0), None, 300)), Verdict::Exited);
        // Page loaded and stayed up.
        assert_eq!(classify(&st(None, Some(2000), 3000)), Verdict::Ok);
        assert_eq!(classify(&st(None, Some(1999), 3000)), Verdict::Pending);
        // Never reached its page.
        assert_eq!(classify(&st(None, None, 15_000)), Verdict::Inconclusive);
        assert_eq!(classify(&st(None, None, 14_999)), Verdict::Pending);
    }

    #[test]
    fn key_uses_the_driver_version_and_sorted_device_ids() {
        let proc_line = "NVRM version: NVIDIA UNIX Open Kernel Module for x86_64  615.71.09  Release Build  (root@)\nGCC version: gcc 16";
        assert_eq!(
            key_from(proc_line, &["0x2d04".into(), "0x1b80".into()]).as_deref(),
            Some("615.71.09|0x1b80,0x2d04")
        );
        assert_eq!(key_from("", &[]), None);
        assert_eq!(key_from("NVRM version: garbage", &[]), None);
    }

    #[test]
    fn nvidia_ids_come_only_from_nvidia_display_devices() {
        let dir = tempfile::tempdir().unwrap();
        let dev = |name: &str, vendor: &str, class: &str, device: &str| {
            let d = dir.path().join(name);
            std::fs::create_dir(&d).unwrap();
            std::fs::write(d.join("vendor"), vendor).unwrap();
            std::fs::write(d.join("class"), class).unwrap();
            std::fs::write(d.join("device"), device).unwrap();
        };
        dev("0000:02:00.0", "0x10de\n", "0x030000\n", "0x2d04\n"); // the card
        dev("0000:02:00.1", "0x10de\n", "0x040300\n", "0x22eb\n"); // its HDMI audio
        dev("0000:00:02.0", "0x8086\n", "0x030000\n", "0x7d67\n"); // Intel iGPU
        assert_eq!(nvidia_display_ids(dir.path()), vec!["0x2d04".to_string()]);
    }

    #[test]
    fn lock_state_parsing() {
        assert_eq!(parse_locked("(false,)\n"), Some(false));
        assert_eq!(parse_locked("(true,)"), Some(true));
        assert_eq!(parse_locked("Error: no such service"), None);
    }

    #[test]
    fn record_round_trips_and_garbage_reads_as_none() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("sub/gpu-probe.json");
        let r = Record { key: "k".into(), needs_workaround: true };
        write_record(&file, &r);
        assert_eq!(read_record(&file), Some(r));
        std::fs::write(&file, b"{not json").unwrap();
        assert_eq!(read_record(&file), None);
    }
}
