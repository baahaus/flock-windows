import { PaneManager } from "./pane-manager";
import { detectAgentClis } from "./agent-cli";
import { applyTheme, getTheme, savedThemeId } from "./themes";
import { checkForUpdates } from "./update-checker";

async function boot(): Promise<void> {
  applyTheme(getTheme(savedThemeId()));

  // Detect installed agent CLIs before restoring, so agent panes can relaunch
  await detectAgentClis();

  const manager = new PaneManager();
  if (!(await manager.restoreSession())) {
    manager.createPane("claude");
  }

  checkForUpdates(manager.statusBar);
}

boot();
