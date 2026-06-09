import { Terminal } from "@xterm/xterm";
import type { ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { isAppShortcut } from "./keys";

interface PaneOutputPayload {
  id: number;
  data: number[];
}

export type PaneKind = "claude" | "agent" | "shell";

export interface PaneOptions {
  displayName: string;
  cliId?: string;
  accentColor?: string;
  theme: ITheme;
  onInput: (text: string) => void;
}

export class TerminalPane {
  readonly id: number;
  readonly type: PaneKind;
  readonly cliId?: string;
  readonly displayName: string;
  readonly accentColor?: string;
  readonly searchAddon: SearchAddon;

  container: HTMLDivElement;
  private titleLabel: HTMLSpanElement;
  private stateLabel: HTMLSpanElement;
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private unlisten: UnlistenFn | null = null;

  constructor(id: number, type: PaneKind, opts: PaneOptions) {
    this.id = id;
    this.type = type;
    this.cliId = opts.cliId;
    this.displayName = opts.displayName;
    this.accentColor = opts.accentColor;

    // Build DOM structure
    this.container = document.createElement("div");
    this.container.className = "pane";
    this.container.dataset.paneId = String(id);

    const titleBar = document.createElement("div");
    titleBar.className = "pane-title";

    if (opts.accentColor) {
      const dot = document.createElement("span");
      dot.className = "pane-accent-dot";
      dot.style.background = opts.accentColor;
      titleBar.appendChild(dot);
    }

    this.titleLabel = document.createElement("span");
    this.titleLabel.textContent = `${opts.displayName} ${id}`;
    titleBar.appendChild(this.titleLabel);

    this.stateLabel = document.createElement("span");
    this.stateLabel.className = "pane-state";
    titleBar.appendChild(this.stateLabel);

    const terminalContainer = document.createElement("div");
    terminalContainer.className = "pane-terminal";

    this.container.appendChild(titleBar);
    this.container.appendChild(terminalContainer);

    // Initialize xterm.js
    this.terminal = new Terminal({
      theme: opts.theme,
      fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
      fontSize: 13,
      scrollback: 10000,
      cursorBlink: true,
      allowTransparency: false,
    });

    this.fitAddon = new FitAddon();
    this.searchAddon = new SearchAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(this.searchAddon);

    this.terminal.attachCustomKeyEventHandler((e) => {
      // App shortcuts (new pane, close, palette, broadcast...) bubble up to
      // the document handler instead of becoming control characters.
      if (e.type === "keydown" && isAppShortcut(e)) {
        return false;
      }
      // Ctrl+V: skip xterm's key handling (which would send the ^V control
      // character to the shell) so the browser's native paste fires and
      // xterm's paste handler receives the clipboard text.
      if (e.type === "keydown" && e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "v") {
        return false;
      }
      return true;
    });

    this.terminal.open(terminalContainer);

    // Route keystrokes through the manager (broadcast-aware)
    this.terminal.onData((text) => {
      opts.onInput(text);
    });

    // Listen for output from backend
    listen<PaneOutputPayload>("pane-output", (event) => {
      if (event.payload.id === this.id) {
        this.terminal.write(new Uint8Array(event.payload.data));
      }
    }).then((unlisten) => {
      this.unlisten = unlisten;
    });
  }

  setTheme(theme: ITheme): void {
    this.terminal.options.theme = theme;
  }

  setState(label: string): void {
    const idle = label === "Idle";
    this.stateLabel.textContent = idle ? "" : label;
    if (idle) {
      delete this.container.dataset.state;
    } else {
      this.container.dataset.state = label;
    }
  }

  setBroadcast(on: boolean): void {
    this.container.classList.toggle("pane-broadcast", on);
  }

  fit(): void {
    try {
      this.fitAddon.fit();
      const dims = this.fitAddon.proposeDimensions();
      if (dims) {
        invoke("resize_pane", {
          id: this.id,
          cols: dims.cols,
          rows: dims.rows,
        }).catch(console.error);
      }
    } catch (_) {
      // Pane may not be visible yet; silently ignore
    }
  }

  focus(): void {
    this.container.classList.add("pane-active");
    this.terminal.focus();
  }

  blur(): void {
    this.container.classList.remove("pane-active");
  }

  destroy(): void {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
    this.terminal.dispose();
    this.container.remove();
    invoke("close_pane", { id: this.id }).catch(console.error);
  }
}
