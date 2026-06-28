//! MCP commands: list, save (upsert), delete, toggle enable/disable.
//!
//! These edit the GLOBAL MCP servers in `~/.claude.json` `mcpServers` (atomic,
//! preserving every other key) plus a Clavis-managed disabled stash under the app
//! config dir. `.credentials.json` and the `mcpOAuth` key are never touched here.

use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};

use crate::core::{mcp, paths};
use crate::model::{CoreError, McpServer, McpServerInput};

/// The Clavis-managed disabled-server stash, next to the other Clavis store files.
const MCP_DISABLED_STASH: &str = "mcp_disabled.json";

/// Resolve the disabled-stash path under the app config dir.
fn stash_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, CoreError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| CoreError::Io(e.to_string()))?;
    Ok(dir.join(MCP_DISABLED_STASH))
}

/// List global MCP servers: enabled (from `~/.claude.json`) + disabled (stash).
/// On-disk effect: reads `~/.claude.json` + the stash; writes nothing.
#[tauri::command]
pub fn list_mcp_servers<R: Runtime>(app: AppHandle<R>) -> Result<Vec<McpServer>, CoreError> {
    mcp::list(&paths::dot_claude_json(), &stash_path(&app)?)
}

/// Create or replace a global MCP server (always enabled).
/// On-disk effect: backs up then atomically rewrites `~/.claude.json` `mcpServers`,
/// preserving every other key.
#[tauri::command]
pub fn save_mcp_server(input: McpServerInput) -> Result<McpServer, CoreError> {
    mcp::upsert(&paths::dot_claude_json(), input)
}

/// Delete a global MCP server by name (from both `~/.claude.json` and the stash).
/// On-disk effect: rewrites `~/.claude.json` `mcpServers` + the stash; idempotent.
#[tauri::command]
pub fn delete_mcp_server<R: Runtime>(app: AppHandle<R>, name: String) -> Result<(), CoreError> {
    mcp::remove(&paths::dot_claude_json(), &stash_path(&app)?, &name)
}

/// Enable/disable a global MCP server by moving its definition between
/// `~/.claude.json` `mcpServers` and the disabled stash (never losing it).
/// On-disk effect: rewrites `~/.claude.json` `mcpServers` + the stash atomically.
#[tauri::command]
pub fn set_mcp_enabled<R: Runtime>(
    app: AppHandle<R>,
    name: String,
    on: bool,
) -> Result<(), CoreError> {
    mcp::set_enabled(&paths::dot_claude_json(), &stash_path(&app)?, &name, on)
}
