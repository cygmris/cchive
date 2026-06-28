//! Privileged Clavis core: path resolution, atomic file I/O, the OS-keyring
//! account vault, per-OS credential access, key-preserving JSON editors, and
//! the switch algorithms. All token I/O lives here; nothing above this layer
//! (commands, the webview) ever holds a secret.

pub mod paths;
pub mod atomic_fs;
pub mod activity;
pub mod backups;
pub mod credentials;
pub mod keyring_store;
pub mod claude_json;
pub mod latency;
pub mod memory;
pub mod notify_hook;
pub mod portable;
pub mod projects;
pub mod mcp;
pub mod resources;
pub mod settings;
pub mod providers;
pub mod switch;
pub mod usage;
