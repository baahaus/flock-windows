export class StatusBar {
  private element: HTMLElement;

  constructor() {
    const el = document.getElementById("status-bar");
    if (!el) throw new Error("#status-bar not found");
    this.element = el;
  }

  update(text: string): void {
    this.element.textContent = text;
  }
}
