# Flock for Windows

A terminal multiplexer for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) on Windows. Run multiple Claude and shell sessions side by side in a single native window.

Flock Windows is the Windows companion to [Flock](https://github.com/baahaus/flock) (macOS). Built with Rust and Tauri v2 -- not Electron.

## Features

- **Terminal multiplexing** -- multiple Claude Code and shell panes in a tiled grid
- **Auto-tiling layout** -- 1 pane fills the window, 2 split side-by-side, 3+ auto-grid
- **Claude state detection** -- status bar shows what Claude is doing (thinking, writing, running, reading, waiting)
- **Stream JSON parsing** -- parses Claude's structured output for real-time state tracking
- **Global hotkey** -- Ctrl+` to summon/hide from anywhere
- **System tray** -- quick access to create panes or show the window
- **Light theme** -- clean, minimal UI
- **Keyboard-driven** -- Ctrl+T (new Claude), Ctrl+Shift+T (new shell), Ctrl+W (close), Ctrl+Tab (cycle), Ctrl+1-9 (jump)

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
| Ctrl+T | New Claude pane |
| Ctrl+Shift+T | New shell pane |
| Ctrl+W | Close active pane |
| Ctrl+Tab | Next pane |
| Ctrl+Shift+Tab | Previous pane |
| Ctrl+1-9 | Jump to pane |

## License

MIT
