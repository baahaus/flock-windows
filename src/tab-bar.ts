export interface PaneEntry {
  id: number;
  type: "claude" | "shell";
}

export interface TabBarCallbacks {
  onSelect: (id: number) => void;
  onClose: (id: number) => void;
  onNewClaude: () => void;
  onNewShell: () => void;
}

export class TabBar {
  private element: HTMLElement;
  private callbacks: TabBarCallbacks;

  constructor(callbacks: TabBarCallbacks) {
    const el = document.getElementById("tab-bar");
    if (!el) throw new Error("#tab-bar not found");
    this.element = el;
    this.callbacks = callbacks;
  }

  update(panes: PaneEntry[], activeId: number | null): void {
    this.element.innerHTML = "";

    for (const pane of panes) {
      const tab = document.createElement("button");
      tab.className = "tab" + (pane.id === activeId ? " tab-active" : "");
      tab.style.cssText = "-webkit-app-region: no-drag";

      const label = document.createElement("span");
      label.textContent = pane.type === "claude" ? `Claude ${pane.id}` : `Shell ${pane.id}`;

      const closeBtn = document.createElement("span");
      closeBtn.className = "tab-close";
      closeBtn.textContent = "x";
      closeBtn.title = "Close pane";
      closeBtn.style.cssText = "-webkit-app-region: no-drag";

      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onClose(pane.id);
      });

      tab.appendChild(label);
      tab.appendChild(closeBtn);

      tab.addEventListener("click", () => {
        this.callbacks.onSelect(pane.id);
      });

      this.element.appendChild(tab);
    }

    // Add Claude button
    const addClaude = document.createElement("button");
    addClaude.className = "tab-add";
    addClaude.textContent = "+ Claude";
    addClaude.style.cssText = "-webkit-app-region: no-drag";
    addClaude.addEventListener("click", () => this.callbacks.onNewClaude());
    this.element.appendChild(addClaude);

    // Add Shell button
    const addShell = document.createElement("button");
    addShell.className = "tab-add";
    addShell.textContent = "+ Shell";
    addShell.style.cssText = "-webkit-app-region: no-drag";
    addShell.addEventListener("click", () => this.callbacks.onNewShell());
    this.element.appendChild(addShell);
  }
}
