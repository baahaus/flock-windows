export interface TabEntry {
  id: number;
  label: string;
  color?: string;
  busy: boolean;
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

  update(panes: TabEntry[], activeId: number | null): void {
    this.element.innerHTML = "";

    for (const pane of panes) {
      const tab = document.createElement("button");
      tab.className = "tab" + (pane.id === activeId ? " tab-active" : "");

      if (pane.color) {
        const dot = document.createElement("span");
        dot.className = "tab-cli-dot";
        dot.style.background = pane.color;
        tab.appendChild(dot);
      }

      const label = document.createElement("span");
      label.textContent = pane.label;
      tab.appendChild(label);

      if (pane.busy) {
        const busy = document.createElement("span");
        busy.className = "tab-busy-dot";
        tab.appendChild(busy);
      }

      const closeBtn = document.createElement("span");
      closeBtn.className = "tab-close";
      closeBtn.textContent = "x";
      closeBtn.title = "Close pane";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onClose(pane.id);
      });
      tab.appendChild(closeBtn);

      tab.addEventListener("click", () => {
        this.callbacks.onSelect(pane.id);
      });

      this.element.appendChild(tab);
    }

    const addClaude = document.createElement("button");
    addClaude.className = "tab-add";
    addClaude.textContent = "+ Claude";
    addClaude.addEventListener("click", () => this.callbacks.onNewClaude());
    this.element.appendChild(addClaude);

    const addShell = document.createElement("button");
    addShell.className = "tab-add";
    addShell.textContent = "+ Shell";
    addShell.addEventListener("click", () => this.callbacks.onNewShell());
    this.element.appendChild(addShell);
  }
}
