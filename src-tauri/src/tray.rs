//! The system tray quick-switch (desktop only).
//!
//! A single `TrayIcon` (the app's C-Key mark) carries a dynamic menu that lists
//! the saved vault accounts + the configured API-provider presets as CHECKABLE
//! rows (the active one checked), plus "Add current account" / "Open cchive" /
//! "Quit". Selecting an account routes through `core::switch::switch_account` and
//! a provider through `core::providers::apply` — the SAME safe paths the in-app UI
//! uses (capture/atomic/rollback/preserve `mcpOAuth`); the tray adds NO switch
//! logic of its own. After a switch it emits `cchive-switched` (so the webview
//! invalidates its queries), fires a "Now: LABEL" notification, and rebuilds the
//! menu from truth so the check always lands on the real active config. Left-click
//! toggles the main window.
//!
//! `menu_model` is a pure function (accounts + providers + active identity → the
//! checkable rows) so the labelling + active-detection is unit-tested without a
//! running app.

use std::path::PathBuf;

use tauri::{
    menu::{CheckMenuItem, IsMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_store::StoreExt;

use crate::core::{paths, providers, switch};
use crate::model::{AccountMeta, ActiveIdentity, CoreError, ProviderMeta};

/// Stable id so the tray can be fetched again (`tray_by_id`) to swap its menu.
const TRAY_ID: &str = "cchive-tray";

/// Store file + key holding the non-secret account index (mirrors the accounts
/// command); the secret blobs live only in the OS keyring vault.
const ACCOUNTS_FILE: &str = "cchive-accounts.json";
const ACCOUNTS_KEY: &str = "accounts";

/// The cchive-managed provider index under the app config dir (same as the
/// providers command).
const PROVIDERS_INDEX: &str = "providers.json";

// Menu-item id prefixes so one `on_menu_event` can dispatch by kind. The bare
// account/provider id follows the prefix.
const ACCOUNT_PREFIX: &str = "account:";
const PROVIDER_PREFIX: &str = "provider:";
const ID_ADD_CURRENT: &str = "add-current";
const ID_OPEN: &str = "open";
const ID_QUIT: &str = "quit";

// ---------------------------------------------------------------------------
// Pure menu model (unit-tested)
// ---------------------------------------------------------------------------

/// Which switchable target a menu row drives.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ItemKind {
    Account,
    Provider,
}

/// One switchable row of the tray menu, derived purely from the current data.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MenuRow {
    pub id: String,
    pub label: String,
    pub checked: bool,
    pub kind: ItemKind,
}

/// Build the switchable rows from the account/provider lists + the active
/// identity. PURE (no I/O) so it is unit-tested in isolation. The active account
/// is matched by email (falling back to label); the active provider by label
/// (falling back to model) — mirroring the in-app Overview's active detection.
pub fn menu_model(
    accounts: &[AccountMeta],
    providers: &[ProviderMeta],
    identity: Option<&ActiveIdentity>,
) -> Vec<MenuRow> {
    let mut rows = Vec::with_capacity(accounts.len() + providers.len());
    for a in accounts {
        rows.push(MenuRow {
            id: a.id.clone(),
            label: a.label.clone(),
            checked: account_is_active(a, identity),
            kind: ItemKind::Account,
        });
    }
    for p in providers {
        rows.push(MenuRow {
            id: p.id.clone(),
            label: p.label.clone(),
            checked: provider_is_active(p, identity),
            kind: ItemKind::Provider,
        });
    }
    rows
}

/// An account is active when the live identity is account-kind and its email
/// matches (else its label matches).
fn account_is_active(account: &AccountMeta, identity: Option<&ActiveIdentity>) -> bool {
    let Some(id) = identity else { return false };
    if id.kind != "account" {
        return false;
    }
    if let (Some(ie), Some(ae)) = (id.email.as_deref(), account.email.as_deref()) {
        if ie == ae {
            return true;
        }
    }
    id.label == account.label
}

/// A provider is active when the live identity is provider-kind and its label
/// matches (else its model matches) — the same rule the Overview hero uses.
fn provider_is_active(provider: &ProviderMeta, identity: Option<&ActiveIdentity>) -> bool {
    let Some(id) = identity else { return false };
    if id.kind != "provider" {
        return false;
    }
    if id.label == provider.label {
        return true;
    }
    matches!(
        (provider.model.as_deref(), id.model.as_deref()),
        (Some(pm), Some(im)) if pm == im
    )
}

// ---------------------------------------------------------------------------
// Tray construction
// ---------------------------------------------------------------------------

/// Create the tray icon + its dynamic menu and wire the click handlers.
pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = build_menu(app)?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("cchive")
        .menu(&menu)
        // Left-click toggles the window; the menu opens on right-click.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| on_menu_event(app, event))
        .on_tray_icon_event(|tray, event| on_tray_icon_event(tray, event));
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

/// Show + focus the main window (also used by the single-instance callback).
pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Build the live menu: the checkable account/provider rows (from current data)
/// plus the fixed actions. Rebuilt after every action so newly captured accounts
/// appear and the check tracks truth.
fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let accounts = read_accounts(app);
    let provider_metas = read_providers(app);
    let identity = switch::read_active_identity().ok();
    let rows = menu_model(&accounts, &provider_metas, identity.as_ref());

    // Own the checkable items so the `&dyn` refs below stay alive past `with_items`.
    let mut checkables: Vec<CheckMenuItem<R>> = Vec::with_capacity(rows.len());
    for row in &rows {
        let prefix = match row.kind {
            ItemKind::Account => ACCOUNT_PREFIX,
            ItemKind::Provider => PROVIDER_PREFIX,
        };
        checkables.push(CheckMenuItem::with_id(
            app,
            format!("{prefix}{}", row.id),
            &row.label,
            true,
            row.checked,
            None::<&str>,
        )?);
    }

    let sep_top = PredefinedMenuItem::separator(app)?;
    let add_current =
        MenuItem::with_id(app, ID_ADD_CURRENT, "Add current account", true, None::<&str>)?;
    let open = MenuItem::with_id(app, ID_OPEN, "Open cchive", true, None::<&str>)?;
    let sep_bottom = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, ID_QUIT, "Quit", true, None::<&str>)?;

    let mut items: Vec<&dyn IsMenuItem<R>> = Vec::with_capacity(checkables.len() + 5);
    for c in &checkables {
        items.push(c);
    }
    items.push(&sep_top);
    items.push(&add_current);
    items.push(&open);
    items.push(&sep_bottom);
    items.push(&quit);

    Menu::with_items(app, &items)
}

/// Swap the tray's menu for a freshly built one (best-effort).
fn rebuild_menu<R: Runtime>(app: &AppHandle<R>) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(menu) = build_menu(app) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id.as_ref();
    if id == ID_QUIT {
        app.exit(0);
    } else if id == ID_OPEN {
        show_main_window(app);
    } else if id == ID_ADD_CURRENT {
        match add_current_account(app) {
            Ok(label) => notify(app, &format!("Added {label}")),
            Err(e) => notify(app, &format!("Couldn't add account: {e}")),
        }
        rebuild_menu(app);
    } else if let Some(account_id) = id.strip_prefix(ACCOUNT_PREFIX) {
        perform_switch(app, Target::Account(account_id.to_string()));
    } else if let Some(provider_id) = id.strip_prefix(PROVIDER_PREFIX) {
        perform_switch(app, Target::Provider(provider_id.to_string()));
    }
}

fn on_tray_icon_event<R: Runtime>(tray: &TrayIcon<R>, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        toggle_main_window(tray.app_handle());
    }
}

// ---------------------------------------------------------------------------
// Actions (thin adapters over the safe core — no duplicated switch logic)
// ---------------------------------------------------------------------------

/// What a checkable row routes to.
enum Target {
    Account(String),
    Provider(String),
}

/// Run a switch via the safe core, then emit + notify + rebuild from truth. A
/// failed switch (core rolled back) notifies the error; the rebuilt menu leaves
/// the check on the real active config.
fn perform_switch<R: Runtime>(app: &AppHandle<R>, target: Target) {
    let outcome = match &target {
        Target::Account(id) => switch::switch_account(id).map(|r| r.identity),
        Target::Provider(id) => apply_provider(app, id),
    };
    match outcome {
        Ok(identity) => {
            let _ = app.emit("cchive-switched", &identity);
            notify(app, &format!("Now: {}", identity.label));
        }
        Err(e) => notify(app, &format!("Switch failed: {e}")),
    }
    rebuild_menu(app);
}

/// Apply an API-provider preset through `core::providers::apply` (resolving the
/// index + `settings.json` paths), then describe the now-active provider so the
/// caller can emit + toast it. The provider has no credential identity, so the
/// label comes from the index.
fn apply_provider<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<ActiveIdentity, CoreError> {
    let index = providers_index(app)
        .ok_or_else(|| CoreError::Io("could not resolve the app config dir".to_string()))?;
    providers::apply(&index, &paths::settings_path(), id)?;
    let label = read_providers(app)
        .into_iter()
        .find(|p| p.id == id)
        .map(|p| p.label)
        .unwrap_or_else(|| "provider".to_string());
    Ok(ActiveIdentity {
        kind: "provider".to_string(),
        label,
        email: None,
        org: None,
        tier: None,
        model: None,
        expires_at: None,
    })
}

/// Capture the currently-logged-in account into the vault + the account index by
/// reusing the accounts command (vault write + index upsert) verbatim.
fn add_current_account<R: Runtime>(app: &AppHandle<R>) -> Result<String, CoreError> {
    let meta = crate::commands::accounts::add_account_from_active(app.clone())?;
    Ok(meta.label)
}

// ---------------------------------------------------------------------------
// Window + data helpers
// ---------------------------------------------------------------------------

fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn notify<R: Runtime>(app: &AppHandle<R>, body: &str) {
    let _ = app
        .notification()
        .builder()
        .title("cchive")
        .body(body)
        .show();
}

/// Read the saved-account index (labels + ids) from the cchive store.
fn read_accounts<R: Runtime>(app: &AppHandle<R>) -> Vec<AccountMeta> {
    app.store(ACCOUNTS_FILE)
        .ok()
        .and_then(|s| s.get(ACCOUNTS_KEY))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

/// List the configured providers (empty on any error).
fn read_providers<R: Runtime>(app: &AppHandle<R>) -> Vec<ProviderMeta> {
    providers_index(app)
        .and_then(|p| providers::list(&p).ok())
        .unwrap_or_default()
}

/// Resolve the provider index path under the app config dir (same as the command).
fn providers_index<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join(PROVIDERS_INDEX))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn account(id: &str, label: &str, email: Option<&str>) -> AccountMeta {
        AccountMeta {
            id: id.to_string(),
            label: label.to_string(),
            email: email.map(str::to_string),
            tier: None,
            last_used: None,
        }
    }

    fn provider(id: &str, label: &str, model: Option<&str>) -> ProviderMeta {
        ProviderMeta {
            id: id.to_string(),
            label: label.to_string(),
            base_url: None,
            model: model.map(str::to_string),
        }
    }

    fn identity(kind: &str, label: &str, email: Option<&str>, model: Option<&str>) -> ActiveIdentity {
        ActiveIdentity {
            kind: kind.to_string(),
            label: label.to_string(),
            email: email.map(str::to_string),
            org: None,
            tier: None,
            model: model.map(str::to_string),
            expires_at: None,
        }
    }

    #[test]
    fn menu_model_checks_active_account_by_email_and_lists_kinds() {
        let accounts = [
            account("uuid-a", "a@example.test", Some("a@example.test")),
            account("uuid-b", "b@example.test", Some("b@example.test")),
        ];
        let providers = [provider("zai-1", "GLM-4.6 · Z.ai", Some("glm-4.6"))];
        // The live identity is the account b@ (account kind matches on email).
        let id = identity("account", "b@example.test", Some("b@example.test"), None);

        let rows = menu_model(&accounts, &providers, Some(&id));

        assert_eq!(rows.len(), 3, "two accounts + one provider");

        assert_eq!(rows[0].id, "uuid-a");
        assert_eq!(rows[0].kind, ItemKind::Account);
        assert!(!rows[0].checked, "a@ is not active");

        assert_eq!(rows[1].id, "uuid-b");
        assert_eq!(rows[1].label, "b@example.test");
        assert!(rows[1].checked, "b@ is the active account -> checked");

        assert_eq!(rows[2].id, "zai-1");
        assert_eq!(rows[2].label, "GLM-4.6 · Z.ai");
        assert_eq!(rows[2].kind, ItemKind::Provider);
        assert!(!rows[2].checked, "no provider active while an account is");
    }

    #[test]
    fn menu_model_checks_active_provider_by_label_then_model() {
        let accounts = [account("uuid-a", "a@example.test", Some("a@example.test"))];
        let providers = [
            provider("p-label", "Z.ai", Some("glm-4.6")),
            provider("p-model", "Other", Some("kimi-k2")),
        ];

        // Label match wins for the first provider.
        let by_label = identity("provider", "Z.ai", None, None);
        let rows = menu_model(&accounts, &providers, Some(&by_label));
        assert!(!rows[0].checked, "the account is not active");
        assert!(rows[1].checked, "provider matched on label");
        assert!(!rows[2].checked);

        // Model match is the fallback for the second provider.
        let by_model = identity("provider", "Unknown label", None, Some("kimi-k2"));
        let rows = menu_model(&accounts, &providers, Some(&by_model));
        assert!(!rows[1].checked, "neither label nor model matches the first provider");
        assert!(rows[2].checked, "provider matched on model fallback");
    }

    #[test]
    fn menu_model_with_no_identity_checks_nothing() {
        let accounts = [account("uuid-a", "a@example.test", Some("a@example.test"))];
        let providers = [provider("zai-1", "Z.ai", Some("glm-4.6"))];

        let rows = menu_model(&accounts, &providers, None);
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|r| !r.checked), "nothing is checked without an identity");
    }
}
