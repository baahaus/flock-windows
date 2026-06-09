export interface PaletteAction {
  name: string;
  shortcut: string;
  run: () => void;
}

interface Match {
  action: PaletteAction;
  score: number;
}

/// Fuzzy match: query characters must appear in order; tighter packing scores higher.
function fuzzyMatch(query: string, action: PaletteAction): Match | null {
  if (!query) return { action, score: 0 };
  const q = query.toLowerCase();
  const t = action.name.toLowerCase();

  const indices: number[] = [];
  let ti = 0;
  for (const ch of q) {
    let found = false;
    while (ti < t.length) {
      if (t[ti] === ch) {
        indices.push(ti);
        ti++;
        found = true;
        break;
      }
      ti++;
    }
    if (!found) return null;
  }
  const spread = indices[indices.length - 1] - indices[0];
  const score = 1000 - spread * 10 - indices[0] * 2;
  return score > 0 ? { action, score } : null;
}

export class CommandPalette {
  private backdrop: HTMLDivElement | null = null;
  private input: HTMLInputElement | null = null;
  private list: HTMLUListElement | null = null;
  private actions: PaletteAction[] = [];
  private filtered: PaletteAction[] = [];
  private selected = 0;

  get isOpen(): boolean {
    return this.backdrop !== null;
  }

  show(actions: PaletteAction[]): void {
    if (this.backdrop) this.close();
    this.actions = actions;

    const backdrop = document.createElement("div");
    backdrop.className = "palette-backdrop";
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) this.close();
    });

    const card = document.createElement("div");
    card.className = "palette-card";

    const input = document.createElement("input");
    input.className = "palette-input";
    input.placeholder = "Type a command...";
    input.addEventListener("input", () => this.refresh(input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        this.move(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.move(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.execute();
      }
    });

    const list = document.createElement("ul");
    list.className = "palette-list";

    card.appendChild(input);
    card.appendChild(list);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    this.backdrop = backdrop;
    this.input = input;
    this.list = list;
    this.refresh("");
    input.focus();
  }

  close(): void {
    this.backdrop?.remove();
    this.backdrop = null;
    this.input = null;
    this.list = null;
  }

  private refresh(query: string): void {
    this.filtered = this.actions
      .map((a) => fuzzyMatch(query, a))
      .filter((m): m is Match => m !== null)
      .sort((a, b) => b.score - a.score)
      .map((m) => m.action);
    this.selected = 0;
    this.render();
  }

  private move(delta: number): void {
    if (this.filtered.length === 0) return;
    this.selected = Math.max(0, Math.min(this.filtered.length - 1, this.selected + delta));
    this.render();
  }

  private execute(): void {
    const action = this.filtered[this.selected];
    this.close();
    action?.run();
  }

  private render(): void {
    if (!this.list) return;
    this.list.innerHTML = "";
    this.filtered.forEach((action, i) => {
      const li = document.createElement("li");
      li.className = "palette-item" + (i === this.selected ? " palette-item-selected" : "");

      const name = document.createElement("span");
      name.textContent = action.name;
      li.appendChild(name);

      if (action.shortcut) {
        const hint = document.createElement("span");
        hint.className = "palette-shortcut";
        hint.textContent = action.shortcut;
        li.appendChild(hint);
      }

      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.selected = i;
        this.execute();
      });
      this.list!.appendChild(li);
    });
    this.list.children[this.selected]?.scrollIntoView({ block: "nearest" });
  }
}
