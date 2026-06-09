import { invoke } from "@tauri-apps/api/core";

export class StatusBar {
  private element: HTMLElement;
  private text: HTMLSpanElement;
  private broadcastBadge: HTMLSpanElement;
  private updateBtn: HTMLButtonElement;

  constructor() {
    const el = document.getElementById("status-bar");
    if (!el) throw new Error("#status-bar not found");
    this.element = el;

    this.text = document.createElement("span");
    this.text.className = "status-text";

    this.broadcastBadge = document.createElement("span");
    this.broadcastBadge.className = "status-broadcast";
    this.broadcastBadge.textContent = "BROADCAST";
    this.broadcastBadge.style.display = "none";

    this.updateBtn = document.createElement("button");
    this.updateBtn.className = "status-update";
    this.updateBtn.style.display = "none";

    this.element.appendChild(this.text);
    this.element.appendChild(this.broadcastBadge);
    this.element.appendChild(this.updateBtn);
  }

  update(text: string): void {
    this.text.textContent = text;
  }

  setBroadcast(on: boolean): void {
    this.broadcastBadge.style.display = on ? "inline-flex" : "none";
  }

  showUpdate(version: string, url: string): void {
    this.updateBtn.textContent = `Update v${version} available`;
    this.updateBtn.style.display = "inline-flex";
    this.updateBtn.onclick = () => {
      invoke("open_url", { url }).catch(console.error);
    };
  }
}
