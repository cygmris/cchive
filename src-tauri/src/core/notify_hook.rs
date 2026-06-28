//! Installs/removes a Clavis-marked desktop-notification `command` hook in
//! `~/.claude/settings.json` `hooks` for the Stop / Notification / PreToolUse
//! events (mapped to Completion / General / Tool-use).
//!
//! The edit is **surgical**: install appends one marked array element to the
//! event; remove filters out only the elements whose command carries the marker.
//! Every other hook (the user's own) and every other settings key is preserved
//! in place via `atomic_fs::write_json_preserving` after a backup (G2/G11).
//!
//! The installed state is derived purely from the presence of the marker, so
//! there is no separate state file to drift. De-fingerprinted: a `clavis-notify`
//! marker, a per-OS notification command, no server, no fixed port.
#![allow(dead_code)] // some helpers are exercised only by commands/tests

use std::path::Path;

use serde_json::{json, Map, Value};

use super::{atomic_fs, paths};
use crate::model::{CoreError, NotificationKind, NotificationState};

/// The substring embedded in every Clavis-installed hook command. Its presence
/// in a `hooks[].command` is the single source of truth for "installed".
pub const MARKER: &str = "clavis-notify";

/// The `settings.json` `hooks` event a notification kind maps to.
pub fn event_for(kind: NotificationKind) -> &'static str {
    match kind {
        NotificationKind::Completion => "Stop",
        NotificationKind::General => "Notification",
        NotificationKind::ToolUse => "PreToolUse",
    }
}

/// The marker's per-kind slug (matches the webview `NotificationKind`).
fn kind_slug(kind: NotificationKind) -> &'static str {
    match kind {
        NotificationKind::Completion => "completion",
        NotificationKind::General => "general",
        NotificationKind::ToolUse => "toolUse",
    }
}

/// The human-readable notification body for a kind (used by both the installed
/// hook command and the Test action).
pub fn message(kind: NotificationKind) -> &'static str {
    match kind {
        NotificationKind::Completion => "Claude Code finished a task",
        NotificationKind::General => "Claude Code sent a message",
        NotificationKind::ToolUse => "Claude Code is running a tool",
    }
}

/// A per-OS shell command that fires a desktop notification, with the Clavis
/// marker embedded as a trailing comment (`# clavis-notify:<kind>`). The comment
/// is inert to every shell yet lets Clavis derive and remove its own entry.
pub fn notify_command(kind: NotificationKind) -> String {
    let msg = message(kind);
    let marker = format!("# {MARKER}:{}", kind_slug(kind));

    #[cfg(target_os = "macos")]
    {
        format!("osascript -e 'display notification \"{msg}\" with title \"Clavis\"' {marker}")
    }
    #[cfg(target_os = "windows")]
    {
        format!(
            "powershell -NoProfile -WindowStyle Hidden -Command \"[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null; $t=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); $t.GetElementsByTagName('text').Item(0).AppendChild($t.CreateTextNode('Clavis')) | Out-Null; $t.GetElementsByTagName('text').Item(1).AppendChild($t.CreateTextNode('{msg}')) | Out-Null; [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Clavis').Show([Windows.UI.Notifications.ToastNotification]::new($t))\" {marker}"
        )
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        format!("notify-send \"Clavis\" \"{msg}\" {marker}")
    }
}

/// Derive which kinds are installed by scanning each event array for a marked
/// command. A missing/malformed `hooks` block reads as "all off".
pub fn derive_state(settings: &Value) -> NotificationState {
    NotificationState {
        completion: event_has_marker(settings, "Stop"),
        general: event_has_marker(settings, "Notification"),
        tool_use: event_has_marker(settings, "PreToolUse"),
    }
}

/// Read `~/.claude/settings.json` and derive the installed notification state.
pub fn read_state() -> Result<NotificationState, CoreError> {
    read_state_at(&paths::settings_path())
}

/// Install (`on`) or remove (`!on`) the marked hook for `kind` in
/// `~/.claude/settings.json`, surgically and idempotently.
pub fn set_enabled(kind: NotificationKind, on: bool) -> Result<(), CoreError> {
    set_enabled_at(&paths::settings_path(), kind, on)
}

/// Path-parameterized read (tests + explicit config dir).
pub(crate) fn read_state_at(path: &Path) -> Result<NotificationState, CoreError> {
    if !path.exists() {
        return Ok(NotificationState::default());
    }
    let value = atomic_fs::read_json_value(path)?;
    Ok(derive_state(&value))
}

/// Path-parameterized install/remove (tests + explicit config dir). Backs up
/// first, then rewrites only the targeted event array, preserving the user's
/// hooks and every other settings key.
pub(crate) fn set_enabled_at(
    path: &Path,
    kind: NotificationKind,
    on: bool,
) -> Result<(), CoreError> {
    let event = event_for(kind);
    let command = notify_command(kind);

    atomic_fs::backup(path)?;
    atomic_fs::write_json_preserving(path, None, move |value| {
        let obj = match value.as_object_mut() {
            Some(o) => o,
            None => return,
        };
        // Ensure `hooks` is an object before reaching into it.
        if !matches!(obj.get("hooks"), Some(Value::Object(_))) {
            obj.insert("hooks".to_string(), Value::Object(Map::new()));
        }
        let hooks = match obj.get_mut("hooks").and_then(Value::as_object_mut) {
            Some(h) => h,
            None => return,
        };
        // Ensure the event maps to an array before mutating it.
        if !matches!(hooks.get(event), Some(Value::Array(_))) {
            hooks.insert(event.to_string(), Value::Array(Vec::new()));
        }
        let arr = match hooks.get_mut(event).and_then(Value::as_array_mut) {
            Some(a) => a,
            None => return,
        };

        if on {
            // Idempotent: never add a second marked element.
            if !arr.iter().any(entry_has_marker) {
                arr.push(json!({
                    "hooks": [ { "type": "command", "command": command } ]
                }));
            }
        } else {
            // Remove only Clavis's marked elements; the user's stay.
            arr.retain(|entry| !entry_has_marker(entry));
        }
    })
}

/// The array of hook-config entries for an event (empty when absent/malformed).
fn entries<'a>(settings: &'a Value, event: &str) -> &'a [Value] {
    settings
        .get("hooks")
        .and_then(|h| h.get(event))
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

/// Whether an event has at least one marked (Clavis-installed) entry.
fn event_has_marker(settings: &Value, event: &str) -> bool {
    entries(settings, event).iter().any(entry_has_marker)
}

/// Whether a single hook-config entry carries a marked command in its `hooks[]`.
fn entry_has_marker(entry: &Value) -> bool {
    entry
        .get("hooks")
        .and_then(Value::as_array)
        .map(|hooks| hooks.iter().any(command_has_marker))
        .unwrap_or(false)
}

/// Whether a `{ type, command }` hook's command contains the Clavis marker.
fn command_has_marker(hook: &Value) -> bool {
    hook.get("command")
        .and_then(Value::as_str)
        .map(|c| c.contains(MARKER))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed(path: &Path, value: Value) {
        atomic_fs::atomic_write(path, value.to_string().as_bytes(), None).unwrap();
    }

    /// A realistic settings.json with a USER Stop hook + a USER PreToolUse hook
    /// plus unrelated top-level keys we must never disturb.
    fn user_seed() -> Value {
        json!({
            "model": "claude-opus",
            "hooks": {
                "Stop": [
                    { "hooks": [ { "type": "command", "command": "echo user-stop" } ] }
                ],
                "PreToolUse": [
                    { "matcher": "Bash", "hooks": [ { "type": "command", "command": "echo user-pretool" } ] }
                ]
            },
            "theme": "dark"
        })
    }

    fn read(path: &Path) -> Value {
        atomic_fs::read_json_value(path).unwrap()
    }

    /// Count entries (top-level + nested) in an event whose command carries the marker.
    fn marked_count(settings: &Value, event: &str) -> usize {
        entries(settings, event)
            .iter()
            .filter(|e| entry_has_marker(e))
            .count()
    }

    fn commands(settings: &Value, event: &str) -> Vec<String> {
        entries(settings, event)
            .iter()
            .filter_map(|e| e.get("hooks").and_then(Value::as_array))
            .flatten()
            .filter_map(|h| h.get("command").and_then(Value::as_str))
            .map(str::to_string)
            .collect()
    }

    #[test]
    fn enable_adds_marked_stop_without_removing_user_hook() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        seed(&path, user_seed());

        set_enabled_at(&path, NotificationKind::Completion, true).unwrap();

        let after = read(&path);
        // Two Stop entries now: the user's + exactly one marked Clavis element.
        assert_eq!(entries(&after, "Stop").len(), 2);
        assert_eq!(marked_count(&after, "Stop"), 1);
        // The user's Stop hook is untouched.
        assert!(commands(&after, "Stop").contains(&"echo user-stop".to_string()));
        // derive_state reports it on (others still off).
        let state = derive_state(&after);
        assert!(state.completion);
        assert!(!state.general);
        assert!(!state.tool_use);
        // Unrelated keys + the user's PreToolUse hook preserved.
        assert_eq!(after.get("model"), Some(&json!("claude-opus")));
        assert_eq!(after.get("theme"), Some(&json!("dark")));
        assert!(commands(&after, "PreToolUse").contains(&"echo user-pretool".to_string()));
    }

    #[test]
    fn disable_removes_only_marked_element() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        seed(&path, user_seed());

        set_enabled_at(&path, NotificationKind::Completion, true).unwrap();
        set_enabled_at(&path, NotificationKind::Completion, false).unwrap();

        let after = read(&path);
        // Back to just the user's Stop entry; nothing marked remains.
        assert_eq!(entries(&after, "Stop").len(), 1);
        assert_eq!(marked_count(&after, "Stop"), 0);
        assert!(commands(&after, "Stop").contains(&"echo user-stop".to_string()));
        assert!(!derive_state(&after).completion);
    }

    #[test]
    fn enable_twice_is_a_single_element() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        seed(&path, user_seed());

        set_enabled_at(&path, NotificationKind::Completion, true).unwrap();
        set_enabled_at(&path, NotificationKind::Completion, true).unwrap();

        let after = read(&path);
        assert_eq!(marked_count(&after, "Stop"), 1, "no duplicate marked element");
        assert_eq!(entries(&after, "Stop").len(), 2, "user + one Clavis only");
    }

    #[test]
    fn three_kinds_are_independent() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        seed(&path, user_seed());

        for kind in [
            NotificationKind::Completion,
            NotificationKind::General,
            NotificationKind::ToolUse,
        ] {
            set_enabled_at(&path, kind, true).unwrap();
        }

        let all_on = derive_state(&read(&path));
        assert!(all_on.completion && all_on.general && all_on.tool_use);

        // Turning one off leaves the other two installed.
        set_enabled_at(&path, NotificationKind::General, false).unwrap();
        let after = read(&path);
        let state = derive_state(&after);
        assert!(state.completion);
        assert!(!state.general);
        assert!(state.tool_use);
        // The other events' marked entries are intact; the user's hooks too.
        assert_eq!(marked_count(&after, "Stop"), 1);
        assert_eq!(marked_count(&after, "PreToolUse"), 1);
        assert_eq!(marked_count(&after, "Notification"), 0);
        assert!(commands(&after, "Stop").contains(&"echo user-stop".to_string()));
        assert!(commands(&after, "PreToolUse").contains(&"echo user-pretool".to_string()));
    }

    #[test]
    fn read_state_at_missing_file_is_all_off() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("absent.json");
        let state = read_state_at(&path).unwrap();
        assert_eq!(state, NotificationState::default());
    }

    #[test]
    fn enable_on_empty_settings_creates_hooks_block() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        set_enabled_at(&path, NotificationKind::Completion, true).unwrap();

        let after = read(&path);
        assert_eq!(marked_count(&after, "Stop"), 1);
        assert!(derive_state(&after).completion);
    }

    #[test]
    fn installed_command_carries_marker_only() {
        // The marker is `clavis-notify` — and nothing else fingerprinted.
        let cmd = notify_command(NotificationKind::Completion);
        assert!(cmd.contains(MARKER));
        assert!(cmd.contains("clavis-notify:completion"));
    }
}
