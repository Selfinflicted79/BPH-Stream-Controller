/**
 * Controller surface catalog — drawn faces + default MIDI slots.
 * MPD226 and MPK Mini MK3 for now; more devices plug in here.
 */

function defaultAction() {
  return {
    type: "none",
    target: "",
    mediaAction: "restart",
    recordAction: "toggle",
    streamAction: "toggle",
    macroChord: "",
    macroStyle: "tap",
  };
}

const SURFACES = {
  mpd226: {
    id: "mpd226",
    name: "Akai MPD226",
    shortName: "MPD226",
    match: [/mpd226/i, /mpd\s*226/i],
    bankCount: 4,
    bankLabels: ["A", "B", "C", "D"],
    hasPadLeds: true,
    preferredDevice: "MPD226",
  },
  "mpk-mini-mk3": {
    id: "mpk-mini-mk3",
    name: "Akai MPK Mini MK3",
    shortName: "MPK Mini",
    match: [/mpk\s*mini/i, /mpkmini/i, /mpk\s*mini\s*mk/i],
    bankCount: 2,
    bankLabels: ["A", "B"],
    hasPadLeds: false,
    preferredDevice: "MPK",
  },
};

function listSurfaces() {
  return Object.values(SURFACES).map((s) => ({
    id: s.id,
    name: s.name,
    shortName: s.shortName,
    bankCount: s.bankCount,
    bankLabels: s.bankLabels,
    hasPadLeds: s.hasPadLeds,
  }));
}

function getSurface(id) {
  return SURFACES[id] || SURFACES.mpd226;
}

/** Infer surface from a MIDI device name. */
function detectSurfaceId(deviceName) {
  const name = String(deviceName || "");
  for (const s of Object.values(SURFACES)) {
    if (s.match.some((re) => re.test(name))) return s.id;
  }
  return null;
}

function makeMpdBindings() {
  const padColors = [
    "#4de8ff", "#4de8ff", "#4de8ff", "#ff4fd8",
    "#4de8ff", "#4de8ff", "#ff4fd8", "#ff4fd8",
    "#e8a23a", "#e8a23a", "#5fd36a", "#5fd36a",
    "#5fd36a", "#5fd36a", "#5fd36a", "#e24b3b",
  ];
  const pads = Array.from({ length: 16 }, (_, i) => ({
    id: `pad-${i + 1}`,
    label: `Pad ${i + 1}`,
    color: padColors[i] || "#4de8ff",
    group: "pad",
    midi: null,
    action: defaultAction(),
  }));

  const knobs = Array.from({ length: 4 }, (_, i) => ({
    id: `knob-${i + 1}`,
    label: `Knob ${i + 1}`,
    color: "#4de8ff",
    group: "cc",
    midi: null,
    action: defaultAction(),
    lastValue: 64,
  }));

  const faders = Array.from({ length: 4 }, (_, i) => ({
    id: `fader-${i + 1}`,
    label: `Fader ${i + 1}`,
    color: "#4de8ff",
    group: "cc",
    midi: null,
    action: defaultAction(),
    lastValue: 0,
  }));

  const switches = Array.from({ length: 4 }, (_, i) => {
    const isMic = i === 0;
    return {
      id: `sw-${i + 1}`,
      label: isMic ? "Mic toggle" : `Switch ${i + 1}`,
      color: "#e8a23a",
      group: "switch",
      midi: null,
      pressMode: isMic ? "toggle" : "momentary",
      action: isMic
        ? {
            ...defaultAction(),
            type: "macro",
            macroChord: "lalt+1",
            macroStyle: "tap",
          }
        : defaultAction(),
    };
  });

  const modes = [
    { id: "mode-full", label: "Full Level", color: "#8b93a8" },
    { id: "mode-16", label: "16 Level", color: "#8b93a8" },
    { id: "mode-tap", label: "Tap Tempo", color: "#e8a23a" },
    { id: "mode-repeat", label: "Note Repeat", color: "#e8a23a" },
  ].map((t) => ({
    ...t,
    group: "mode",
    midi: null,
    action: defaultAction(),
  }));

  const transport = [
    { id: "tr-play", label: "Play", color: "#5fd36a", group: "transport" },
    { id: "tr-stop", label: "Stop", color: "#8b93a8", group: "transport" },
    { id: "tr-rec", label: "Rec", color: "#e24b3b", group: "transport" },
    { id: "tr-pause", label: "Pause", color: "#f0a83a", group: "transport" },
  ].map((t) => ({ ...t, midi: null, action: defaultAction() }));

  return [...pads, ...knobs, ...faders, ...switches, ...modes, ...transport];
}

/**
 * MPK Mini MK3 factory Program 1 (MPC) defaults so a friend gets working pads/knobs
 * without learning — still overridable via Learn.
 */
function makeMpkMiniBindings() {
  const padColors = [
    "#e24b3b", "#e8a23a", "#5fd36a", "#4de8ff",
    "#ff4fd8", "#9b6bff", "#e8d44a", "#3a7cff",
  ];
  // Pad grid: bottom-left = 1 … top-right = 8 (Akai numbering)
  const pads = Array.from({ length: 8 }, (_, i) => ({
    id: `pad-${i + 1}`,
    label: `Pad ${i + 1}`,
    color: padColors[i] || "#4de8ff",
    group: "pad",
    midi: { kind: "note", channel: 10, note: 36 + i },
    action: defaultAction(),
  }));

  const knobs = Array.from({ length: 8 }, (_, i) => ({
    id: `knob-${i + 1}`,
    label: `K${i + 1}`,
    color: "#4de8ff",
    group: "cc",
    midi: { kind: "cc", channel: 1, controller: 70 + i },
    action: defaultAction(),
    lastValue: 64,
  }));

  // Soft / mode buttons (Learn if they send MIDI on the unit)
  const soft = [
    { id: "mpk-bank", label: "Pad Bank", color: "#e8a23a" },
    { id: "mpk-full", label: "Full Level", color: "#8b93a8" },
    { id: "mpk-repeat", label: "Note Repeat", color: "#e8a23a" },
    { id: "mpk-prog", label: "Prog Select", color: "#8b93a8" },
    { id: "mpk-cc", label: "CC Mode", color: "#8b93a8" },
    { id: "mpk-arp", label: "Arp", color: "#5fd36a" },
    { id: "mpk-sustain", label: "Sustain", color: "#4de8ff" },
  ].map((t) => ({
    ...t,
    group: "mode",
    midi: null,
    action: defaultAction(),
  }));

  // Compact: octave keys as assignable slots (common transport-like)
  const octaves = [
    { id: "mpk-oct-down", label: "Oct −", color: "#8b93a8" },
    { id: "mpk-oct-up", label: "Oct +", color: "#8b93a8" },
  ].map((t) => ({
    ...t,
    group: "transport",
    midi: null,
    action: defaultAction(),
  }));

  // 25-key bed — factory C3–C5 (48–72) on ch 1; click to assign OBS scenes etc.
  const keys = Array.from({ length: 25 }, (_, i) => {
    const note = 48 + i;
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const name = names[note % 12];
    return {
      id: `key-${i + 1}`,
      label: name,
      color: name.includes("#") ? "#2a3144" : "#eef3ff",
      group: "key",
      midi: { kind: "note", channel: 1, note },
      action: defaultAction(),
    };
  });

  return [...pads, ...knobs, ...soft, ...octaves, ...keys];
}

function defaultMidiBindings(surfaceId = "mpd226") {
  if (surfaceId === "mpk-mini-mk3") return makeMpkMiniBindings();
  return makeMpdBindings();
}

function bankedGroupsFor(surfaceId) {
  if (surfaceId === "mpk-mini-mk3") return new Set(["pad"]);
  return new Set(["pad", "switch"]);
}

function defaultBanks(surfaceId = "mpd226") {
  const meta = getSurface(surfaceId);
  const labels = meta.bankLabels || ["A", "B", "C", "D"];
  const padsAndBanked = defaultMidiBindings(surfaceId).filter((b) =>
    bankedGroupsFor(surfaceId).has(b.group)
  );
  return labels.map((id) => ({
    id,
    name: `Bank ${id}`,
    bindings: JSON.parse(JSON.stringify(padsAndBanked)),
  }));
}

module.exports = {
  SURFACES,
  listSurfaces,
  getSurface,
  detectSurfaceId,
  defaultAction,
  defaultMidiBindings,
  defaultBanks,
  bankedGroupsFor,
  makeMpdBindings,
  makeMpkMiniBindings,
};
