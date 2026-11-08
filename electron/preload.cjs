const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bphDesktop", {
  isElectron: true,
  getProfile: () => ipcRenderer.invoke("bph:get-profile"),
  saveProfile: (profile) => ipcRenderer.invoke("bph:save-profile", profile),
  updateBinding: (binding) => ipcRenderer.invoke("bph:update-binding", binding),

  obsConnect: (opts) => ipcRenderer.invoke("bph:obs-connect", opts),
  obsDisconnect: () => ipcRenderer.invoke("bph:obs-disconnect"),
  obsState: () => ipcRenderer.invoke("bph:obs-state"),
  obsScenes: () => ipcRenderer.invoke("bph:obs-scenes"),
  obsMedia: () => ipcRenderer.invoke("bph:obs-media"),
  obsInputs: () => ipcRenderer.invoke("bph:obs-inputs"),

  midiStatus: () => ipcRenderer.invoke("bph:midi-status"),
  midiList: () => ipcRenderer.invoke("bph:midi-list"),
  midiOpen: (index) => ipcRenderer.invoke("bph:midi-open", index),
  midiClose: () => ipcRenderer.invoke("bph:midi-close"),
  midiShareSet: (opts) => ipcRenderer.invoke("bph:midi-share-set", opts),
  midiLearnStart: (id) => ipcRenderer.invoke("bph:midi-learn-start", id),
  midiLearnCancel: () => ipcRenderer.invoke("bph:midi-learn-cancel"),
  midiClear: (id) => ipcRenderer.invoke("bph:midi-clear", id),
  midiAddCc: () => ipcRenderer.invoke("bph:midi-add-cc"),
  midiRemove: (id) => ipcRenderer.invoke("bph:midi-remove", id),
  testBinding: (id) => ipcRenderer.invoke("bph:test-binding", id),
  midiSetPadColor: (payload) =>
    ipcRenderer.invoke("bph:midi-set-pad-color", payload),
  midiSyncPadColors: () => ipcRenderer.invoke("bph:midi-sync-pad-colors"),
  padPalette: () => ipcRenderer.invoke("bph:pad-palette"),
  setActiveBank: (bankIndex) =>
    ipcRenderer.invoke("bph:set-active-bank", bankIndex),
  listSurfaces: () => ipcRenderer.invoke("bph:list-surfaces"),
  setSurface: (surfaceId) => ipcRenderer.invoke("bph:set-surface", surfaceId),
  toggleState: () => ipcRenderer.invoke("bph:toggle-state"),
  releaseKeys: () => ipcRenderer.invoke("bph:release-keys"),

  onMidiMessage: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on("bph:midi-message", listener);
    return () => ipcRenderer.removeListener("bph:midi-message", listener);
  },
  onMidiStatus: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on("bph:midi-status", listener);
    return () => ipcRenderer.removeListener("bph:midi-status", listener);
  },
  onMidiLearnResult: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on("bph:midi-learn-result", listener);
    return () => ipcRenderer.removeListener("bph:midi-learn-result", listener);
  },
  onBindingFire: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on("bph:binding-fire", listener);
    return () => ipcRenderer.removeListener("bph:binding-fire", listener);
  },
  onCcValue: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on("bph:cc-value", listener);
    return () => ipcRenderer.removeListener("bph:cc-value", listener);
  },
  onActionResult: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on("bph:action-result", listener);
    return () => ipcRenderer.removeListener("bph:action-result", listener);
  },
  onObsState: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on("bph:obs-state", listener);
    return () => ipcRenderer.removeListener("bph:obs-state", listener);
  },
  onProfile: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on("bph:profile", listener);
    return () => ipcRenderer.removeListener("bph:profile", listener);
  },
  onBindingToggle: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on("bph:binding-toggle", listener);
    return () => ipcRenderer.removeListener("bph:binding-toggle", listener);
  },
  onBankChanged: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on("bph:bank-changed", listener);
    return () => ipcRenderer.removeListener("bph:bank-changed", listener);
  },
  onSurface: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on("bph:surface", listener);
    return () => ipcRenderer.removeListener("bph:surface", listener);
  },
});
