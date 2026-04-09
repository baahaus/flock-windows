#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
mod pty;
#[cfg(windows)]
mod pane;
mod stream_json;
mod claude_state;

// ---------------------------------------------------------------------------
// Windows-only Tauri commands
// ---------------------------------------------------------------------------

#[cfg(windows)]
mod commands {
    use std::io::Read;

    use tauri::{AppHandle, Manager};

    use crate::pane::{self, PaneInfo, PaneType, SharedPaneManager};

    // Parse "claude" | "shell" -> PaneType
    fn parse_pane_type(s: &str) -> Result<PaneType, String> {
        match s.to_lowercase().as_str() {
            "claude" => Ok(PaneType::Claude),
            "shell" => Ok(PaneType::Shell),
            other => Err(format!("unknown pane type: {other}")),
        }
    }

    /// Create a new pane and start a background reader thread for its PTY output.
    #[tauri::command]
    pub fn create_pane(
        pane_type: String,
        cols: u16,
        rows: u16,
        manager: tauri::State<SharedPaneManager>,
        app: AppHandle,
    ) -> Result<u32, String> {
        let pt = parse_pane_type(&pane_type)?;

        // --- 1. Lock, create pane, grab the cloned output handle, release lock.
        let (pane_id, output_file, is_claude) = {
            let mut mgr = manager.lock().map_err(|e| e.to_string())?;
            let id = mgr.create_pane(pt, cols, rows)?;
            let inner = mgr.panes.get(&id).ok_or("pane vanished immediately")?;
            let file = inner.pty.try_clone_output()?;
            let is_claude = inner.pane_type == PaneType::Claude;
            (id, file, is_claude)
        };

        // --- 2. Spawn background reader thread.
        let manager_clone = (*manager).clone();
        std::thread::spawn(move || {
            let mut output = output_file;
            let mut buf = [0u8; 4096];

            loop {
                let n = match output.read(&mut buf) {
                    Ok(0) => break, // EOF: process exited
                    Ok(n) => n,
                    Err(_) => break, // Read error: pipe closed or process gone
                };

                let chunk = buf[..n].to_vec();

                // Emit raw bytes to frontend.
                let _ = app.emit(
                    "pane-output",
                    serde_json::json!({ "id": pane_id, "data": chunk }),
                );

                // For Claude panes, update state detector and emit state change.
                if is_claude {
                    if let Ok(text) = std::str::from_utf8(&chunk) {
                        if let Ok(mut mgr) = manager_clone.lock() {
                            if let Some(inner) = mgr.panes.get_mut(&pane_id) {
                                let new_state = inner.state_detector.feed(text);
                                let _ = app.emit(
                                    "pane-state-changed",
                                    serde_json::json!({
                                        "id": pane_id,
                                        "state": new_state.label()
                                    }),
                                );
                            } else {
                                // Pane was removed -- stop reading.
                                break;
                            }
                        }
                    }
                } else {
                    // Non-Claude pane: check if it still exists, break if removed.
                    if let Ok(mgr) = manager_clone.lock() {
                        if !mgr.panes.contains_key(&pane_id) {
                            break;
                        }
                    }
                }
            }
        });

        Ok(pane_id)
    }

    /// Close and remove a pane by ID.
    #[tauri::command]
    pub fn close_pane(
        id: u32,
        manager: tauri::State<SharedPaneManager>,
    ) -> Result<(), String> {
        manager
            .lock()
            .map_err(|e| e.to_string())?
            .close_pane(id)
    }

    /// Write raw bytes to a pane's PTY stdin.
    #[tauri::command]
    pub fn write_to_pane(
        id: u32,
        data: Vec<u8>,
        manager: tauri::State<SharedPaneManager>,
    ) -> Result<(), String> {
        manager
            .lock()
            .map_err(|e| e.to_string())?
            .write_to_pane(id, &data)
    }

    /// Resize a pane's PTY viewport.
    #[tauri::command]
    pub fn resize_pane(
        id: u32,
        cols: u16,
        rows: u16,
        manager: tauri::State<SharedPaneManager>,
    ) -> Result<(), String> {
        manager
            .lock()
            .map_err(|e| e.to_string())?
            .resize_pane(id, cols, rows)
    }

    /// Return a list of all live panes.
    #[tauri::command]
    pub fn list_panes(
        manager: tauri::State<SharedPaneManager>,
    ) -> Vec<PaneInfo> {
        manager
            .lock()
            .map_or_else(|_| vec![], |mgr| mgr.list_panes())
    }
}

// ---------------------------------------------------------------------------
// macOS / non-Windows stub commands (return errors -- Windows only)
// ---------------------------------------------------------------------------

#[cfg(not(windows))]
mod commands {
    use crate::pane_stub::PaneInfo;

    #[tauri::command]
    pub fn create_pane(_pane_type: String, _cols: u16, _rows: u16) -> Result<u32, String> {
        Err("Windows only".into())
    }

    #[tauri::command]
    pub fn close_pane(_id: u32) -> Result<(), String> {
        Err("Windows only".into())
    }

    #[tauri::command]
    pub fn write_to_pane(_id: u32, _data: Vec<u8>) -> Result<(), String> {
        Err("Windows only".into())
    }

    #[tauri::command]
    pub fn resize_pane(_id: u32, _cols: u16, _rows: u16) -> Result<(), String> {
        Err("Windows only".into())
    }

    #[tauri::command]
    pub fn list_panes() -> Vec<PaneInfo> {
        vec![]
    }
}

// Minimal PaneInfo stub for non-Windows builds (avoids pulling in the pane module).
#[cfg(not(windows))]
mod pane_stub {
    use serde::Serialize;

    #[derive(Debug, Clone, Serialize)]
    pub struct PaneInfo {
        pub id: u32,
        pub pane_type: String,
        pub state: String,
    }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

fn main() {
    #[cfg(windows)]
    let manager = pane::new_shared();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::create_pane,
            commands::close_pane,
            commands::write_to_pane,
            commands::resize_pane,
            commands::list_panes,
        ])
        .setup(|_app| {
            #[cfg(windows)]
            _app.manage(manager);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running flock");
}
