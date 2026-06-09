import { TerminalPane } from "./terminal-pane";

export class FindBar {
  private element: HTMLDivElement | null = null;
  private pane: TerminalPane | null = null;

  open(pane: TerminalPane): void {
    this.close();
    this.pane = pane;

    const bar = document.createElement("div");
    bar.className = "find-bar";

    const input = document.createElement("input");
    input.className = "find-input";
    input.placeholder = "Find...";
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.close();
        this.pane = null;
        pane.focus();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          pane.searchAddon.findPrevious(input.value);
        } else {
          pane.searchAddon.findNext(input.value);
        }
      }
    });
    input.addEventListener("input", () => {
      if (input.value) pane.searchAddon.findNext(input.value, { incremental: true });
    });

    const prev = this.button("↑", () => pane.searchAddon.findPrevious(input.value));
    const next = this.button("↓", () => pane.searchAddon.findNext(input.value));
    const close = this.button("×", () => {
      this.close();
      pane.focus();
    });

    bar.appendChild(input);
    bar.appendChild(prev);
    bar.appendChild(next);
    bar.appendChild(close);

    pane.container.appendChild(bar);
    this.element = bar;
    input.focus();
  }

  close(): void {
    this.element?.remove();
    this.element = null;
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "find-btn";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }
}
