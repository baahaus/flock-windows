import { invoke } from "@tauri-apps/api/core";

export interface DetectedCli {
  id: string;
  name: string;
  path: string;
}

export const CLI_COLORS: Record<string, string> = {
  claude: "#B5524A",
  codex: "#10A37F",
  gemini: "#4285F4",
  opencode: "#F97316",
  aider: "#16A34A",
  goose: "#8B5CF6",
  amp: "#DC2626",
  copilot: "#6E40C9",
  "cursor-agent": "#64748B",
};

let cached: DetectedCli[] = [];

export async function detectAgentClis(): Promise<DetectedCli[]> {
  try {
    cached = await invoke<DetectedCli[]>("detect_agent_clis");
  } catch (err) {
    console.error("CLI detection failed:", err);
  }
  return cached;
}

export function installedClis(): DetectedCli[] {
  return cached;
}

export function cliById(id: string): DetectedCli | undefined {
  return cached.find((c) => c.id === id);
}
