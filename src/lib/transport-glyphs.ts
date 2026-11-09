/** Default face icons for MPD transport (and any control that opts in). */
export const TRANSPORT_GLYPHS = [
  "■",
  "▶",
  "●",
  "❚❚",
  "★",
  "✦",
  "◆",
  "▲",
  "▼",
  "◉",
  "◎",
  "○",
  "♪",
  "⚡",
  "♥",
  "♦",
  "☰",
  "✕",
  "✓",
  "AI",
  "FX",
  "Mic",
] as const;

export type TransportGlyph = (typeof TRANSPORT_GLYPHS)[number] | string;

export type LitHue = "green" | "red" | "amber" | "cyan";

export const LIT_HUES: { id: LitHue; label: string; swatch: string }[] = [
  { id: "green", label: "Green", swatch: "#5fd36a" },
  { id: "red", label: "Red", swatch: "#ff3b3b" },
  { id: "amber", label: "Amber", swatch: "#f0a83a" },
  { id: "cyan", label: "Cyan", swatch: "#4de8ff" },
];

const DEFAULT_GLYPH: Record<string, string> = {
  "tr-stop": "■",
  "tr-play": "▶",
  "tr-rec": "●",
  "tr-pause": "❚❚",
};

const DEFAULT_LIT: Record<string, LitHue> = {
  "tr-stop": "green",
  "tr-play": "green",
  "tr-rec": "red",
  "tr-pause": "green",
};

export function defaultTransportGlyph(bindingId: string): string {
  return DEFAULT_GLYPH[bindingId] || "●";
}

export function defaultLitHue(bindingId: string): LitHue {
  return DEFAULT_LIT[bindingId] || "green";
}
