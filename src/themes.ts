import type { ITheme } from "@xterm/xterm";

export interface FlockTheme {
  id: string;
  name: string;
  chrome: string;
  surface: string;
  hover: string;
  divider: string;
  borderRest: string;
  borderFocus: string;
  accent: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  terminalBg: string;
  terminalFg: string;
  ansi: string[]; // 16 colors
}

// Ported from the macOS Flock theme set (Theme.swift).
export const THEMES: FlockTheme[] = [
  {
    id: "flock", name: "Flock",
    chrome: "#E8E3DA", surface: "#F7F4ED", hover: "#E2DDD3", divider: "#D9D3C8",
    borderRest: "#D4CEC3", borderFocus: "#B8B0A3", accent: "#9B8574",
    textPrimary: "#2C2520", textSecondary: "#6A6560", textTertiary: "#8A857E",
    terminalBg: "#FAF7F0", terminalFg: "#2C2520",
    ansi: ["#2C2520", "#C75450", "#5B9A6B", "#9B7B2C", "#5B7FA5", "#A8727E", "#6A9DAD", "#E8E3DA",
           "#7A7168", "#D97B76", "#7BB585", "#D4AD56", "#7A9EC4", "#C19BA5", "#8CBFCC", "#F7F4ED"],
  },
  {
    id: "claude", name: "Claude",
    chrome: "#E9E0D1", surface: "#F5EFE4", hover: "#DED6C8", divider: "#D3CABB",
    borderRest: "#CCC2B1", borderFocus: "#A89A89", accent: "#B5524A",
    textPrimary: "#30261E", textSecondary: "#6D6356", textTertiary: "#8D8475",
    terminalBg: "#F8F2E8", terminalFg: "#30261E",
    ansi: ["#30261E", "#B5524A", "#5A8F61", "#B89840", "#5D7FA0", "#96717E", "#5E949E", "#E9E0D1",
           "#7D7063", "#CC7A72", "#7AAD7D", "#CBB265", "#7D9DBF", "#B5929E", "#7FB5BE", "#F5EFE4"],
  },
  {
    id: "midnight", name: "Midnight",
    chrome: "#1A1918", surface: "#252321", hover: "#33302D", divider: "#302D2A",
    borderRest: "#3E3A36", borderFocus: "#5C5550", accent: "#6A9FD4",
    textPrimary: "#E8E4DE", textSecondary: "#A09890", textTertiary: "#706860",
    terminalBg: "#1C1A19", terminalFg: "#E8E4DE",
    ansi: ["#1A1918", "#D4655E", "#6BBF7A", "#D4B94E", "#6A9FD4", "#A87EC4", "#72B8CC", "#E8E4DE",
           "#635C55", "#E08A84", "#85CC8A", "#DCC86E", "#85B3D9", "#BFA0D4", "#8FC5D9", "#E8E4DE"],
  },
  {
    id: "ember", name: "Ember",
    chrome: "#1C1612", surface: "#28201A", hover: "#382E26", divider: "#302822",
    borderRest: "#423830", borderFocus: "#625448", accent: "#C4894A",
    textPrimary: "#E8E0D4", textSecondary: "#A09480", textTertiary: "#706454",
    terminalBg: "#1A1410", terminalFg: "#E8E0D4",
    ansi: ["#1C1612", "#D47058", "#7AAE60", "#D4A848", "#7A90B5", "#C07870", "#72A8A0", "#E8E0D4",
           "#685C4E", "#E09078", "#92C478", "#DCBC60", "#94A8C4", "#D49890", "#8CC0B8", "#F2ECE2"],
  },
  {
    id: "vesper", name: "Vesper",
    chrome: "#181924", surface: "#22242E", hover: "#2E3040", divider: "#282A38",
    borderRest: "#38394E", borderFocus: "#525570", accent: "#9A8DC0",
    textPrimary: "#E0E2EC", textSecondary: "#8E90A8", textTertiary: "#62647A",
    terminalBg: "#161720", terminalFg: "#E0E2EC",
    ansi: ["#181924", "#CC6578", "#68A878", "#C8B050", "#6A88C8", "#AE7EC0", "#60A4B8", "#E0E2EC",
           "#585A78", "#E08898", "#80C090", "#D8C468", "#88A4D8", "#C498D0", "#80BCD0", "#ECEDF4"],
  },
  {
    id: "overcast", name: "Overcast",
    chrome: "#E2E5EA", surface: "#EFF1F4", hover: "#D8DCE2", divider: "#CDD1D8",
    borderRest: "#C4C9D1", borderFocus: "#A3A9B4", accent: "#5580B5",
    textPrimary: "#1E2228", textSecondary: "#555D6A", textTertiary: "#7D8494",
    terminalBg: "#F0F2F5", terminalFg: "#1E2228",
    ansi: ["#1E2228", "#C45462", "#5A9A6E", "#BFA04A", "#5580B5", "#8B7AAD", "#5EAAB8", "#E2E5EA",
           "#5A6170", "#D4808A", "#7AB88C", "#CCB562", "#7098C4", "#A498BF", "#78BDCC", "#EFF1F4"],
  },
  {
    id: "linen", name: "Linen",
    chrome: "#F0EEEB", surface: "#FBFAF8", hover: "#E9E7E3", divider: "#E3E1DC",
    borderRest: "#DDD9D4", borderFocus: "#B5AFA7", accent: "#7A8A7A",
    textPrimary: "#2C2B28", textSecondary: "#6A6662", textTertiary: "#8A8680",
    terminalBg: "#FBFAF8", terminalFg: "#2C2B28",
    ansi: ["#2C2B28", "#C93D37", "#3A7D44", "#9B7B2C", "#2E6BB5", "#9B4D96", "#2B8A7E", "#E9E7E3",
           "#7A766F", "#E05550", "#4E9A5A", "#B8962E", "#4A8AD4", "#B86DB2", "#3BAFA1", "#FBFAF8"],
  },
];

const STORAGE_KEY = "flock-theme";

export function savedThemeId(): string {
  return localStorage.getItem(STORAGE_KEY) ?? "flock";
}

export function getTheme(id: string): FlockTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function xtermTheme(t: FlockTheme): ITheme {
  return {
    background: t.terminalBg,
    foreground: t.terminalFg,
    cursor: t.terminalFg,
    cursorAccent: t.terminalBg,
    selectionBackground: t.accent + "55",
    black: t.ansi[0], red: t.ansi[1], green: t.ansi[2], yellow: t.ansi[3],
    blue: t.ansi[4], magenta: t.ansi[5], cyan: t.ansi[6], white: t.ansi[7],
    brightBlack: t.ansi[8], brightRed: t.ansi[9], brightGreen: t.ansi[10], brightYellow: t.ansi[11],
    brightBlue: t.ansi[12], brightMagenta: t.ansi[13], brightCyan: t.ansi[14], brightWhite: t.ansi[15],
  };
}

/// Apply a theme to the document (CSS variables) and persist the choice.
export function applyTheme(t: FlockTheme): void {
  const r = document.documentElement.style;
  r.setProperty("--chrome", t.chrome);
  r.setProperty("--surface", t.surface);
  r.setProperty("--hover", t.hover);
  r.setProperty("--divider", t.divider);
  r.setProperty("--border-rest", t.borderRest);
  r.setProperty("--border-focus", t.borderFocus);
  r.setProperty("--accent", t.accent);
  r.setProperty("--text-primary", t.textPrimary);
  r.setProperty("--text-secondary", t.textSecondary);
  r.setProperty("--text-tertiary", t.textTertiary);
  r.setProperty("--terminal-bg", t.terminalBg);
  localStorage.setItem(STORAGE_KEY, t.id);
}
