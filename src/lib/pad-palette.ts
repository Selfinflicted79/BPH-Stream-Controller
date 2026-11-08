import type { PadPaletteColor } from "./types";

/** Mirrors electron/pad-colors.cjs — MPD226 hardware LED palette. */
export const PAD_PALETTE: PadPaletteColor[] = [
  { id: 0, name: "Off", hex: "#3a3f4d" },
  { id: 1, name: "Red", hex: "#e24b3b" },
  { id: 2, name: "Orange", hex: "#f07828" },
  { id: 3, name: "Amber", hex: "#e8a23a" },
  { id: 4, name: "Yellow", hex: "#e8d44a" },
  { id: 5, name: "Green", hex: "#5fd36a" },
  { id: 6, name: "Green Blue", hex: "#3ecf9a" },
  { id: 7, name: "Aqua", hex: "#2fd0c8" },
  { id: 8, name: "Light Blue", hex: "#4de8ff" },
  { id: 9, name: "Blue", hex: "#3a7cff" },
  { id: 10, name: "Purple", hex: "#9b6bff" },
  { id: 11, name: "Pink", hex: "#ff4fd8" },
  { id: 12, name: "Hot Pink", hex: "#ff3b9a" },
  { id: 13, name: "Lt Purple", hex: "#c49bff" },
  { id: 14, name: "Lt Green", hex: "#8be08a" },
  { id: 15, name: "Lt Pink", hex: "#ff9ad4" },
  { id: 16, name: "Grey", hex: "#8b93a8" },
];

export function nearestPadColorIndex(hex: string): number {
  const parse = (h: string) => {
    const s = h.replace("#", "");
    const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  let best = 8;
  let bestDist = Infinity;
  const t = parse(hex || "#4de8ff");
  for (const p of PAD_PALETTE) {
    if (p.id === 0) continue;
    const c = parse(p.hex);
    const d = (c.r - t.r) ** 2 + (c.g - t.g) ** 2 + (c.b - t.b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = p.id;
    }
  }
  return best;
}
