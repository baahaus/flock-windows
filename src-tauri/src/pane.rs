//! Pane manager -- owns the collection of terminal panes, each backed by a PTY process.
//!
//! Each pane wraps a `Pty` (Windows ConPTY), a `ClaudeStateDetector` for tracking
//! agent state from terminal output, and a `StreamJsonParser` for parsing structured
//! JSON events emitted by `claude --output-format stream-json`.

#![cfg(windows)]

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::Serialize;

use crate::claude_state::ClaudeStateDetector;
use crate::pty::Pty;
use crate::stream_json::StreamJsonParser;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Whether a pane is running the Claude CLI or a plain shell.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PaneType {
    Claude,
    Shell,
}

/// Lightweight snapshot of a pane, safe to send to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct PaneInfo {
    pub id: u32,
    pub pane_type: PaneType,
    pub state: String,
}

// ---------------------------------------------------------------------------
// Internal per-pane state
// ---------------------------------------------------------------------------

/// Full per-pane state -- not serializable because `Pty` wraps raw handles.
pub struct PaneInner {
    pub id: u32,
    pub pane_type: PaneType,
    pub pty: Pty,
    pub state_detector: ClaudeStateDetector,
    pub json_parser: StreamJsonParser,
}

// ---------------------------------------------------------------------------
// PaneManager
// ---------------------------------------------------------------------------

/// Owns all live panes and tracks which one is currently active.
pub struct PaneManager {
    pub panes: HashMap<u32, PaneInner>,
    next_id: u32,
    active_pane: Option<u32>,
}

impl PaneManager {
    /// Create an empty pane manager.
    pub fn new() -> Self {
        Self {
            panes: HashMap::new(),
            next_id: 1,
            active_pane: None,
        }
    }

    /// Spawn a new pane of the given type and return its assigned ID.
    ///
    /// - `Claude` panes run `claude --output-format stream-json --verbose`.
    /// - `Shell` panes run the shell pointed to by `COMSPEC`, falling back to
    ///   `cmd.exe`.
    pub fn create_pane(&mut self, pane_type: PaneType, cols: u16, rows: u16) -> Result<u32, String> {
        let id = self.next_id;

        let pty = match pane_type {
            PaneType::Claude => Pty::spawn(
                "claude",
                &["--output-format", "stream-json", "--verbose"],
                cols,
                rows,
            ),
            PaneType::Shell => {
                let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
                Pty::spawn(&shell, &[], cols, rows)
            }
        }?;

        let inner = PaneInner {
            id,
            pane_type,
            pty,
            state_detector: ClaudeStateDetector::new(),
            json_parser: StreamJsonParser::new(),
        };

        self.panes.insert(id, inner);
        self.next_id += 1;

        // First pane created becomes the active one.
        if self.active_pane.is_none() {
            self.active_pane = Some(id);
        }

        Ok(id)
    }

    /// Kill and remove a pane by ID.
    pub fn close_pane(&mut self, id: u32) -> Result<(), String> {
        let mut inner = self
            .panes
            .remove(&id)
            .ok_or_else(|| format!("pane {id} not found"))?;

        inner.pty.kill();

        // If the closed pane was active, clear the active selection.
        if self.active_pane == Some(id) {
            self.active_pane = None;
        }

        Ok(())
    }

    /// Write raw bytes (keyboard input) to a pane's PTY stdin.
    pub fn write_to_pane(&mut self, id: u32, data: &[u8]) -> Result<(), String> {
        let inner = self
            .panes
            .get_mut(&id)
            .ok_or_else(|| format!("pane {id} not found"))?;
        inner.pty.write_input(data)
    }

    /// Resize the PTY viewport of a pane.
    pub fn resize_pane(&mut self, id: u32, cols: u16, rows: u16) -> Result<(), String> {
        let inner = self
            .panes
            .get_mut(&id)
            .ok_or_else(|| format!("pane {id} not found"))?;
        inner.pty.resize(cols, rows)
    }

    /// Return a lightweight snapshot of every live pane.
    pub fn list_panes(&self) -> Vec<PaneInfo> {
        let mut list: Vec<PaneInfo> = self
            .panes
            .values()
            .map(|inner| PaneInfo {
                id: inner.id,
                pane_type: inner.pane_type,
                state: inner.state_detector.state().label().to_string(),
            })
            .collect();

        // Stable ordering by ID for deterministic frontend rendering.
        list.sort_by_key(|p| p.id);
        list
    }

    /// Return the number of live panes.
    pub fn pane_count(&self) -> usize {
        self.panes.len()
    }

    /// Return the currently active pane ID, if any.
    pub fn active_pane(&self) -> Option<u32> {
        self.active_pane
    }

    /// Set the active pane. Returns an error if the ID does not exist.
    pub fn set_active_pane(&mut self, id: u32) -> Result<(), String> {
        if self.panes.contains_key(&id) {
            self.active_pane = Some(id);
            Ok(())
        } else {
            Err(format!("pane {id} not found"))
        }
    }
}

// ---------------------------------------------------------------------------
// Shared handle
// ---------------------------------------------------------------------------

/// Thread-safe shared reference to the pane manager.
pub type SharedPaneManager = Arc<Mutex<PaneManager>>;

/// Convenience constructor for the shared handle.
pub fn new_shared() -> SharedPaneManager {
    Arc::new(Mutex::new(PaneManager::new()))
}
