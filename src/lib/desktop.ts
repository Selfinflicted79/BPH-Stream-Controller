import type { BphDesktopApi } from "../vite-env";
import type { Profile } from "./types";

function defaultProfile(): Profile {
  return {
    version: 3,
    obs: {
      host: "127.0.0.1",
      port: 4455,
      password: "",
      autoConnect: false,
    },
    midi: {
      preferredDevice: "MPD226",
      lastDeviceName: "",
      shareMode: "bph",
      shareEnabled: true,
      shareOutputName: "BPH MixLine",
    },
    midiBindings: [],
    surfaceId: "mpd226",
    activeBank: 0,
    banks: [],
  };
}

const browserStub: BphDesktopApi = {
  isElectron: false,
  getProfile: async () => {
    const raw = localStorage.getItem("bph-profile");
    return raw ? (JSON.parse(raw) as Profile) : defaultProfile();
  },
  saveProfile: async (profile) => {
    localStorage.setItem("bph-profile", JSON.stringify(profile));
    return { ok: true };
  },
  updateBinding: async (binding) => {
    const raw = localStorage.getItem("bph-profile");
    const profile = raw ? (JSON.parse(raw) as Profile) : defaultProfile();
    profile.midiBindings = profile.midiBindings.map((b) =>
      b.id === binding.id ? binding : b
    );
    localStorage.setItem("bph-profile", JSON.stringify(profile));
    return { ok: true, profile };
  },
  obsConnect: async () => ({ ok: false, error: "Open in Electron" }),
  obsDisconnect: async () => ({ connected: false }),
  obsState: async () => ({ connected: false, lastError: null }),
  obsScenes: async () => ({ ok: false, scenes: [] }),
  obsMedia: async () => ({ ok: false, inputs: [] }),
  obsInputs: async () => ({ ok: false, inputs: [] }),
  obsSceneItems: async () => ({ ok: false, items: [] }),
  midiStatus: async () => ({
    available: false,
    open: false,
    index: -1,
    name: null,
    lastError: "Browser stub",
    lastMessage: null,
    devices: [],
  }),
  midiList: async () => ({ ok: false, devices: [] }),
  midiOpen: async () => ({ ok: false, error: "Electron only" }),
  midiClose: async () => ({
    available: false,
    open: false,
    index: -1,
    name: null,
    lastError: null,
    lastMessage: null,
    devices: [],
  }),
  midiShareSet: async () => ({ ok: false, error: "Electron only" }),
  midiLearnStart: async (id) => ({ ok: true, id }),
  midiLearnCancel: async () => ({ ok: true }),
  midiClear: async () => ({ ok: true }),
  midiAddCc: async () => ({ ok: false }),
  midiRemove: async () => ({ ok: false }),
  testBinding: async () => ({ ok: true }),
  midiSetPadColor: async () => ({ ok: false, error: "Electron only" }),
  midiSyncPadColors: async () => ({ ok: false, error: "Electron only" }),
  padPalette: async () => [],
  setActiveBank: async (bankIndex) => {
    const raw = localStorage.getItem("bph-profile");
    const profile = raw ? (JSON.parse(raw) as Profile) : defaultProfile();
    profile.activeBank = bankIndex;
    localStorage.setItem("bph-profile", JSON.stringify(profile));
    return { ok: true, profile, bankIndex };
  },
  listSurfaces: async () => ({
    ok: true,
    surfaces: [
      {
        id: "mpd226",
        name: "Akai MPD226",
        shortName: "MPD226",
        bankCount: 4,
        bankLabels: ["A", "B", "C", "D"],
        hasPadLeds: true,
      },
      {
        id: "mpk-mini-mk3",
        name: "Akai MPK Mini MK3",
        shortName: "MPK Mini",
        bankCount: 2,
        bankLabels: ["A", "B"],
        hasPadLeds: false,
      },
    ],
    surfaceId: "mpd226",
  }),
  setSurface: async (surfaceId) => {
    const raw = localStorage.getItem("bph-profile");
    const profile = raw ? (JSON.parse(raw) as Profile) : defaultProfile();
    profile.surfaceId = surfaceId;
    localStorage.setItem("bph-profile", JSON.stringify(profile));
    return { ok: true, profile, surfaceId };
  },
  toggleState: async () => ({ toggledIds: [] }),
  releaseKeys: async () => ({ ok: true }),
  onBindingToggle: () => () => undefined,
  onBankChanged: () => () => undefined,
  onSurface: () => () => undefined,
  onMidiMessage: () => () => undefined,
  onMidiStatus: () => () => undefined,
  onMidiLearnResult: () => () => undefined,
  onBindingFire: () => () => undefined,
  onCcValue: () => () => undefined,
  onActionResult: () => () => undefined,
  onObsState: () => () => undefined,
  onProfile: () => () => undefined,
};

export function desktop(): BphDesktopApi {
  return window.bphDesktop ?? browserStub;
}

export function formatMidiSig(midi: Profile["midiBindings"][0]["midi"]) {
  if (!midi) return "not bound";
  if (midi.kind === "note") return `Note ${midi.note} · ch${midi.channel}`;
  return `CC ${midi.controller} · ch${midi.channel}`;
}
