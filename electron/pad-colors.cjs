/**
 * MPD226 pad LED colors via Akai SysEx (same scheme as Bitwig MPD2 scripts).
 * PRODUCT_ID 0x35, ON base 994, OFF base 930 (64-pad span like MPD232).
 * SysEx must go out the Remote / MIDIOUT4 port when available.
 */

const PRODUCT_ID = 0x35;
const PAD_ON_BASE = 994;
const PAD_OFF_BASE = 930; // ON - 64

/** Hardware palette (index → approx UI hex). */
const PALETTE = [
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

function parseHex(hex) {
  const h = String(hex || "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 77, g: 232, b: 255 };
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function nearestPaletteIndex(hex) {
  const { r, g, b } = parseHex(hex);
  let best = 8;
  let bestDist = Infinity;
  for (const p of PALETTE) {
    if (p.id === 0) continue;
    const c = parseHex(p.hex);
    const d = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = p.id;
    }
  }
  return best;
}

function paletteHex(index) {
  const p = PALETTE.find((x) => x.id === index) || PALETTE[8];
  return p.hex;
}

function getMSB(value) {
  return Math.floor(value / 128) & 0x7f;
}

function getLSB(value) {
  return Math.floor(value % 128) & 0x7f;
}

/** Build SysEx for one pad color (padNumber 0–63, bank A = 0–15). */
function buildPadColorSysex(padNumber, colorIndex, state = "off") {
  const base = state === "on" ? PAD_ON_BASE : PAD_OFF_BASE;
  const padIdent = base + (padNumber | 0);
  const color = Math.max(0, Math.min(16, colorIndex | 0));
  return [
    0xf0,
    0x47,
    0x00,
    PRODUCT_ID,
    0x31,
    0x00,
    0x04,
    0x01,
    getMSB(padIdent),
    getLSB(padIdent),
    color,
    0xf7,
  ];
}

/**
 * Map binding id `pad-N` → 0-based hardware pad index.
 * @param {string} id
 * @param {number} [bankIndex=0] Pad Bank A–D (0–3); hardware pads are 0–63.
 */
function padIndexFromBindingId(id, bankIndex = 0) {
  const m = /^pad-(\d+)$/i.exec(String(id || ""));
  if (!m) return -1;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1 || n > 16) return -1;
  const bank = Math.max(0, Math.min(3, Number(bankIndex) || 0));
  return bank * 16 + (n - 1);
}

module.exports = {
  PRODUCT_ID,
  PAD_ON_BASE,
  PAD_OFF_BASE,
  PALETTE,
  nearestPaletteIndex,
  paletteHex,
  buildPadColorSysex,
  padIndexFromBindingId,
};
