# Flock for Windows

A terminal multiplexer for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) on Windows. Run multiple Claude and shell sessions side by side in a single native window.

Flock Windows is the Windows companion to [Flock](https://github.com/baahaus/flock) (macOS). Built with Rust and Tauri v2 -- not Electron.

## Features

- **Terminal multiplexing** -- multiple Claude Code and shell panes in a tiled grid
- **Multi-CLI agent panes** -- detects installed agent CLIs (Codex, Gemini, opencode, Aider, Goose, Amp, Copilot, Cursor Agent) and launches any of them in a pane
- **Broadcast mode** -- Ctrl+Shift+B types into every pane at once
- **Command palette** -- Ctrl+K for every action: new panes, themes, broadcast, find
- **Session restore** -- your pane layout comes back on relaunch; Claude panes continue their conversation
- **Auto-tiling layout** -- 1 pane fills the window, 2 split side-by-side, 3+ auto-grid
- **Agent state detection** -- per-pane and tab indicators show what each agent is doing (thinking, writing, running, reading, waiting)
- **7 themes** -- the full macOS Flock theme set, from warm cream to Midnight
- **Find in terminal** -- Ctrl+Shift+F searches the active pane's scrollback
- **Update notices** -- the status bar tells you when a new release is out
- **Global hotkey** -- Ctrl+` to summon/hide from anywhere
- **System tray** -- quick access to create panes or show the window

## Requirements

- Windows 10+ (uses ConPTY)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and in PATH

## Install

Download the latest `.msi` or `.exe` installer from [Releases](https://github.com/baahaus/flock-windows/releases).

## Build from source

```
npm install
npx tauri build
```

The installer will be in `src-tauri/target/release/bundle/`.

For development:

```
npm install
npx tauri dev
```

## Architecture

```
Tauri v2 (native window shell)
  +-- TypeScript frontend (xterm.js terminals, CSS Grid layout)
  +-- Rust backend (ConPTY process spawning, Claude output parsing)
```

- **xterm.js** renders terminals (same lib VS Code uses)
- **ConPTY** (Windows Pseudo Console) spawns Claude and shell processes
- **Tauri IPC** bridges frontend terminals to backend PTY streams

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+` | Show/hide window (global) |
| Ctrl+K (or Ctrl+Shift+P) | Command palette |
| Ctrl+T | New Claude pane |
| Ctrl+Shift+T | New shell pane |
| Ctrl+W | Close active pane |
| Ctrl+Shift+B | Toggle broadcast |
| Ctrl+Shift+F | Find in terminal |
| Ctrl+Tab | Next pane |
| Ctrl+Shift+Tab | Previous pane |
| Ctrl+1-9 | Jump to pane |
| Ctrl+V / Ctrl+Shift+V | Paste |

## License

MIT
