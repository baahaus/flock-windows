//! Detection of installed AI agent CLIs on PATH.

use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub struct DetectedCli {
    pub id: String,
    pub name: String,
    pub path: String,
}

/// Agent CLIs Flock can launch in a pane (besides the built-in Claude type).
const KNOWN: &[(&str, &str)] = &[
    ("codex", "Codex"),
    ("gemini", "Gemini"),
    ("opencode", "opencode"),
    ("aider", "Aider"),
    ("goose", "Goose"),
    ("amp", "Amp"),
    ("copilot", "Copilot"),
    ("cursor-agent", "Cursor Agent"),
];

/// Resolve a command name against PATH, honoring PATHEXT on Windows so npm
/// `.cmd` shims are found (CreateProcess does not run those directly).
pub fn resolve_command(cmd: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    let exts: Vec<String> = std::env::var("PATHEXT")
        .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into())
        .split(';')
        .filter(|e| !e.is_empty())
        .map(String::from)
        .collect();

    for dir in std::env::split_paths(&path_var) {
        if dir.as_os_str().is_empty() {
            continue;
        }
        let bare = dir.join(cmd);
        if bare.is_file() {
            return Some(bare);
        }
        for ext in &exts {
            for variant in [ext.to_lowercase(), ext.to_uppercase()] {
                let candidate = dir.join(format!("{cmd}{variant}"));
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn detect_agent_clis() -> Vec<DetectedCli> {
    KNOWN
        .iter()
        .filter_map(|(id, name)| {
            resolve_command(id).map(|p| DetectedCli {
                id: (*id).to_string(),
                name: (*name).to_string(),
                path: p.to_string_lossy().into_owned(),
            })
        })
        .collect()
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("only https urls can be opened".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
