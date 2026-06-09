/// App-level shortcuts that terminal panes must NOT consume. xterm would
/// otherwise encode Ctrl+letter combos as control characters for the shell,
/// so these are passed through to the document-level keydown handler.
export function isAppShortcut(e: KeyboardEvent): boolean {
  if (!e.ctrlKey || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (k === "tab") return true; // Ctrl+Tab / Ctrl+Shift+Tab: cycle panes
  if (!e.shiftKey && (k === "t" || k === "w" || k === "k")) return true;
  if (e.shiftKey && (k === "t" || k === "b" || k === "f" || k === "p")) return true;
  if (!e.shiftKey && k >= "1" && k <= "9") return true;
  return false;
}
