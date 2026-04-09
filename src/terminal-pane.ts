import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { theme } from "./theme";

interface PaneOutputPayload {
  id: number;
  data: number[];
}

export class TerminalPane {
  readonly id: number;
  readonly type: "claude" | "shell";

  container: HTMLDivElement;
  private titleBar: HTMLDivElement;
  private terminalContainer: HTMLDivElement;
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private encoder = new TextEncoder();
  private unlisten: UnlistenFn | null = null;

  constructor(id: number, type: "claude" | "shell") {
    this.id = id;
    this.type = type;

    // Build DOM structure
    this.container = document.createElement("div");
    this.container.className = "pane";
    this.container.dataset.paneId = String(id);

    this.titleBar = document.createElement("div");
    this.titleBar.className = "pane-title";
    this.titleBar.textContent = type === "claude" ? `Claude ${id}` : `Shell ${id}`;

    this.terminalContainer = document.createElement("div");
    this.terminalContainer.className = "pane-terminal";

    this.container.appendChild(this.titleBar);
    this.container.appendChild(this.terminalContainer);

    // Initialize xterm.js
    this.terminal = new Terminal({
      theme: theme.terminal,
      fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
      fontSize: 13,
      scrollback: 10000,
      cursorBlink: true,
      allowTransparency: false,
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(this.terminalContainer);

    // Send keystrokes to backend
    this.terminal.onData((text) => {
      const data = Array.from(this.encoder.encode(text));
      invoke("write_to_pane", { id: this.id, data }).catch(console.error);
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
