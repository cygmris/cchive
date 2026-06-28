//! Clavis's own account vault in the OS keyring.
//!
//! Service namespace `app.clavis.accounts`, entry key = account id. This is the
//! ONLY place that touches the Clavis vault namespace; the live Claude Code
//! credential (`Claude Code-credentials`) is handled separately in
//! `core::credentials`. Secret blobs are opaque strings here and are NEVER
//! logged — only ids and outcomes ever appear in any diagnostic.
//!
//! Tests run headless (no live Secret Service): a `cfg(test)` in-memory backend
//! is swapped in, so the real `KeyringBackend` is compiled but not exercised.
#![allow(dead_code)] // callers (switch/commands) land in later tasks

use crate::model::CoreError;

/// Keyring service under which every saved-account secret blob is stored.
const SERVICE: &str = "app.clavis.accounts";

/// Backend the vault dispatches to. `Sync` so the `'static` trait object can be
/// shared across cargo's parallel test threads.
trait VaultBackend: Sync {
    fn put(&self, id: &str, blob: &str) -> Result<(), CoreError>;
    fn get(&self, id: &str) -> Result<String, CoreError>;
    fn delete(&self, id: &str) -> Result<(), CoreError>;
    fn has(&self, id: &str) -> Result<bool, CoreError>;
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
    fn entry(&self, id: &str) -> Result<keyring::Entry, CoreError> {
        keyring::Entry::new(SERVICE, id).map_err(map_err)
    }
}

impl VaultBackend for KeyringBackend {
    fn put(&self, id: &str, blob: &str) -> Result<(), CoreError> {
        self.entry(id)?.set_password(blob).map_err(map_err)
    }

    fn get(&self, id: &str) -> Result<String, CoreError> {
        self.entry(id)?.get_password().map_err(map_err)
    }

    fn delete(&self, id: &str) -> Result<(), CoreError> {
        // Idempotent: deleting an absent entry is not an error.
        match self.entry(id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(map_err(e)),
        }
    }

    fn has(&self, id: &str) -> Result<bool, CoreError> {
        match self.entry(id)?.get_password() {
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

/// Store (or replace) the secret blob for `id`.
pub fn vault_put(id: &str, blob: &str) -> Result<(), CoreError> {
    if id.is_empty() {
        return Err(CoreError::InvalidInput("empty account id".to_string()));
    }
    backend().put(id, blob)
}

/// Read the secret blob for `id`. Absent entry -> `CoreError::NotFound`.
pub fn vault_get(id: &str) -> Result<String, CoreError> {
    if id.is_empty() {
        return Err(CoreError::InvalidInput("empty account id".to_string()));
    }
    backend().get(id)
}

/// Delete the secret blob for `id`. Absent entry is a no-op (idempotent).
pub fn vault_delete(id: &str) -> Result<(), CoreError> {
    if id.is_empty() {
        return Err(CoreError::InvalidInput("empty account id".to_string()));
    }
    backend().delete(id)
}

/// Whether a secret blob exists for `id`.
pub fn vault_has(id: &str) -> Result<bool, CoreError> {
    if id.is_empty() {
        return Err(CoreError::InvalidInput("empty account id".to_string()));
    }
    backend().has(id)
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
impl VaultBackend for MockBackend {
    fn put(&self, id: &str, blob: &str) -> Result<(), CoreError> {
        self.store
            .lock()
            .unwrap()
            .insert(id.to_string(), blob.to_string());
        Ok(())
    }

    fn get(&self, id: &str) -> Result<String, CoreError> {
        self.store
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| CoreError::NotFound("vault entry".to_string()))
    }

    fn delete(&self, id: &str) -> Result<(), CoreError> {
        self.store.lock().unwrap().remove(id);
        Ok(())
    }

    fn has(&self, id: &str) -> Result<bool, CoreError> {
        Ok(self.store.lock().unwrap().contains_key(id))
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
