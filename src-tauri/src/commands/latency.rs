//! Latency command: probe a provider base URL's round-trip without secrets.
//!
//! `test_latency` runs `core::latency::measure` (3 samples, 3s hard timeout) and
//! returns timing + status only. The probe sends NO auth header, so nothing
//! secret crosses this IPC boundary. The blocking probe is offloaded to a worker
//! thread (`spawn_blocking`) so it drives its own runtime and never blocks the UI.

use std::time::Duration;

use crate::core::latency;
use crate::model::{CoreError, LatencyResult};

/// Measure the round-trip latency to `base_url` (no auth header, hard timeout).
/// Network effect: a warm-up + 3 bounded GETs to `base_url`; no credential I/O.
#[tauri::command]
pub async fn test_latency(base_url: String) -> Result<LatencyResult, CoreError> {
    if base_url.trim().is_empty() {
        return Err(CoreError::InvalidInput("a base URL is required".into()));
    }
    // Run the blocking probe off the async runtime so reqwest::blocking can drive
    // its own internal runtime and the main thread stays responsive.
    tauri::async_runtime::spawn_blocking(move || {
        latency::measure(&base_url, 3, Duration::from_secs(3))
    })
    .await
    .map_err(|e| CoreError::Io(e.to_string()))
}
