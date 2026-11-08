/**
 * Keyboard macro sender (Windows SendInput).
 * Output-only — does NOT install hooks or swallow keys.
 *
 * Prefer "tap" chords (down+up). Sustained "hold" (PTT) can leave modifiers
 * stuck if the app exits mid-hold — always call releaseAllHeld() on quit.
 */

let ready = false;
let lastError = null;
let SendInput = null;

const VK = {
  backspace: 0x08,
  tab: 0x09,
  enter: 0x0d,
  return: 0x0d,
  shift: 0x10,
  ctrl: 0x11,
  control: 0x11,
  alt: 0x12,
  menu: 0x12,
  pause: 0x13,
  caps: 0x14,
  escape: 0x1b,
  esc: 0x1b,
  space: 0x20,
  pageup: 0x21,
  pagedown: 0x22,
  end: 0x23,
  home: 0x24,
  left: 0x25,
  up: 0x26,
  right: 0x27,
  down: 0x28,
  insert: 0x2d,
  delete: 0x2e,
  del: 0x2e,
  win: 0x5b,
  lwin: 0x5b,
  rwin: 0x5c,
  apps: 0x5d,
  numpad0: 0x60,
  numpad1: 0x61,
  numpad2: 0x62,
  numpad3: 0x63,
  numpad4: 0x64,
  numpad5: 0x65,
  numpad6: 0x66,
  numpad7: 0x67,
  numpad8: 0x68,
  numpad9: 0x69,
  f1: 0x70,
  f2: 0x71,
  f3: 0x72,
  f4: 0x73,
  f5: 0x74,
  f6: 0x75,
  f7: 0x76,
  f8: 0x77,
  f9: 0x78,
  f10: 0x79,
  f11: 0x7a,
  f12: 0x7b,
  lshift: 0xa0,
  rshift: 0xa1,
  lctrl: 0xa2,
  rctrl: 0xa3,
  lalt: 0xa4,
  ralt: 0xa5,
};

const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const INPUT_KEYBOARD = 1;
const INPUT_SIZE = 40;

const EXTENDED = new Set([
  0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2d, 0x2e, 0xa3, 0xa5, 0x5b, 0x5c,
]);

/** Modifiers we always force-up on emergency release (both generic + left/right). */
const EMERGENCY_UPS = [
  0x12, // VK_MENU
  0xa4, // VK_LMENU
  0xa5, // VK_RMENU
  0x11, // VK_CONTROL
  0xa2, // VK_LCONTROL
  0xa3, // VK_RCONTROL
  0x10, // VK_SHIFT
  0xa0, // VK_LSHIFT
  0xa1, // VK_RSHIFT
  0x5b, // VK_LWIN
  0x5c, // VK_RWIN
];

const heldByBinding = new Map();

function init() {
  if (ready) return true;
  if (process.platform !== "win32") {
    lastError = "Keyboard macros are Windows-only";
    return false;
  }
  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    SendInput = user32.func(
      "uint32 __stdcall SendInput(uint32 nInputs, _In_ void *pInputs, int cbSize)"
    );
    ready = true;
    lastError = null;
    return true;
  } catch (err) {
    lastError = err.message;
    ready = false;
    return false;
  }
}

function resolveVk(name) {
  const n = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/^left[\s\-]+/, "l")
    .replace(/^right[\s\-]+/, "r")
    .replace(/\s+/g, "");

  if (!n) return null;
  if (VK[n] != null) return VK[n];

  if (n === "leftalt" || n === "l-alt") return VK.lalt;
  if (n === "rightalt" || n === "r-alt") return VK.ralt;
  if (n === "leftctrl" || n === "l-ctrl" || n === "leftcontrol") return VK.lctrl;
  if (n === "rightctrl" || n === "r-ctrl") return VK.rctrl;
  if (n === "leftshift" || n === "l-shift") return VK.lshift;
  if (n === "rightshift" || n === "r-shift") return VK.rshift;

  if (/^[a-z]$/.test(n)) return n.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(n)) return 0x30 + Number(n);

  return null;
}

function parseChord(chord) {
  if (Array.isArray(chord)) {
    return chord.map((k) => String(k).trim()).filter(Boolean);
  }
  const raw = String(chord || "").trim();
  if (!raw) return [];
  return raw
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
}

function writeKeyInput(buf, offset, vk, up) {
  buf.writeUInt32LE(INPUT_KEYBOARD, offset + 0);
  buf.writeUInt32LE(0, offset + 4);
  buf.writeUInt16LE(vk & 0xffff, offset + 8);
  buf.writeUInt16LE(0, offset + 10);
  let flags = up ? KEYEVENTF_KEYUP : 0;
  if (EXTENDED.has(vk)) flags |= KEYEVENTF_EXTENDEDKEY;
  buf.writeUInt32LE(flags, offset + 12);
  buf.writeUInt32LE(0, offset + 16);
  buf.writeBigUInt64LE(0n, offset + 20);
}

function resolveChord(chord) {
  const parts = parseChord(chord);
  if (!parts.length) return { ok: false, error: "Empty macro chord — try lalt+1" };
  const vks = [];
  for (const p of parts) {
    const vk = resolveVk(p);
    if (vk == null) return { ok: false, error: `Unknown key: “${p}”` };
    vks.push({ name: p, vk });
  }
  return { ok: true, parts, vks };
}

function sendInputs(vks, { down, up }) {
  if (!init()) return { ok: false, error: lastError || "Macro engine unavailable" };
  const events = [];
  if (down) for (const k of vks) events.push({ vk: k.vk, up: false });
  if (up) for (let r = vks.length - 1; r >= 0; r--) events.push({ vk: vks[r].vk, up: true });
  if (!events.length) return { ok: false, error: "Nothing to send" };

  try {
    const buf = Buffer.alloc(INPUT_SIZE * events.length);
    events.forEach((e, i) => writeKeyInput(buf, i * INPUT_SIZE, e.vk, e.up));
    const sent = SendInput(events.length, buf, INPUT_SIZE);
    if (sent !== events.length) {
      return {
        ok: false,
        error: `SendInput ${sent}/${events.length} — target may be elevated (run both as admin or neither)`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function sendChord(chord) {
  const resolved = resolveChord(chord);
  if (!resolved.ok) return resolved;
  const sent = sendInputs(resolved.vks, { down: true, up: true });
  if (!sent.ok) return sent;
  return { ok: true, detail: resolved.parts.join("+"), chord: resolved.parts.join("+") };
}

function keyDown(chord, bindingId) {
  const resolved = resolveChord(chord);
  if (!resolved.ok) return resolved;
  if (bindingId && heldByBinding.has(bindingId)) {
    return { ok: true, detail: `${resolved.parts.join("+")} (already held)`, held: true };
  }
  const sent = sendInputs(resolved.vks, { down: true, up: false });
  if (!sent.ok) return sent;
  if (bindingId) heldByBinding.set(bindingId, resolved.parts.join("+"));
  return {
    ok: true,
    detail: `${resolved.parts.join("+")} ↓`,
    chord: resolved.parts.join("+"),
    held: true,
  };
}

function keyUp(chord, bindingId) {
  const stored = bindingId ? heldByBinding.get(bindingId) : null;
  const useChord = stored || chord;
  const resolved = resolveChord(useChord);
  if (!resolved.ok) {
    if (bindingId) heldByBinding.delete(bindingId);
    return resolved;
  }
  const sent = sendInputs(resolved.vks, { down: false, up: true });
  if (bindingId) heldByBinding.delete(bindingId);
  if (!sent.ok) return sent;
  return {
    ok: true,
    detail: `${resolved.parts.join("+")} ↑`,
    chord: resolved.parts.join("+"),
    held: false,
  };
}

/**
 * Release every tracked hold, then force key-up on common modifiers.
 * Call on app quit so Alt/Ctrl cannot stay stuck after close.
 */
function releaseAllHeld() {
  const ids = [...heldByBinding.keys()];
  for (const id of ids) {
    const chord = heldByBinding.get(id);
    try {
      keyUp(chord, id);
    } catch {
      heldByBinding.delete(id);
    }
  }
  heldByBinding.clear();

  if (!init()) return { ok: false, error: lastError, released: ids };

  try {
    const events = EMERGENCY_UPS.map((vk) => ({ vk, up: true }));
    const buf = Buffer.alloc(INPUT_SIZE * events.length);
    events.forEach((e, i) => writeKeyInput(buf, i * INPUT_SIZE, e.vk, true));
    SendInput(events.length, buf, INPUT_SIZE);
  } catch {
    /* best-effort */
  }

  return { ok: true, released: ids };
}

function isHeld(bindingId) {
  return heldByBinding.has(bindingId);
}

function getStatus() {
  init();
  return {
    ready,
    lastError,
    platform: process.platform,
    held: [...heldByBinding.keys()],
  };
}

module.exports = {
  parseChord,
  resolveVk,
  sendChord,
  keyDown,
  keyUp,
  releaseAllHeld,
  isHeld,
  getStatus,
  init,
};
