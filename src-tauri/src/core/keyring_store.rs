//! Clavis's own vaults in the OS keyring.
//!
//! Two sibling service namespaces, each keyed by entry id:
//! - `app.clavis.accounts` — saved-account secret blobs (subscription switch).
//! - `app.clavis.providers` — per-provider auth tokens (API-provider mode).
//!
//! This is the ONLY place that touches the Clavis vault namespaces; the live
//! Claude Code credential (`Claude Code-credentials`) is handled separately in
//! `core::credentials`. Secret blobs are opaque strings here and are NEVER
//! logged — only ids and outcomes ever appear in any diagnostic.
//!
//! Tests run headless (no live Secret Service): a `cfg(test)` in-memory backend
//! is swapped in, so the real `KeyringBackend` is compiled but not exercised.
#![allow(dead_code)] // callers (switch/commands) land in later tasks

use crate::model::CoreError;

/// Keyring service under which every saved-account secret blob is stored.
const ACCOUNTS_SERVICE: &str = "app.clavis.accounts";

/// Keyring service under which every provider auth token is stored.
const PROVIDERS_SERVICE: &str = "app.clavis.providers";

/// Backend the vault dispatches to. `Sync` so the `'static` trait object can be
/// shared across cargo's parallel test threads. Every call is namespaced by
/// `service` so accounts and providers never collide.
trait VaultBackend: Sync {
    fn put(&self, service: &str, id: &str, blob: &str) -> Result<(), CoreError>;
    fn get(&self, service: &str, id: &str) -> Result<String, CoreError>;
    fn delete(&self, service: &str, id: &str) -> Result<(), CoreError>;
    fn has(&self, service: &str, id: &str) -> Result<bool, CoreError>;
}

/// Map a keyring crate error to `CoreError`, never embedding a secret value.
fn map_err(e: keyring::Error) -> CoreError {
    match e {
        keyring::Error::NoEntry => CoreError::NotFound("vault entry".to_string()),
        other => CoreError::Keyring(other.to_string()),
    }
}

/// The real OS-keyring backend (Secret Service / Keychain / Credential Manager).
struct KeyringBackend;

impl KeyringBackend {
    fn entry(&self, service: &str, id: &str) -> Result<keyring::Entry, CoreError> {
        keyring::Entry::new(service, id).map_err(map_err)
    }
}

impl VaultBackend for KeyringBackend {
    fn put(&self, service: &str, id: &str, blob: &str) -> Result<(), CoreError> {
        self.entry(service, id)?.set_password(blob).map_err(map_err)
    }

    fn get(&self, service: &str, id: &str) -> Result<String, CoreError> {
        self.entry(service, id)?.get_password().map_err(map_err)
    }

    fn delete(&self, service: &str, id: &str) -> Result<(), CoreError> {
        // Idempotent: deleting an absent entry is not an error.
        match self.entry(service, id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(map_err(e)),
        }
    }

    fn has(&self, service: &str, id: &str) -> Result<bool, CoreError> {
        match self.entry(service, id)?.get_password() {
            Ok(_) => Ok(true),
            Err(keyring::Error::NoEntry) => Ok(false),
            Err(e) => Err(map_err(e)),
        }
    }
}

#[cfg(not(test))]
fn backend() -> &'static dyn VaultBackend {
    &KeyringBackend
}

#[cfg(test)]
fn backend() -> &'static dyn VaultBackend {
    &MOCK
}

/// Store (or replace) the secret blob for account `id`.
pub fn vault_put(id: &str, blob: &str) -> Result<(), CoreError> {
    if id.is_empty() {
        return Err(CoreError::InvalidInput("empty account id".to_string()));
    }
    backend().put(ACCOUNTS_SERVICE, id, blob)
}

/// Read the secret blob for account `id`. Absent entry -> `CoreError::NotFound`.
pub fn vault_get(id: &str) -> Result<String, CoreError> {
    if id.is_empty() {
        return Err(CoreError::InvalidInput("empty account id".to_string()));
    }
    backend().get(ACCOUNTS_SERVICE, id)
}

/// Delete the secret blob for account `id`. Absent entry is a no-op (idempotent).
pub fn vault_delete(id: &str) -> Result<(), CoreError> {
    if id.is_empty() {
        return Err(CoreError::InvalidInput("empty account id".to_string()));
    }
    backend().delete(ACCOUNTS_SERVICE, id)
}

/// Whether a secret blob exists for account `id`.
pub fn vault_has(id: &str) -> Result<bool, CoreError> {
    if id.is_empty() {
        return Err(CoreError::InvalidInput("empty account id".to_string()));
    }
    backend().has(ACCOUNTS_SERVICE, id)
}

/// Store (or replace) the auth token for provider `id`.
pub fn provider_vault_put(id: &str, token: &str) -> Result<(), CoreError> {
    if id.is_empty() {
        return Err(CoreError::InvalidInput("empty provider id".to_string()));
    }
    backend().put(PROVIDERS_SERVICE, id, token)
}

/// Read the auth token for provider `id`. Absent entry -> `CoreError::NotFound`.
pub fn provider_vault_get(id: &str) -> Result<String, CoreError> {
    if id.is_empty() {
        return Err(CoreError::InvalidInput("empty provider id".to_string()));
    }
    backend().get(PROVIDERS_SERVICE, id)
}

/// Delete the auth token for provider `id`. Absent entry is a no-op (idempotent).
pub fn provider_vault_delete(id: &str) -> Result<(), CoreError> {
    if id.is_empty() {
        return Err(CoreError::InvalidInput("empty provider id".to_string()));
    }
    backend().delete(PROVIDERS_SERVICE, id)
}

/// Whether an auth token exists for provider `id`.
pub fn provider_vault_has(id: &str) -> Result<bool, CoreError> {
    if id.is_empty() {
        return Err(CoreError::InvalidInput("empty provider id".to_string()));
    }
    backend().has(PROVIDERS_SERVICE, id)
}

// ---------------------------------------------------------------------------
// In-memory backend for headless tests (no live Secret Service required).
// ---------------------------------------------------------------------------
#[cfg(test)]
use std::collections::BTreeMap;
#[cfg(test)]
use std::sync::Mutex;

#[cfg(test)]
struct MockBackend {
    store: Mutex<BTreeMap<String, String>>,
}

#[cfg(test)]
static MOCK: MockBackend = MockBackend {
    store: Mutex::new(BTreeMap::new()),
};

#[cfg(test)]
impl MockBackend {
    /// Compose the namespaced map key so the two services never collide.
    fn key(service: &str, id: &str) -> String {
        format!("{service}\u{1f}{id}")
    }
}

#[cfg(test)]
impl VaultBackend for MockBackend {
    fn put(&self, service: &str, id: &str, blob: &str) -> Result<(), CoreError> {
        self.store
            .lock()
            .unwrap()
            .insert(Self::key(service, id), blob.to_string());
        Ok(())
    }

    fn get(&self, service: &str, id: &str) -> Result<String, CoreError> {
        self.store
            .lock()
            .unwrap()
            .get(&Self::key(service, id))
            .cloned()
            .ok_or_else(|| CoreError::NotFound("vault entry".to_string()))
    }

    fn delete(&self, service: &str, id: &str) -> Result<(), CoreError> {
        self.store.lock().unwrap().remove(&Self::key(service, id));
        Ok(())
    }

    fn has(&self, service: &str, id: &str) -> Result<bool, CoreError> {
        Ok(self.store.lock().unwrap().contains_key(&Self::key(service, id)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn put_get_round_trips() {
        let id = "acc-roundtrip";
        let blob = r#"{"claudeAiOauth":{"accessToken":"x"}}"#;
        vault_put(id, blob).unwrap();
        assert_eq!(vault_get(id).unwrap(), blob);
    }

    #[test]
    fn has_reflects_presence() {
        let id = "acc-has";
        assert!(!vault_has(id).unwrap(), "absent before put");
        vault_put(id, "blob").unwrap();
        assert!(vault_has(id).unwrap(), "present after put");
        vault_delete(id).unwrap();
        assert!(!vault_has(id).unwrap(), "absent after delete");
    }

    #[test]
    fn delete_removes_and_get_is_not_found() {
        let id = "acc-delete";
        vault_put(id, "blob").unwrap();
        vault_delete(id).unwrap();
        match vault_get(id) {
            Err(CoreError::NotFound(_)) => {}
            other => panic!("expected NotFound after delete, got {other:?}"),
        }
    }

    #[test]
    fn put_overwrites_existing() {
        let id = "acc-overwrite";
        vault_put(id, "first").unwrap();
        vault_put(id, "second").unwrap();
        assert_eq!(vault_get(id).unwrap(), "second");
    }

    #[test]
    fn delete_absent_is_idempotent() {
        // No prior put for this id; delete must not error.
        vault_delete("acc-never-existed").unwrap();
    }

    #[test]
    fn empty_id_is_invalid_input() {
        match vault_get("") {
            Err(CoreError::InvalidInput(_)) => {}
            other => panic!("expected InvalidInput for empty id, got {other:?}"),
        }
    }
}
