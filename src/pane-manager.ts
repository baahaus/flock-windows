import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { TerminalPane, PaneKind } from "./terminal-pane";
import { calculateGrid } from "./grid-layout";
import { TabBar } from "./tab-bar";
import { StatusBar } from "./status-bar";
import { CommandPalette, PaletteAction } from "./command-palette";
import { FindBar } from "./find-bar";
import { DetectedCli, CLI_COLORS, cliById, installedClis } from "./agent-cli";
import { THEMES, FlockTheme, getTheme, savedThemeId, applyTheme, xtermTheme } from "./themes";

interface PaneStateChangedPayload {
  id: number;
  state: string;
}

interface TrayNewPanePayload {
  type: "claude" | "shell";
}

interface SavedPane {
  type: PaneKind;
  cliId?: string;
}

const SESSION_KEY = "flock-session";
const encoder = new TextEncoder();

export class PaneManager {
  private panes = new Map<number, TerminalPane>();
  private paneStates = new Map<number, string>();
  private activePaneId: number | null = null;
  private grid: HTMLElement;
  private tabBar: TabBar;
  readonly statusBar: StatusBar;
  private palette: CommandPalette;
  private findBar: FindBar;
  private resizeObserver: ResizeObserver;
  private theme: FlockTheme;
  private isBroadcasting = false;

  constructor() {
    const grid = document.getElementById("pane-grid");
    if (!grid) throw new Error("#pane-grid not found");
    this.grid = grid;

    this.theme = getTheme(savedThemeId());

    this.tabBar = new TabBar({
      onSelect: (id) => this.setActive(id),
      onClose: (id) => this.closePane(id),
      onNewClaude: () => this.createPane("claude"),
      onNewShell: () => this.createPane("shell"),
    });

    this.statusBar = new StatusBar();
    this.statusBar.update("Ready");

    this.palette = new CommandPalette();
    this.findBar = new FindBar();

    // Resize observer: re-fit all panes when the grid changes size
    this.resizeObserver = new ResizeObserver(() => {
      this.fitAll();
    });
    this.resizeObserver.observe(this.grid);

    // Backend pane state events (e.g. "Idle", "Running", "Waiting for input")
    listen<PaneStateChangedPayload>("pane-state-changed", (event) => {
      const { id, state } = event.payload;
      this.paneStates.set(id, state);
      this.panes.get(id)?.setState(state);
      if (id === this.activePaneId) {
        this.statusBar.update(`Pane ${id}: ${state}`);
      }
      this.refreshTabBar();
    });

    // System tray new-pane requests
    listen<TrayNewPanePayload>("tray-new-pane", (event) => {
      this.createPane(event.payload.type ?? "claude");
    });

    this.setupKeyboard();
  }

  // -------------------------------------------------------------------------
  // Pane lifecycle
  // -------------------------------------------------------------------------

  async createPane(
    type: PaneKind,
    opts: { cli?: DetectedCli; extraArgs?: string[] } = {},
  ): Promise<void> {
    try {
      const id = await invoke<number>("create_pane", {
        paneType: type,
        command: opts.cli?.path ?? null,
        extraArgs: opts.extraArgs ?? null,
        cols: 80,
        rows: 24,
      });

      const displayName =
        type === "claude" ? "Claude" : type === "shell" ? "Shell" : opts.cli?.name ?? "Agent";
      const cliId = type === "claude" ? "claude" : opts.cli?.id;
      const pane = new TerminalPane(id, type, {
        displayName,
        cliId,
        accentColor: cliId ? CLI_COLORS[cliId] : undefined,
        theme: xtermTheme(this.theme),
        onInput: (text) => this.handleInput(id, text),
      });
      pane.setBroadcast(this.isBroadcasting);
      this.panes.set(id, pane);
      this.grid.appendChild(pane.container);

      this.relayout();
      this.setActive(id);
      this.refreshTabBar();
      this.saveSession();

      // Fit after layout paint
      requestAnimationFrame(() => {
        pane.fit();
      });

      this.statusBar.update(`Opened ${displayName} pane ${id}`);
    } catch (err) {
      console.error("Failed to create pane:", err);
      this.statusBar.update(`Error: ${err}`);
    }
  }

  closePane(id: number): void {
    const pane = this.panes.get(id);
    if (!pane) return;

    this.findBar.close();
    pane.destroy();
    this.panes.delete(id);
    this.paneStates.delete(id);

    // Pick a new active pane if needed
    if (this.activePaneId === id) {
      this.activePaneId = null;
      const ids = Array.from(this.panes.keys());
      if (ids.length > 0) {
        this.setActive(ids[ids.length - 1]);
      }
    }

    this.relayout();
    this.refreshTabBar();
    this.saveSession();
    this.statusBar.update(this.panes.size === 0 ? "No panes open" : "Ready");
  }

  closeActivePane(): void {
    if (this.activePaneId !== null) {
      this.closePane(this.activePaneId);
    }
  }

  setActive(id: number): void {
    const pane = this.panes.get(id);
    if (!pane) return;

    if (this.activePaneId !== null && this.activePaneId !== id) {
      const prev = this.panes.get(this.activePaneId);
      if (prev) prev.blur();
    }

    this.activePaneId = id;
    pane.focus();
    this.refreshTabBar();
  }

  cyclePanes(direction: 1 | -1): void {
    if (this.panes.size === 0) return;

    const ids = Array.from(this.panes.keys());
    const currentIndex = this.activePaneId !== null ? ids.indexOf(this.activePaneId) : -1;

    const nextIndex = (currentIndex + direction + ids.length) % ids.length;
    this.setActive(ids[nextIndex]);
  }

  // -------------------------------------------------------------------------
  // Input routing (broadcast-aware)
  // -------------------------------------------------------------------------

  private handleInput(sourceId: number, text: string): void {
    const data = Array.from(encoder.encode(text));
    if (this.isBroadcasting) {
      for (const id of this.panes.keys()) {
        // Don't let a stray Enter auto-accept a confirmation prompt in
        // another pane that's waiting for input.
        if (id !== sourceId && this.paneStates.get(id) === "Waiting for input") continue;
        invoke("write_to_pane", { id, data }).catch(console.error);
      }
    } else {
      invoke("write_to_pane", { id: sourceId, data }).catch(console.error);
    }
  }

  toggleBroadcast(): void {
    this.isBroadcasting = !this.isBroadcasting;
    for (const pane of this.panes.values()) {
      pane.setBroadcast(this.isBroadcasting);
    }
    this.statusBar.setBroadcast(this.isBroadcasting);
  }

  // -------------------------------------------------------------------------
  // Session persistence
  // -------------------------------------------------------------------------

  private saveSession(): void {
    const saved: SavedPane[] = Array.from(this.panes.values()).map((p) => ({
      type: p.type,
      cliId: p.cliId,
    }));
    localStorage.setItem(SESSION_KEY, JSON.stringify({ version: 1, panes: saved }));
  }

  /// Restore the previous pane layout. Returns false if there was nothing to restore.
  async restoreSession(): Promise<boolean> {
    let saved: SavedPane[];
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      saved = JSON.parse(raw).panes ?? [];
    } catch {
      return false;
    }
    if (saved.length === 0) return false;

    // Sequential so restored panes keep their original order
    for (const sp of saved) {
      if (sp.type === "claude") {
        // Continue the most recent conversation in this directory
        await this.createPane("claude", { extraArgs: ["-c"] });
      } else if (sp.type === "agent" && sp.cliId) {
        const cli = cliById(sp.cliId);
        if (cli) {
          await this.createPane("agent", { cli });
        } else {
          await this.createPane("shell"); // CLI uninstalled since last run
        }
      } else {
        await this.createPane("shell");
      }
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // Themes
  // -------------------------------------------------------------------------

  setTheme(theme: FlockTheme): void {
    this.theme = theme;
    applyTheme(theme);
    const xt = xtermTheme(theme);
    for (const pane of this.panes.values()) {
      pane.setTheme(xt);
    }
  }

  // -------------------------------------------------------------------------
  // Command palette
  // -------------------------------------------------------------------------

  showPalette(): void {
    const actions: PaletteAction[] = [
      { name: "New Claude Pane", shortcut: "Ctrl+T", run: () => this.createPane("claude") },
      { name: "New Shell Pane", shortcut: "Ctrl+Shift+T", run: () => this.createPane("shell") },
      ...installedClis().map((cli) => ({
        name: `New ${cli.name} Pane`,
        shortcut: "",
        run: () => this.createPane("agent", { cli }),
      })),
      { name: "Close Pane", shortcut: "Ctrl+W", run: () => this.closeActivePane() },
      { name: "Toggle Broadcast", shortcut: "Ctrl+Shift+B", run: () => this.toggleBroadcast() },
      { name: "Find in Terminal", shortcut: "Ctrl+Shift+F", run: () => this.showFind() },
      { name: "Next Pane", shortcut: "Ctrl+Tab", run: () => this.cyclePanes(1) },
      { name: "Previous Pane", shortcut: "Ctrl+Shift+Tab", run: () => this.cyclePanes(-1) },
      ...THEMES.map((t) => ({
        name: `Theme: ${t.name}`,
        shortcut: "",
        run: () => this.setTheme(t),
      })),
    ];
    this.palette.show(actions);
  }

  // -------------------------------------------------------------------------
  // Find
  // -------------------------------------------------------------------------

  showFind(): void {
    if (this.activePaneId === null) return;
    const pane = this.panes.get(this.activePaneId);
    if (pane) this.findBar.open(pane);
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  relayout(): void {
    const panes = Array.from(this.panes.values());
    const config = calculateGrid(panes.length);

    this.grid.style.gridTemplateColumns = config.columns;
    this.grid.style.gridTemplateRows = config.rows;

    panes.forEach((pane, index) => {
      pane.container.style.gridArea = config.areas[index] ?? "auto";
    });

    requestAnimationFrame(() => {
      this.fitAll();
    });
  }

  private fitAll(): void {
    for (const pane of this.panes.values()) {
      pane.fit();
    }
  }

  private refreshTabBar(): void {
    const entries = Array.from(this.panes.values()).map((p) => ({
      id: p.id,
      label: `${p.displayName} ${p.id}`,
      color: p.cliId ? CLI_COLORS[p.cliId] : undefined,
      busy: (this.paneStates.get(p.id) ?? "Idle") !== "Idle",
    }));
    this.tabBar.update(entries, this.activePaneId);
  }

  // -------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------

  private setupKeyboard(): void {
    document.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();

      // Ctrl+T: new Claude pane
      if (e.ctrlKey && !e.shiftKey && k === "t") {
        e.preventDefault();
        this.createPane("claude");
        return;
      }

      // Ctrl+Shift+T: new Shell pane
      if (e.ctrlKey && e.shiftKey && k === "t") {
        e.preventDefault();
        this.createPane("shell");
        return;
      }

      // Ctrl+W: close active pane
      if (e.ctrlKey && !e.shiftKey && k === "w") {
        e.preventDefault();
        this.closeActivePane();
        return;
      }

      // Ctrl+K or Ctrl+Shift+P: command palette
      if (e.ctrlKey && ((!e.shiftKey && k === "k") || (e.shiftKey && k === "p"))) {
        e.preventDefault();
        this.showPalette();
        return;
      }

      // Ctrl+Shift+B: toggle broadcast
      if (e.ctrlKey && e.shiftKey && k === "b") {
        e.preventDefault();
        this.toggleBroadcast();
        return;
      }

      // Ctrl+Shift+F: find in terminal
      if (e.ctrlKey && e.shiftKey && k === "f") {
        e.preventDefault();
        this.showFind();
        return;
      }

      // Ctrl+Tab: cycle forward / Ctrl+Shift+Tab: cycle backward
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        this.cyclePanes(e.shiftKey ? -1 : 1);
        return;
      }

      // Ctrl+1-9: jump to pane by index
      if (e.ctrlKey && !e.shiftKey && e.key >= "1" && e.key <= "9") {
        const index = parseInt(e.key, 10) - 1;
        const ids = Array.from(this.panes.keys());
        if (index < ids.length) {
          e.preventDefault();
          this.setActive(ids[index]);
        }
        return;
      }
    });
  }
}
