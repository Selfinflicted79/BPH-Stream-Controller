const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const midiInput = require("./midi-input.cjs");
const obsBridge = require("./obs-bridge.cjs");
const macroKeys = require("./macro-keys.cjs");
const {
  loadProfile,
  saveProfile,
  newCcBinding,
  setActiveBank,
  setSurface,
  commitActiveBank,
  detectSurfaceId,
  listSurfaces,
  getSurface,
} = require("./profile-store.cjs");

const isDev = !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:4320";

// Same as MixLine — allow splash video audio without a click.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let splashWindow = null;
let splashFinished = false;
let mainReady = false;
/** @type {ReturnType<typeof loadProfile>} */
let profile = null;
/** @type {string | null} */
let learnBindingId = null;
let lastCcFire = new Map();
/** Last CC value sent to the UI meter (all faders/knobs) — used to kill ±1 pot chatter. */
let lastCcUi = new Map();
/** Debounce momentary pad/transport hits so note doubles don't toggle stream twice. */
let lastMomentaryFire = new Map();
/** Binding ids currently latched on (toggle pressMode) — UI keeps yellow lit. */
const toggledOn = new Set();

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function activeBankIndex() {
  return Math.max(0, Math.min(3, Number(profile?.activeBank) || 0));
}

function syncPadColorsForActiveBank() {
  // Always paint hardware pads 0–15 (the bank currently visible on the MPD).
  // Pad Bank cannot be changed over MIDI — we only recolor the 16 pads you see.
  return midiInput.syncPadColorsFromBindings(profile?.midiBindings || [], 0);
}

function setToggleLit(bindingId, on) {
  if (on) toggledOn.add(bindingId);
  else toggledOn.delete(bindingId);
  send("bph:binding-toggle", { id: bindingId, on: !!on, toggledIds: [...toggledOn] });
}

function isPressMsg(msg) {
  if (msg.kind === "noteon" && (msg.velocity == null || msg.velocity > 0)) return true;
  if (msg.kind === "cc" && typeof msg.value === "number" && msg.value > 0) return true;
  return false;
}

function isReleaseMsg(msg) {
  if (msg.kind === "noteoff") return true;
  if (msg.kind === "noteon" && msg.velocity === 0) return true;
  if (msg.kind === "cc" && msg.value === 0) return true;
  return false;
}

function midiFromMessage(msg) {
  if (msg.kind === "noteon" || msg.kind === "noteoff") {
    return { kind: "note", channel: msg.channel, note: msg.note };
  }
  if (msg.kind === "cc") {
    return { kind: "cc", channel: msg.channel, controller: msg.controller };
  }
  return null;
}

function findBindingForMessage(msg) {
  if (!profile?.midiBindings) return null;
  const live = profile.midiBindings.find((b) =>
    midiInput.matchesBinding(msg, b.midi)
  );
  if (live) return live;

  // Pad/switch MIDI from another bank → auto-switch so A–D lights track the MPD
  const banks = profile.banks;
  if (!Array.isArray(banks)) return null;
  const active = Number(profile.activeBank) || 0;
  for (let i = 0; i < banks.length; i++) {
    if (i === active) continue;
    const hit = (banks[i].bindings || []).find((b) =>
      midiInput.matchesBinding(msg, b.midi)
    );
    if (!hit) continue;
    setActiveBank(profile, i);
    saveProfile(profile);
    send("bph:profile", profile);
    send("bph:bank-changed", {
      bankIndex: i,
      bank: getSurface(profile.surfaceId).bankLabels[i],
      reason: "pad-hit",
    });
    void syncPadColorsForActiveBank();
    return (
      profile.midiBindings.find((b) => b.id === hit.id) ||
      profile.midiBindings.find((b) => midiInput.matchesBinding(msg, b.midi)) ||
      null
    );
  }
  return null;
}

/** Sustained key-down only when explicitly set to hold (risky with Alt — prefer tap). */
function wantsMacroHold(binding, action) {
  if (!action || action.type !== "macro") return false;
  return action.macroStyle === "hold";
}

function releaseMacrosAndToggles() {
  try {
    macroKeys.releaseAllHeld();
  } catch {
    /* ignore */
  }
  if (toggledOn.size) {
    toggledOn.clear();
    send("bph:binding-toggle", { id: null, on: false, toggledIds: [] });
  }
}

async function runMacroAction(binding, action, engage) {
  const chord = action.macroChord || action.target || "";
  if (wantsMacroHold(binding, action)) {
    return engage
      ? macroKeys.keyDown(chord, binding.id)
      : macroKeys.keyUp(chord, binding.id);
  }
  if (!engage) return { ok: true, skipped: true, detail: "release" };
  return macroKeys.sendChord(chord);
}

async function runObsOrMacro(binding, action, msg, engage) {
  if (action.type === "macro") return runMacroAction(binding, action, engage);
  if (!engage) return { ok: true, skipped: true, detail: "release" };
  return obsBridge.runAction(action, {
    midiValue: msg.kind === "cc" ? msg.value : undefined,
  });
}

/** Lightweight CC meter update — every fader/knob, no toasts / selection thrash. */
function emitCcMeter(binding, msg) {
  if (msg.kind !== "cc" || typeof msg.value !== "number") return;
  binding.lastValue = msg.value;
  const v = msg.value;
  const prev = lastCcUi.get(binding.id);
  if (prev === v) return;
  // Dirty mid-throw pots chatter ±1; ends (0/127) always pass through
  if (
    typeof prev === "number" &&
    v > 4 &&
    v < 123 &&
    Math.abs(v - prev) <= 1
  ) {
    return;
  }
  lastCcUi.set(binding.id, v);
  send("bph:cc-value", { id: binding.id, value: v });
}

async function fireBinding(binding, msg) {
  if (!binding) return;

  if (msg.kind === "cc" && typeof msg.value === "number") {
    emitCcMeter(binding, msg);
  }

  const action = binding.action;
  if (!action || action.type === "none") {
    // Continuous CC with no action: silent meter only (no toast spam / UI freak-out)
    if (msg.kind === "cc") return;
    send("bph:binding-fire", { id: binding.id, msg });
    send("bph:action-result", {
      bindingId: binding.id,
      result: {
        ok: false,
        error: `“${binding.label}” has Action set to None`,
      },
    });
    return;
  }

  // Volume: continuous CC — meter every tick, OBS throttle
  if (action.type === "volume") {
    if (msg.kind !== "cc") return;
    const now = Date.now();
    const prev = lastCcFire.get(binding.id) || 0;
    if (now - prev < 40) return;
    lastCcFire.set(binding.id, now);
    const result = await obsBridge.runAction(action, { midiValue: msg.value });
    // Don't toast volume OK / spam binding-fire — meter already updated
    if (!result.ok) {
      send("bph:action-result", {
        bindingId: binding.id,
        result,
        meta: {
          label: binding.label,
          actionType: action.type,
          target: action.target,
        },
      });
    }
    return;
  }

  const pressMode = binding.pressMode === "toggle" ? "toggle" : "momentary";
  const macroHold = wantsMacroHold(binding, action);

  // Toggle: press flips latch; yellow stays lit while on; macros hold keys until off
  if (pressMode === "toggle") {
    if (!isPressMsg(msg)) return;
    const now = Date.now();
    const prev = lastMomentaryFire.get(binding.id) || 0;
    if (now - prev < 220) return;
    lastMomentaryFire.set(binding.id, now);

    const on = !toggledOn.has(binding.id);
    setToggleLit(binding.id, on);
    send("bph:binding-fire", { id: binding.id, msg, toggled: on });

    // Macros (mic/PTT): engage keys with the light. OBS/etc: fire on every press.
    const engage = macroHold ? on : true;
    const result = await runObsOrMacro(binding, action, msg, engage);

    send("bph:action-result", {
      bindingId: binding.id,
      result,
      meta: {
        label: binding.label,
        actionType: action.type,
        target: action.target,
        detail:
          result.detail ||
          result.action ||
          result.chord ||
          (on ? "mic ON" : "mic OFF"),
        toggled: on,
      },
    });
    return;
  }

  // Momentary + hold macro: keys down on press, up on release; lit while held
  if (macroHold) {
    if (isPressMsg(msg)) {
      setToggleLit(binding.id, true);
      send("bph:binding-fire", { id: binding.id, msg, toggled: true });
      const result = await runMacroAction(binding, action, true);
      send("bph:action-result", {
        bindingId: binding.id,
        result,
        meta: {
          label: binding.label,
          actionType: action.type,
          detail: result.detail || result.chord || "hold ↓",
          toggled: true,
        },
      });
    } else if (isReleaseMsg(msg)) {
      setToggleLit(binding.id, false);
      send("bph:binding-fire", { id: binding.id, msg, toggled: false });
      const result = await runMacroAction(binding, action, false);
      send("bph:action-result", {
        bindingId: binding.id,
        result,
        meta: {
          label: binding.label,
          actionType: action.type,
          detail: result.detail || "hold ↑",
          toggled: false,
        },
      });
    }
    return;
  }

  // Momentary tap / OBS: fire on press only
  if (!isPressMsg(msg)) return;
  const now = Date.now();
  const prev = lastMomentaryFire.get(binding.id) || 0;
  if (now - prev < 220) return;
  lastMomentaryFire.set(binding.id, now);

  send("bph:binding-fire", { id: binding.id, msg });
  const result = await runObsOrMacro(binding, action, msg, true);
  send("bph:action-result", {
    bindingId: binding.id,
    result,
    meta: {
      label: binding.label,
      actionType: action.type,
      target: action.target,
      detail: result.detail || result.action || result.chord || null,
    },
  });
}

function onMidiMessage(msg) {
  send("bph:midi-message", msg);
  send("bph:midi-status", midiInput.getStatus());

  if (learnBindingId) {
    // Capture on noteon or any cc
    if (msg.kind === "noteoff") return;
    if (msg.kind === "noteon" && msg.velocity === 0) return;

    const midi = midiFromMessage(msg);
    if (!midi) return;

    const id = learnBindingId;
    learnBindingId = null;

    // Clear this MIDI signature from other bindings
    for (const b of profile.midiBindings) {
      if (!b.midi) continue;
      const same =
        b.midi.kind === midi.kind &&
        b.midi.channel === midi.channel &&
        ((midi.kind === "note" && b.midi.note === midi.note) ||
          (midi.kind === "cc" && b.midi.controller === midi.controller));
      if (same) b.midi = null;
    }

    const binding = profile.midiBindings.find((b) => b.id === id);
    if (binding) {
      binding.midi = midi;
      saveProfile(profile);
      send("bph:midi-learn-result", {
        id,
        midi,
        label: midiInput.describe(msg),
        profile,
      });
      send("bph:profile", profile);
    }
    return;
  }

  const binding = findBindingForMessage(msg);
  if (binding) {
    void fireBinding(binding, msg);
  }
}

function openMidi(preferredIndex) {
  const preferred =
    preferredIndex != null
      ? preferredIndex
      : undefined;
  const listed = midiInput.listDevices();
  let index = preferred;
  if (index == null) {
    index = midiInput.findPreferredIndex(
      listed.devices || [],
      profile?.midi?.preferredDevice || "MPD226"
    );
  }
  const shareMode = profile?.midi?.shareMode || "bph";
  const shareEnabled = shareMode !== "off" && profile?.midi?.shareEnabled !== false;
  const useLoopMidi = shareMode === "loopmidi";

  // BPH native share (localhost) — preferred, no 3rd-party cable
  if (shareEnabled && (shareMode === "bph" || shareMode === "loopmidi")) {
    midiInput.shareHub.setEnabled(true);
  } else {
    midiInput.shareHub.setEnabled(false);
  }

  const res = midiInput.open(index, onMidiMessage, {
    enabled: shareEnabled && useLoopMidi,
    preferredName: profile?.midi?.shareOutputName || "BPH MixLine",
  });
  if (res.ok && profile) {
    profile.midi = {
      ...profile.midi,
      lastDeviceName: res.name,
      preferredDevice: profile.midi?.preferredDevice || "MPD226",
      shareMode,
      shareEnabled,
      shareOutputName:
        res.thru?.name || profile.midi?.shareOutputName || "BPH MixLine",
    };

    // Auto-switch drawn face when the device name matches a known surface
    const detected = detectSurfaceId(res.name);
    let surfaceChanged = false;
    if (detected && detected !== (profile.surfaceId || "mpd226")) {
      setSurface(profile, detected);
      surfaceChanged = true;
    }

    saveProfile(profile);
    if (surfaceChanged) send("bph:profile", profile);
    send("bph:surface", {
      surfaceId: profile.surfaceId || "mpd226",
      detected,
      auto: surfaceChanged,
    });

    setTimeout(() => {
      if (getSurface(profile.surfaceId).hasPadLeds) {
        midiInput.syncPadColorsFromBindings(profile.midiBindings);
      }
    }, 200);
  }
  send("bph:midi-status", midiInput.getStatus());
  return res;
}

function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, "..", "build", "icon.ico"),
    path.join(__dirname, "..", "build", "icon.png"),
    path.join(process.resourcesPath || "", "icon.ico"),
  ];
  for (const p of candidates) {
    try {
      if (p && require("fs").existsSync(p)) return p;
    } catch {
      /* skip */
    }
  }
  return undefined;
}

function splashDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, "splash");
  return path.join(__dirname, "splash");
}

function revealMainWindow() {
  if (!mainReady || !splashFinished) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.focus();
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

function createSplashWindow() {
  const icon = resolveAppIcon();
  const dir = splashDir();
  const htmlPath = path.join(dir, "index.html");
  const videoPath = path.join(dir, "DevLoadingScreen.mp4");
  const videoUrl = fs.existsSync(videoPath) ? pathToFileURL(videoPath).href : "";

  splashWindow = new BrowserWindow({
    width: 720,
    height: 405,
    resizable: false,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#07080d",
    show: true,
    title: "BPH Stream Controller",
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "splash-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  });

  void splashWindow.loadFile(htmlPath, {
    query: videoUrl ? { video: videoUrl } : {},
  });
  splashWindow.center();
  splashWindow.on("closed", () => {
    splashWindow = null;
    splashFinished = true;
    revealMainWindow();
  });

  setTimeout(() => {
    if (splashFinished) return;
    splashFinished = true;
    try {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
    } catch {
      /* already gone */
    }
    splashWindow = null;
    revealMainWindow();
  }, 14000);
}

function createWindow() {
  const icon = resolveAppIcon();
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 980,
    minWidth: 1100,
    minHeight: 800,
    backgroundColor: "#07080d",
    title: "BPH Stream Controller",
    show: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    void mainWindow.loadURL(DEV_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainReady = true;
    revealMainWindow();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle("bph:get-profile", () => profile);

  ipcMain.handle("bph:save-profile", (_e, next) => {
    profile = {
      ...next,
      blockPadKeys: false,
      midiBindings: next.midiBindings || profile.midiBindings,
      banks: next.banks || profile.banks,
      activeBank:
        typeof next.activeBank === "number" ? next.activeBank : profile.activeBank,
    };
    saveProfile(profile);
    return { ok: true, profile };
  });

  /** Keep main-process bindings in sync so MIDI fires the action shown in the UI (even before Save). */
  ipcMain.handle("bph:update-binding", (_e, nextBinding) => {
    if (!profile || !nextBinding?.id) return { ok: false, error: "No binding" };
    const i = profile.midiBindings.findIndex((b) => b.id === nextBinding.id);
    if (i < 0) return { ok: false, error: "Unknown binding" };
    profile.midiBindings[i] = { ...profile.midiBindings[i], ...nextBinding };
    commitActiveBank(profile);
    saveProfile(profile);
    return { ok: true, profile };
  });

  /** Switch Pad Bank (saves current pads/switches, loads the other bank). */
  ipcMain.handle("bph:set-active-bank", (_e, bankIndex) => {
    if (!profile) return { ok: false, error: "No profile" };
    const meta = getSurface(profile.surfaceId);
    const idx = Number(bankIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= meta.bankCount) {
      return { ok: false, error: `Bank must be 0–${meta.bankCount - 1}` };
    }
    setActiveBank(profile, idx);
    saveProfile(profile);
    send("bph:profile", profile);
    send("bph:bank-changed", {
      bankIndex: idx,
      bank: meta.bankLabels[idx],
      reason: "ui",
    });
    const res = getSurface(profile.surfaceId).hasPadLeds
      ? syncPadColorsForActiveBank()
      : { ok: true, skipped: true };
    return {
      ok: true,
      profile,
      bank: meta.bankLabels[idx],
      bankIndex: idx,
      colors: res,
    };
  });

  ipcMain.handle("bph:list-surfaces", () => ({
    ok: true,
    surfaces: listSurfaces(),
    surfaceId: profile?.surfaceId || "mpd226",
  }));

  ipcMain.handle("bph:set-surface", (_e, surfaceId) => {
    if (!profile) return { ok: false, error: "No profile" };
    const before = profile.surfaceId || "mpd226";
    setSurface(profile, surfaceId);
    saveProfile(profile);
    send("bph:profile", profile);
    send("bph:surface", {
      surfaceId: profile.surfaceId,
      detected: null,
      auto: false,
      from: before,
    });
    if (getSurface(profile.surfaceId).hasPadLeds) {
      void syncPadColorsForActiveBank();
    }
    return { ok: true, profile, surfaceId: profile.surfaceId };
  });

  ipcMain.handle("bph:toggle-state", () => ({
    toggledIds: [...toggledOn],
  }));

  /** Panic button — unstick Alt/Ctrl if a hold macro was interrupted. */
  ipcMain.handle("bph:release-keys", () => {
    releaseMacrosAndToggles();
    return { ok: true };
  });

  ipcMain.handle("bph:obs-connect", async (_e, { host, port, password }) => {
    const res = await obsBridge.connect(host, port, password, {
      // If OBS isn't up yet, keep scanning quietly instead of one hard fail
      autoRetry: true,
      quiet: true,
    });
    if (profile) {
      profile.obs = { ...profile.obs, host, port, password, autoConnect: true };
      saveProfile(profile);
    }
    send("bph:obs-state", obsBridge.getState());
    return res;
  });

  ipcMain.handle("bph:obs-disconnect", async () => {
    await obsBridge.disconnect();
    return obsBridge.getState();
  });

  ipcMain.handle("bph:obs-state", () => obsBridge.getState());
  ipcMain.handle("bph:obs-scenes", async () => obsBridge.listScenes());
  ipcMain.handle("bph:obs-media", async () => obsBridge.listMediaInputs());
  ipcMain.handle("bph:obs-inputs", async () => obsBridge.listInputs());

  ipcMain.handle("bph:midi-status", () => midiInput.getStatus());
  ipcMain.handle("bph:midi-list", () => midiInput.listDevices());
  ipcMain.handle("bph:midi-open", (_e, index) => openMidi(index));
  ipcMain.handle("bph:midi-close", () => {
    midiInput.close();
    return midiInput.getStatus();
  });

  ipcMain.handle("bph:midi-share-set", (_e, opts) => {
    if (!profile) return { ok: false, error: "No profile" };
    const shareMode =
      opts?.shareMode === "off" ||
      opts?.shareMode === "loopmidi" ||
      opts?.shareMode === "bph"
        ? opts.shareMode
        : opts?.enabled === false
          ? "off"
          : profile.midi.shareMode || "bph";
    const enabled = shareMode !== "off";
    const shareOutputName =
      typeof opts?.shareOutputName === "string" && opts.shareOutputName.trim()
        ? opts.shareOutputName.trim()
        : profile.midi.shareOutputName || "BPH MixLine";
    const shareIndex =
      opts?.index != null && Number.isInteger(Number(opts.index))
        ? Number(opts.index)
        : undefined;

    profile.midi = {
      ...profile.midi,
      shareMode,
      shareEnabled: enabled,
      shareOutputName,
    };
    saveProfile(profile);

    // Native BPH hub
    if (enabled) midiInput.shareHub.setEnabled(true);
    else midiInput.shareHub.setEnabled(false);

    // Optional loopMIDI thru
    if (shareMode === "loopmidi") {
      const thru = midiInput.openThru(shareIndex, shareOutputName);
      if (thru.ok) {
        profile.midi.shareOutputName = thru.name;
        saveProfile(profile);
      }
      send("bph:midi-status", midiInput.getStatus());
      return {
        ok: thru.ok,
        error: thru.ok ? null : thru.error,
        profile,
        status: midiInput.getStatus(),
      };
    }

    midiInput.closeThru();
    midiInput.setThruEnabled(false);
    send("bph:midi-status", midiInput.getStatus());
    return { ok: true, profile, status: midiInput.getStatus() };
  });

  ipcMain.handle("bph:midi-learn-start", (_e, bindingId) => {
    learnBindingId = String(bindingId);
    return { ok: true, id: learnBindingId };
  });

  ipcMain.handle("bph:midi-learn-cancel", () => {
    learnBindingId = null;
    return { ok: true };
  });

  ipcMain.handle("bph:midi-clear", (_e, bindingId) => {
    const b = profile.midiBindings.find((x) => x.id === bindingId);
    if (b) {
      b.midi = null;
      saveProfile(profile);
    }
    return { ok: true, profile };
  });

  ipcMain.handle("bph:midi-add-cc", () => {
    const binding = newCcBinding();
    profile.midiBindings.push(binding);
    saveProfile(profile);
    return { ok: true, binding, profile };
  });

  ipcMain.handle("bph:midi-remove", (_e, bindingId) => {
    const target = profile.midiBindings.find((b) => b.id === bindingId);
    if (!target) return { ok: false, error: "Unknown binding" };
    if (target.group === "pad" || target.group === "transport") {
      return { ok: false, error: "Cannot remove pad/transport slots" };
    }
    profile.midiBindings = profile.midiBindings.filter((b) => b.id !== bindingId);
    saveProfile(profile);
    return { ok: true, profile };
  });

  ipcMain.handle("bph:test-binding", async (_e, bindingId) => {
    const b = profile.midiBindings.find((x) => x.id === bindingId);
    if (!b) return { ok: false, error: "Unknown binding" };
    // Clear debounce so Test always fires
    lastMomentaryFire.delete(b.id);
    await fireBinding(b, { kind: "noteon", channel: 1, note: 0, velocity: 127 });
    return { ok: true };
  });

  ipcMain.handle("bph:midi-set-pad-color", (_e, payload) => {
    const bindingId = payload?.bindingId;
    const colorIndex = Number(payload?.colorIndex);
    const hex = payload?.hex;
    const b = profile?.midiBindings?.find((x) => x.id === bindingId);
    if (!b) return { ok: false, error: "Unknown binding" };

    const idx =
      Number.isInteger(colorIndex) && colorIndex >= 0 && colorIndex <= 16
        ? colorIndex
        : midiInput.padColors.nearestPaletteIndex(hex || b.color);

    b.padColorIndex = idx;
    b.color = midiInput.padColors.paletteHex(idx);

    const localIdx = midiInput.padColors.padIndexFromBindingId(b.id, 0);
    let hw = { ok: true, skipped: true };
    if (localIdx >= 0) {
      hw = midiInput.setPadHardwareColor(localIdx + 1, idx, activeBankIndex());
    }

    saveProfile(profile);
    send("bph:profile", profile);
    return { ok: true, colorIndex: idx, hex: b.color, hardware: hw, profile };
  });

  ipcMain.handle("bph:midi-sync-pad-colors", () => {
    return syncPadColorsForActiveBank();
  });

  ipcMain.handle("bph:pad-palette", () => midiInput.padColors.PALETTE);
}

app.whenReady().then(async () => {
  profile = loadProfile();
  registerIpc();

  ipcMain.on("bph:splash-done", () => {
    splashFinished = true;
    revealMainWindow();
  });

  createSplashWindow();
  createWindow();

  // Keep UI in sync when OBS quits/restarts; bridge auto-reconnects
  obsBridge.onStateChange((state) => {
    send("bph:obs-state", state);
  });

  // Start BPH MIDI share hub early (MixLine can connect even before pad opens)
  if ((profile?.midi?.shareMode || "bph") !== "off") {
    midiInput.shareHub.setEnabled(true);
  }

  setTimeout(() => {
    const res = openMidi();
    if (!res.ok) console.warn("[midi]", res.error);
  }, 400);

  // Quiet scan for OBS on launch (fine if OBS starts later — no UI freak-out)
  if (profile.obs.autoConnect !== false) {
    obsBridge
      .connect(profile.obs.host, profile.obs.port, profile.obs.password, {
        autoRetry: true,
        quiet: true,
      })
      .then(() => send("bph:obs-state", obsBridge.getState()));
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  releaseMacrosAndToggles();
  midiInput.close();
  obsBridge.disconnect();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  releaseMacrosAndToggles();
  midiInput.close();
});

app.on("will-quit", () => {
  releaseMacrosAndToggles();
});
