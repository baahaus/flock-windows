import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { TerminalPane } from "./terminal-pane";
import { calculateGrid } from "./grid-layout";
import { TabBar } from "./tab-bar";
import { StatusBar } from "./status-bar";

interface PaneStateChangedPayload {
  id: number;
  state: string;
}

interface TrayNewPanePayload {
  type: "claude" | "shell";
}

export class PaneManager {
  private panes = new Map<number, TerminalPane>();
  private activePaneId: number | null = null;
  private grid: HTMLElement;
  private tabBar: TabBar;
  private statusBar: StatusBar;
  private resizeObserver: ResizeObserver;

  constructor() {
    const grid = document.getElementById("pane-grid");
    if (!grid) throw new Error("#pane-grid not found");
    this.grid = grid;

    this.tabBar = new TabBar({
      onSelect: (id) => this.setActive(id),
      onClose: (id) => this.closePane(id),
      onNewClaude: () => this.createPane("claude"),
      onNewShell: () => this.createPane("shell"),
    });

    this.statusBar = new StatusBar();
    this.statusBar.update("Ready");

    // Resize observer: re-fit all panes when the grid changes size
    this.resizeObserver = new ResizeObserver(() => {
      this.fitAll();
    });
    this.resizeObserver.observe(this.grid);

    // Backend pane state events (e.g. "idle", "running", "waiting")
    listen<PaneStateChangedPayload>("pane-state-changed", (event) => {
      const { id, state } = event.payload;
      if (id === this.activePaneId) {
        this.statusBar.update(`Pane ${id}: ${state}`);
      }
    });

    // System tray new-pane requests
    listen<TrayNewPanePayload>("tray-new-pane", (event) => {
      this.createPane(event.payload.type ?? "claude");
    });

    this.setupKeyboard();
  }

  async createPane(type: "claude" | "shell"): Promise<void> {
    try {
      const id = await invoke<number>("create_pane", {
        paneType: type,
        cols: 80,
        rows: 24,
      });

      const pane = new TerminalPane(id, type);
      this.panes.set(id, pane);
      this.grid.appendChild(pane.container);

      this.relayout();
      this.setActive(id);
      this.refreshTabBar();

      // Fit after layout paint
      requestAnimationFrame(() => {
        pane.fit();
      });

      this.statusBar.update(`Opened ${type} pane ${id}`);
    } catch (err) {
      console.error("Failed to create pane:", err);
      this.statusBar.update(`Error: ${err}`);
    }
  }

  closePane(id: number): void {
    const pane = this.panes.get(id);
    if (!pane) return;

    pane.destroy();
    this.panes.delete(id);

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

    // Blur the previously active pane
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
    const currentIndex = this.activePaneId !== null
      ? ids.indexOf(this.activePaneId)
      : -1;

    const nextIndex = (currentIndex + direction + ids.length) % ids.length;
    this.setActive(ids[nextIndex]);
  }

  relayout(): void {
    const panes = Array.from(this.panes.values());
    const config = calculateGrid(panes.length);

    this.grid.style.gridTemplateColumns = config.columns;
    this.grid.style.gridTemplateRows = config.rows;

    panes.forEach((pane, index) => {
      pane.container.style.gridArea = config.areas[index] ?? "auto";
    });

    // Fit all panes after layout
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
      type: p.type,
    }));
    this.tabBar.update(entries, this.activePaneId);
  }

  private setupKeyboard(): void {
    document.addEventListener("keydown", (e) => {
      // Ctrl+T: new Claude pane
      if (e.ctrlKey && !e.shiftKey && e.key === "t") {
        e.preventDefault();
        this.createPane("claude");
        return;
      }

      // Ctrl+Shift+T: new Shell pane
      if (e.ctrlKey && e.shiftKey && e.key === "T") {
        e.preventDefault();
        this.createPane("shell");
        return;
      }

      // Ctrl+W: close active pane
      if (e.ctrlKey && !e.shiftKey && e.key === "w") {
        e.preventDefault();
        this.closeActivePane();
        return;
      }

      // Ctrl+Tab: cycle forward
      if (e.ctrlKey && !e.shiftKey && e.key === "Tab") {
        e.preventDefault();
        this.cyclePanes(1);
        return;
      }

      // Ctrl+Shift+Tab: cycle backward
      if (e.ctrlKey && e.shiftKey && e.key === "Tab") {
        e.preventDefault();
        this.cyclePanes(-1);
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
