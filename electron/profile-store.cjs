const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const surfaces = require("./surfaces.cjs");

const {
  defaultAction,
  defaultMidiBindings,
  defaultBanks,
  bankedGroupsFor,
  getSurface,
  detectSurfaceId,
  listSurfaces,
} = surfaces;

const BANK_IDS = ["A", "B", "C", "D"];

function snapshotBanked(bindings, surfaceId) {
  const groups = bankedGroupsFor(surfaceId || "mpd226");
  return (bindings || [])
    .filter((b) => groups.has(b.group))
    .map((b) => JSON.parse(JSON.stringify(b)));
}

function normalizeBinding(raw, fallback) {
  const pressMode =
    raw?.pressMode === "toggle" || raw?.pressMode === "momentary"
      ? raw.pressMode
      : fallback.pressMode || "momentary";
  const litHueRaw = raw?.litHue ?? fallback.litHue;
  const litHue =
    litHueRaw === "green" ||
    litHueRaw === "red" ||
    litHueRaw === "amber" ||
    litHueRaw === "cyan"
      ? litHueRaw
      : undefined;
  const uiGlyph =
    typeof raw?.uiGlyph === "string" && raw.uiGlyph.trim()
      ? raw.uiGlyph.trim().slice(0, 4)
      : typeof fallback.uiGlyph === "string"
        ? fallback.uiGlyph
        : undefined;
  return {
    ...fallback,
    ...raw,
    pressMode,
    uiGlyph,
    litHue,
    action: {
      ...defaultAction(),
      ...(fallback.action || {}),
      ...(raw?.action || {}),
    },
    midi: raw?.midi !== undefined ? raw.midi : fallback.midi || null,
  };
}

function normalizeMidiBindings(rawList, surfaceId) {
  const base = defaultMidiBindings(surfaceId);
  if (!Array.isArray(rawList) || !rawList.length) return base;

  const byId = new Map(rawList.map((b) => [b.id, b]));
  const merged = base.map((b) => normalizeBinding(byId.get(b.id) || {}, b));

  for (const b of rawList) {
    if (!base.some((x) => x.id === b.id)) {
      merged.push(
        normalizeBinding(b, {
          id: b.id,
          label: b.label || b.id,
          color: b.color || "#9b6bff",
          group: b.group || "cc",
          midi: null,
          action: defaultAction(),
        })
      );
    }
  }
  return merged;
}

function normalizeBanks(rawBanks, liveBindings, surfaceId) {
  const defaults = defaultBanks(surfaceId);
  const liveSnap = snapshotBanked(liveBindings, surfaceId);
  const maxBank = defaults.length - 1;

  return defaults.map((def, i) => {
    const raw = Array.isArray(rawBanks) ? rawBanks[i] : null;
    const seed =
      raw?.bindings?.length
        ? raw.bindings
        : i === 0
          ? liveSnap
          : def.bindings;
    const byId = new Map((seed || []).map((b) => [b.id, b]));
    return {
      id: def.id,
      name: (raw && raw.name) || def.name,
      bindings: def.bindings.map((b) => normalizeBinding(byId.get(b.id) || {}, b)),
    };
  });
}

function commitActiveBank(profile) {
  if (!profile) return profile;
  const surfaceId = profile.surfaceId || "mpd226";
  const meta = getSurface(surfaceId);
  const max = Math.max(0, (meta.bankCount || 4) - 1);
  const idx = Math.max(0, Math.min(max, Number(profile.activeBank) || 0));
  if (!Array.isArray(profile.banks) || profile.banks.length !== meta.bankCount) {
    profile.banks = defaultBanks(surfaceId);
  }
  const labels = meta.bankLabels || BANK_IDS;
  profile.banks[idx] = {
    ...profile.banks[idx],
    id: labels[idx] || BANK_IDS[idx],
    bindings: snapshotBanked(profile.midiBindings, surfaceId),
  };
  profile.activeBank = idx;
  return profile;
}

function applyBankToLive(profile, bankIndex) {
  const surfaceId = profile.surfaceId || "mpd226";
  const meta = getSurface(surfaceId);
  const max = Math.max(0, (meta.bankCount || 4) - 1);
  const idx = Math.max(0, Math.min(max, Number(bankIndex) || 0));
  if (!Array.isArray(profile.banks) || profile.banks.length !== meta.bankCount) {
    profile.banks = defaultBanks(surfaceId);
  }
  const bank = profile.banks[idx];
  const byId = new Map((bank.bindings || []).map((b) => [b.id, b]));
  const groups = bankedGroupsFor(surfaceId);
  profile.midiBindings = (profile.midiBindings || []).map((b) => {
    if (!groups.has(b.group)) return b;
    const snap = byId.get(b.id);
    if (!snap) return b;
    return normalizeBinding(snap, b);
  });
  profile.activeBank = idx;
  return profile;
}

function setActiveBank(profile, bankIndex) {
  commitActiveBank(profile);
  applyBankToLive(profile, bankIndex);
  return profile;
}

function stashSurfaceProfile(profile) {
  if (!profile) return;
  commitActiveBank(profile);
  if (!profile.surfaceProfiles) profile.surfaceProfiles = {};
  const id = profile.surfaceId || "mpd226";
  profile.surfaceProfiles[id] = {
    midiBindings: JSON.parse(JSON.stringify(profile.midiBindings || [])),
    banks: JSON.parse(JSON.stringify(profile.banks || [])),
    activeBank: profile.activeBank || 0,
  };
}

function applySurfaceProfile(profile, surfaceId) {
  const id = getSurface(surfaceId).id;
  if (!profile.surfaceProfiles) profile.surfaceProfiles = {};
  const saved = profile.surfaceProfiles[id];
  if (saved?.midiBindings?.length) {
    profile.midiBindings = normalizeMidiBindings(saved.midiBindings, id);
    profile.banks = normalizeBanks(saved.banks, profile.midiBindings, id);
    profile.activeBank = saved.activeBank || 0;
  } else {
    profile.midiBindings = defaultMidiBindings(id);
    profile.banks = defaultBanks(id);
    profile.activeBank = 0;
  }
  profile.surfaceId = id;
  applyBankToLive(profile, profile.activeBank);
  return profile;
}

function setSurface(profile, surfaceId) {
  const next = getSurface(surfaceId).id;
  const cur = profile.surfaceId || "mpd226";
  if (next === cur) return profile;
  stashSurfaceProfile(profile);
  applySurfaceProfile(profile, next);
  const meta = getSurface(next);
  if (profile.midi) {
    profile.midi.preferredDevice = meta.preferredDevice || profile.midi.preferredDevice;
  }
  return profile;
}

function defaultProfile() {
  const surfaceId = "mpd226";
  const midiBindings = defaultMidiBindings(surfaceId);
  return {
    version: 5,
    surfaceId,
    surfaceProfiles: {},
    obs: {
      host: "127.0.0.1",
      port: 4455,
      password: "",
      /** Quietly scan for OBS on launch — fine if OBS starts later */
      autoConnect: true,
    },
    midi: {
      preferredDevice: "MPD226",
      lastDeviceName: "",
      shareMode: "bph",
      shareEnabled: true,
      shareOutputName: "BPH MixLine",
    },
    activeBank: 0,
    banks: defaultBanks(surfaceId),
    midiBindings,
    lighting: {
      idleColor: "#44dd66",
      brightness: 100,
      flashOnPress: true,
    },
    blockPadKeys: false,
    keyMap: {},
    buttons: [],
  };
}

function profilePath() {
  const dir = path.join(app.getPath("userData"), "bph-stream-controller");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "profile.json");
}

function hexToRgb(hex) {
  const h = (hex || "#44dd66").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function loadProfile() {
  const file = profilePath();
  try {
    if (!fs.existsSync(file)) return defaultProfile();
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const base = defaultProfile();
    const surfaceId = getSurface(raw.surfaceId || "mpd226").id;
    const midiBindings = normalizeMidiBindings(raw.midiBindings, surfaceId);
    const meta = getSurface(surfaceId);
    let activeBank = Number.isInteger(raw.activeBank) ? raw.activeBank : 0;
    if (activeBank < 0 || activeBank >= meta.bankCount) activeBank = 0;
    const banks = normalizeBanks(raw.banks, midiBindings, surfaceId);
    const profile = {
      ...base,
      ...raw,
      version: 5,
      surfaceId,
      surfaceProfiles: raw.surfaceProfiles || {},
      obs: { ...base.obs, ...(raw.obs || {}) },
      midi: { ...base.midi, ...(raw.midi || {}) },
      lighting: { ...base.lighting, ...(raw.lighting || {}) },
      blockPadKeys: false,
      activeBank,
      banks,
      midiBindings,
      keyMap: raw.keyMap || {},
      buttons: Array.isArray(raw.buttons) ? raw.buttons : [],
    };
    applyBankToLive(profile, activeBank);
    return profile;
  } catch {
    return defaultProfile();
  }
}

function saveProfile(profile) {
  const file = profilePath();
  commitActiveBank(profile);
  stashSurfaceProfile(profile);
  fs.writeFileSync(file, JSON.stringify(profile, null, 2), "utf8");
  return { ok: true, path: file };
}

function newCcBinding(label = "Fader / Knob") {
  return {
    id: `cc-${Date.now()}`,
    label,
    color: "#9b6bff",
    group: "cc",
    midi: null,
    action: defaultAction(),
  };
}

module.exports = {
  BANK_IDS,
  defaultProfile,
  defaultMidiBindings,
  defaultBanks,
  loadProfile,
  saveProfile,
  profilePath,
  hexToRgb,
  newCcBinding,
  commitActiveBank,
  applyBankToLive,
  setActiveBank,
  setSurface,
  snapshotBanked,
  detectSurfaceId,
  listSurfaces,
  getSurface,
  bankedGroupsFor,
};
