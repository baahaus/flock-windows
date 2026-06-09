import { getVersion } from "@tauri-apps/api/app";
import { StatusBar } from "./status-bar";

function isNewer(remote: string, local: string): boolean {
  const r = remote.split(".").map((n) => parseInt(n, 10) || 0);
  const l = local.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] ?? 0;
    const lv = l[i] ?? 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

export async function checkForUpdates(statusBar: StatusBar): Promise<void> {
  try {
    const current = await getVersion();
    const res = await fetch(
      "https://api.github.com/repos/baahaus/flock-windows/releases/latest",
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) return;
    const release = await res.json();
    const latest = String(release.tag_name ?? "").replace(/^v/, "");
    if (latest && isNewer(latest, current)) {
      statusBar.showUpdate(latest, release.html_url ?? "https://github.com/baahaus/flock-windows/releases");
    }
  } catch {
    // Offline or rate-limited -- silently skip
  }
}
