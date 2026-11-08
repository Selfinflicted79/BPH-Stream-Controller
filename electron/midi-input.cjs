/**
 * MIDI I/O for Akai MPD226 (and any MIDI controller).
 * Input: listen-only. Output: SysEx pad colors (never keyboard injection).
 */

const padColors = require("./pad-colors.cjs");
const shareHub = require("./midi-share-hub.cjs");

let midi = null;
/** @type {import('midi').Input | null} */
let input = null;
/** @type {import('midi').Output | null} */
let output = null;
/** Separate out port: mirror MPD → MixLine via loopMIDI / virtual cable */
/** @type {import('midi').Output | null} */
let thruOutput = null;
let openIndex = -1;
let openName = null;
let outIndex = -1;
let outName = null;
let thruIndex = -1;
let thruName = null;
let thruEnabled = false;
/** @type {((evt: object) => void) | null} */
let onEvent = null;
let lastMessage = null;
let lastError = null;

function loadMidi() {
  if (midi) return midi;
  try {
    midi = require("midi");
    return midi;
  } catch (err) {
    lastError = err.message;
    console.warn("[midi] native module unavailable:", err.message);
    return null;
  }
}

function listDevices() {
  const MIDI = loadMidi();
  if (!MIDI) return { ok: false, error: lastError || "midi module missing", devices: [] };

  const probe = new MIDI.Input();
  const count = probe.getPortCount();
  const devices = [];
  for (let i = 0; i < count; i++) {
    const name = probe.getPortName(i);
    devices.push({ index: i, name });
  }
  try {
    probe.closePort();
  } catch {
    /* ignore */
  }
  return { ok: true, devices };
}

function listOutputs() {
  const MIDI = loadMidi();
  if (!MIDI) return { ok: false, error: lastError || "midi module missing", devices: [] };
  const probe = new MIDI.Output();
  const count = probe.getPortCount();
  const devices = [];
  for (let i = 0; i < count; i++) {
    devices.push({ index: i, name: probe.getPortName(i) });
  }
  try {
    probe.closePort();
  } catch {
    /* ignore */
  }
  return { ok: true, devices };
}

/** Prefer MIDIOUT4 / Remote (Bitwig uses this for pad SysEx), then plain MPD226. */
function findOutputIndex(devices) {
  if (!devices.length) return -1;
  const scored = devices.map((d) => {
    const n = d.name.toLowerCase();
    let score = 0;
    if (n.includes("midiout4") || n.includes("remote")) score += 100;
    if (n.includes("mpd226")) score += 50;
    if (n.includes("akai")) score += 20;
    if (n.includes("midiout2") || n.includes("midiout3")) score += 5;
    // Don't steal loopMIDI for LED sysex
    if (n.includes("loopmidi") || n.includes("bph") || n.includes("mixline")) score -= 80;
    return { ...d, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0].index : devices[0].index;
}

/** Prefer virtual ports for MixLine share (loopMIDI / BPH MixLine). */
function findThruOutputIndex(devices, preferredName) {
  if (!devices.length) return -1;
  const pref = (preferredName || "").toLowerCase();
  if (pref) {
    const exact = devices.find((d) => d.name.toLowerCase() === pref);
    if (exact) return exact.index;
    const partial = devices.find((d) => d.name.toLowerCase().includes(pref));
    if (partial) return partial.index;
  }
  const scored = devices.map((d) => {
    const n = d.name.toLowerCase();
    let score = 0;
    if (n.includes("bph") && n.includes("mix")) score += 120;
    if (n.includes("bph mixline") || n === "bph mixline") score += 130;
    if (n.includes("loopmidi")) score += 80;
    if (n.includes("mixline") || n.includes("share")) score += 60;
    if (n.includes("virtual")) score += 40;
    // Avoid feeding back into the hardware pad out
    if (n.includes("mpd226") || n.includes("midiout4") || n.includes("remote")) score -= 100;
    return { ...d, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0].index : -1;
}

function closeOutput() {
  if (output) {
    try {
      output.closePort();
    } catch {
      /* ignore */
    }
    output = null;
  }
  outIndex = -1;
  outName = null;
}

function closeThru() {
  if (thruOutput) {
    try {
      thruOutput.closePort();
    } catch {
      /* ignore */
    }
    thruOutput = null;
  }
  thruIndex = -1;
  thruName = null;
}

function setThruEnabled(enabled) {
  thruEnabled = !!enabled;
  if (!thruEnabled) closeThru();
  return { ok: true, thruEnabled };
}

function openThru(preferredIndex, preferredName) {
  const MIDI = loadMidi();
  if (!MIDI) return { ok: false, error: lastError || "midi module missing" };

  closeThru();
  const listed = listOutputs();
  if (!listed.ok || !listed.devices.length) {
    return { ok: false, error: "No MIDI output devices found" };
  }

  let idx = Number(preferredIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= listed.devices.length) {
    idx = findThruOutputIndex(listed.devices, preferredName);
  }
  if (idx < 0) {
    return {
      ok: false,
      error:
        'No share port found — install loopMIDI and create a port named "BPH MixLine"',
      devices: listed.devices,
    };
  }

  // Don't use the same port as LED sysex out
  if (output && idx === outIndex) {
    return {
      ok: false,
      error: "Share port can’t be the same as the pad LED out — pick a loopMIDI port",
      devices: listed.devices,
    };
  }

  try {
    thruOutput = new MIDI.Output();
    thruOutput.openPort(idx);
    thruIndex = idx;
    thruName = listed.devices[idx]?.name || `Thru ${idx}`;
    thruEnabled = true;
    return { ok: true, index: idx, name: thruName, devices: listed.devices };
  } catch (err) {
    closeThru();
    return { ok: false, error: err.message, devices: listed.devices };
  }
}

function forwardThru(bytes) {
  if (!thruEnabled || !thruOutput || !bytes?.length) return;
  try {
    thruOutput.sendMessage(Array.from(bytes));
  } catch {
    /* ignore drop */
  }
}

function openOutput() {
  const MIDI = loadMidi();
  if (!MIDI) return { ok: false, error: lastError || "midi module missing" };

  closeOutput();
  const listed = listOutputs();
  if (!listed.ok || !listed.devices.length) {
    return { ok: false, error: "No MIDI output devices found" };
  }

  const idx = findOutputIndex(listed.devices);
  try {
    output = new MIDI.Output();
    output.openPort(idx);
    outIndex = idx;
    outName = listed.devices[idx]?.name || `Out ${idx}`;
    return { ok: true, index: idx, name: outName, devices: listed.devices };
  } catch (err) {
    lastError = err.message;
    closeOutput();
    return { ok: false, error: lastError };
  }
}

function sendSysex(bytes) {
  if (!output) {
    const opened = openOutput();
    if (!opened.ok) return opened;
  }
  try {
    output.sendMessage(bytes);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Light one bank-A pad (1–16) on the hardware.
 * Sets both Off and On colors so idle + pressed match.
 */
function setPadHardwareColor(padNumber1to16, colorIndex, bankIndex = 0) {
  const local = Number(padNumber1to16) - 1;
  if (!Number.isInteger(local) || local < 0 || local > 15) {
    return { ok: false, error: "Pad must be 1–16" };
  }
  const bank = Math.max(0, Math.min(3, Number(bankIndex) || 0));
  const idx = bank * 16 + local;
  const color = Math.max(0, Math.min(16, Number(colorIndex) || 0));
  const offMsg = padColors.buildPadColorSysex(idx, color, "off");
  const onMsg = padColors.buildPadColorSysex(idx, color, "on");
  const a = sendSysex(offMsg);
  if (!a.ok) return a;
  const b = sendSysex(onMsg);
  return b.ok
    ? { ok: true, pad: local + 1, bank, color, outName }
    : b;
}

/**
 * Push colors for all pad-* bindings onto the 16 currently visible pads.
 * bankIndex is ignored for hardware addressing — Pad Bank is local to the MPD
 * and cannot be switched over MIDI; we always write slots 0–15.
 */
function syncPadColorsFromBindings(bindings, _bankIndex = 0) {
  if (!Array.isArray(bindings)) return { ok: false, error: "No bindings" };
  if (!output) openOutput();
  if (!output) return { ok: false, error: "MIDI out not open" };

  let count = 0;
  for (const b of bindings) {
    const padIdx = padColors.padIndexFromBindingId(b.id, 0);
    if (padIdx < 0) continue;
    const color =
      typeof b.padColorIndex === "number"
        ? b.padColorIndex
        : padColors.nearestPaletteIndex(b.color);
    sendSysex(padColors.buildPadColorSysex(padIdx, color, "off"));
    sendSysex(padColors.buildPadColorSysex(padIdx, color, "on"));
    count += 1;
  }
  return { ok: true, count, bank: 0, outName };
}

function findPreferredIndex(devices, preferredName) {
  if (!devices.length) return -1;
  const pref = (preferredName || "MPD226").toLowerCase();
  const hit = devices.find((d) => d.name.toLowerCase().includes(pref));
  if (hit) return hit.index;
  const akai = devices.find((d) => d.name.toLowerCase().includes("akai"));
  if (akai) return akai.index;
  return devices[0].index;
}

function parseMessage(bytes) {
  if (!bytes || bytes.length < 1) return null;
  const status = bytes[0];
  const typeNibble = status & 0xf0;
  const channel = (status & 0x0f) + 1; // 1-16

  if (typeNibble === 0x90) {
    const note = bytes[1];
    const velocity = bytes[2] || 0;
    if (velocity === 0) {
      return { kind: "noteoff", channel, note, velocity: 0 };
    }
    return { kind: "noteon", channel, note, velocity };
  }
  if (typeNibble === 0x80) {
    return { kind: "noteoff", channel, note: bytes[1], velocity: bytes[2] || 0 };
  }
  if (typeNibble === 0xb0) {
    return {
      kind: "cc",
      channel,
      controller: bytes[1],
      value: bytes[2] || 0,
    };
  }
  return {
    kind: "raw",
    channel,
    status,
    data: [...bytes],
  };
}

function describe(msg) {
  if (!msg) return "";
  if (msg.kind === "noteon" || msg.kind === "noteoff") {
    return `${msg.kind} ch${msg.channel} note ${msg.note} vel ${msg.velocity}`;
  }
  if (msg.kind === "cc") {
    return `cc ch${msg.channel} #${msg.controller} = ${msg.value}`;
  }
  return msg.kind;
}

function close() {
  if (input) {
    try {
      input.closePort();
    } catch {
      /* ignore */
    }
    input = null;
  }
  openIndex = -1;
  openName = null;
  closeOutput();
  closeThru();
}

function open(index, handler, thruOpts) {
  const MIDI = loadMidi();
  if (!MIDI) return { ok: false, error: lastError || "midi module missing" };

  const wantThru = !!(thruOpts && thruOpts.enabled);
  const thruPrefName = thruOpts?.preferredName || "BPH MixLine";
  const thruPrefIndex = thruOpts?.index;

  close();
  onEvent = handler || onEvent;

  const listed = listDevices();
  if (!listed.ok) return listed;
  if (!listed.devices.length) {
    return { ok: false, error: "No MIDI input devices found" };
  }

  let idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= listed.devices.length) {
    idx = findPreferredIndex(listed.devices, "MPD226");
  }

  try {
    input = new MIDI.Input();
    // Ignore sysex/timing/active sensing noise for cleaner learn
    if (typeof input.ignoreTypes === "function") {
      input.ignoreTypes(true, true, true);
    }
    input.on("message", (_delta, bytes) => {
      // Optional loopMIDI thru (for non-BPH apps)
      forwardThru(bytes);

      const msg = parseMessage(bytes);
      // Native BPH share (no 3rd-party cable) — MixLine connects over localhost
      shareHub.publishMidi(bytes, msg && msg.kind !== "raw" ? msg : null);

      if (!msg || msg.kind === "raw") return;
      lastMessage = { ...msg, at: Date.now(), label: describe(msg) };
      onEvent?.(lastMessage);
    });
    input.openPort(idx);
    openIndex = idx;
    openName = listed.devices[idx]?.name || `Port ${idx}`;
    lastError = null;
    const out = openOutput();

    let thru = { ok: false, skipped: true };
    if (wantThru) {
      thru = openThru(thruPrefIndex, thruPrefName);
    }

    return {
      ok: true,
      index: idx,
      name: openName,
      devices: listed.devices,
      out: out.ok ? { index: out.index, name: out.name } : null,
      outError: out.ok ? null : out.error,
      thru: thru.ok
        ? { index: thru.index, name: thru.name }
        : { ok: false, error: thru.error || null },
    };
  } catch (err) {
    lastError = err.message;
    close();
    return { ok: false, error: lastError };
  }
}

function getStatus() {
  const listed = listDevices();
  const outs = listOutputs();
  const hub = shareHub.getStatus();
  return {
    available: !!loadMidi() && !lastError,
    open: !!input,
    index: openIndex,
    name: openName,
    outOpen: !!output,
    outIndex,
    outName,
    thruEnabled,
    thruOpen: !!thruOutput,
    thruIndex,
    thruName,
    bphShare: hub,
    lastError,
    lastMessage,
    devices: listed.devices || [],
    outputs: outs.devices || [],
  };
}

function bindingKey(msg) {
  if (!msg) return null;
  if (msg.kind === "noteon" || msg.kind === "noteoff") {
    return `note:${msg.channel}:${msg.note}`;
  }
  if (msg.kind === "cc") {
    return `cc:${msg.channel}:${msg.controller}`;
  }
  return null;
}

function matchesBinding(msg, midi) {
  if (!msg || !midi) return false;
  if (midi.kind === "note") {
    return (
      (msg.kind === "noteon" || msg.kind === "noteoff") &&
      msg.channel === midi.channel &&
      msg.note === midi.note
    );
  }
  if (midi.kind === "cc") {
    return (
      msg.kind === "cc" &&
      msg.channel === midi.channel &&
      msg.controller === midi.controller
    );
  }
  return false;
}

module.exports = {
  listDevices,
  listOutputs,
  findPreferredIndex,
  findThruOutputIndex,
  open,
  close,
  openOutput,
  closeOutput,
  openThru,
  closeThru,
  setThruEnabled,
  getStatus,
  bindingKey,
  matchesBinding,
  describe,
  setPadHardwareColor,
  syncPadColorsFromBindings,
  padColors,
  shareHub,
};
