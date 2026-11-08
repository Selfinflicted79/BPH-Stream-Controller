/** OBS WebSocket v5 bridge (obs-websocket-js) with quiet wait + auto-reconnect. */

let OBSWebSocket = null;
/** @type {import('obs-websocket-js').default | null} */
let obs = null;
let connected = false;
let lastError = null;
/** @type {{ host: string, port: number, password: string } | null} */
let lastCreds = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let reconnectEnabled = true;
let intentionalDisconnect = false;
/** True after at least one successful connect this session. */
let everConnected = false;
/** Quietly scanning until OBS WebSocket appears (no UI freak-out). */
let waitingForObs = false;
let lastEmitAt = 0;
/** @type {Set<(state: object) => void>} */
const listeners = new Set();

async function loadLib() {
  if (OBSWebSocket) return OBSWebSocket;
  const mod = await import("obs-websocket-js");
  OBSWebSocket = mod.default;
  return OBSWebSocket;
}

function getState() {
  return {
    connected,
    lastError,
    reconnecting: !!reconnectTimer || waitingForObs,
    reconnectAttempt,
    waitingForObs,
    everConnected,
  };
}

function emitState(extra = {}, opts = {}) {
  const now = Date.now();
  // While waiting for first OBS, don't spam the UI more than ~1.5s
  if (opts.throttle && waitingForObs && now - lastEmitAt < 1500) return;
  lastEmitAt = now;
  const state = { ...getState(), ...extra };
  for (const fn of listeners) {
    try {
      fn(state);
    } catch {
      /* ignore */
    }
  }
}

function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function friendlyError(err) {
  const msg = err?.message || String(err);
  const code = err?.code;
  if (/ECONNREFUSED|connect ECONNREFUSED|1006|not open|failed to connect/i.test(msg)) {
    return "OBS WebSocket not reachable — start OBS (Tools → WebSocket Server)";
  }
  if (/not connected|socket/i.test(msg)) {
    return "OBS WebSocket not connected";
  }
  if (/already (streaming|recording)/i.test(msg)) {
    return msg;
  }
  if (/failed to connect|could not|stream.*(service|settings|key)/i.test(msg)) {
    return `${msg} — check OBS → Settings → Stream is configured`;
  }
  if (/recording.*(path|directory|folder)/i.test(msg)) {
    return `${msg} — check OBS → Settings → Output recording path`;
  }
  return code != null ? `${msg} (${code})` : msg;
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

async function disposeSocket() {
  if (!obs) return;
  const sock = obs;
  obs = null;
  try {
    sock.removeAllListeners?.();
  } catch {
    /* ignore */
  }
  try {
    await sock.disconnect();
  } catch {
    /* ignore */
  }
}

function scheduleReconnect() {
  if (!reconnectEnabled || intentionalDisconnect || !lastCreds) return;
  if (reconnectTimer) return;

  const attempt = reconnectAttempt + 1;
  reconnectAttempt = attempt;

  // First-time wait (OBS not launched yet): calm 3→8s cadence
  // After a drop: faster 1→2→4→15s so stream recoveries feel snappy
  let delay;
  if (!everConnected) {
    waitingForObs = true;
    delay = Math.min(8000, 3000 + (attempt - 1) * 1500);
    lastError = "Waiting for OBS… start OBS anytime — we’ll link automatically";
  } else {
    waitingForObs = false;
    delay = Math.min(15000, 1000 * Math.pow(2, Math.min(attempt - 1, 3)));
    lastError = `OBS disconnected — reconnecting in ${Math.round(delay / 1000)}s…`;
  }

  emitState(
    {
      reason: everConnected ? "reconnect-scheduled" : "waiting-for-obs",
    },
    { throttle: !everConnected }
  );

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (intentionalDisconnect || !lastCreds) return;
    const res = await connect(lastCreds.host, lastCreds.port, lastCreds.password, {
      fromReconnect: true,
      autoRetry: true,
      quiet: !everConnected,
    });
    if (!res.ok) {
      scheduleReconnect();
    }
  }, delay);
}

function attachSocketHandlers(socket) {
  socket.on("ConnectionClosed", () => {
    // Ignore close events from a socket we already replaced/disposed
    if (obs !== socket) return;
    const wasConnected = connected || everConnected;
    connected = false;
    obs = null;
    if (!intentionalDisconnect) {
      if (wasConnected && everConnected) {
        lastError = "OBS WebSocket closed (OBS quit or restarted?)";
        emitState({ reason: "closed" });
      } else {
        waitingForObs = true;
        lastError = "Waiting for OBS… start OBS anytime — we’ll link automatically";
        emitState({ reason: "waiting-for-obs" }, { throttle: true });
      }
      scheduleReconnect();
    } else {
      emitState({ reason: "closed-intentional" });
    }
  });
  socket.on("ConnectionError", (err) => {
    if (obs !== socket) return;
    connected = false;
    if (everConnected) {
      lastError = err?.message || String(err);
      emitState({ reason: "error" });
    } else {
      waitingForObs = true;
      lastError = "Waiting for OBS… start OBS anytime — we’ll link automatically";
      emitState({ reason: "waiting-for-obs" }, { throttle: true });
    }
  });
}

async function connect(host, port, password, opts = {}) {
  await loadLib();
  intentionalDisconnect = false;
  clearReconnect();

  lastCreds = {
    host: host || "127.0.0.1",
    port: port || 4455,
    password: password || "",
  };

  await disposeSocket();
  connected = false;

  const url = `ws://${lastCreds.host}:${lastCreds.port}`;
  obs = new OBSWebSocket();
  attachSocketHandlers(obs);

  try {
    await obs.connect(url, lastCreds.password || undefined);
    const wasEver = everConnected;
    connected = true;
    waitingForObs = false;
    everConnected = true;
    lastError = null;
    reconnectAttempt = 0;
    emitState({
      reason: opts.fromReconnect && wasEver ? "reconnected" : "connected",
      url,
    });
    return { ok: true, url };
  } catch (err) {
    connected = false;
    const raw = err?.message || String(err);
    await disposeSocket();

    if (opts.quiet || opts.autoRetry || opts.fromReconnect) {
      waitingForObs = !everConnected;
      lastError = everConnected
        ? friendlyError(err)
        : "Waiting for OBS… start OBS anytime — we’ll link automatically";
      emitState(
        { reason: everConnected ? "connect-failed" : "waiting-for-obs" },
        { throttle: !everConnected }
      );
      if (opts.fromReconnect || opts.autoRetry) {
        scheduleReconnect();
      }
      return { ok: false, error: lastError, waiting: waitingForObs };
    }

    lastError = friendlyError(err);
    emitState({ reason: "connect-failed" });
    return { ok: false, error: lastError };
  }
}

async function disconnect() {
  intentionalDisconnect = true;
  clearReconnect();
  reconnectAttempt = 0;
  waitingForObs = false;
  await disposeSocket();
  connected = false;
  emitState({ reason: "disconnected" });
}

/** If socket looks dead, try one immediate reconnect using saved creds. */
async function ensureConnected() {
  if (connected && obs) {
    try {
      await obs.call("GetVersion");
      return { ok: true };
    } catch {
      connected = false;
      await disposeSocket();
    }
  }
  if (!lastCreds) {
    return { ok: false, error: "Not connected — open OBS WebSocket in the link bay" };
  }
  const res = await connect(lastCreds.host, lastCreds.port, lastCreds.password, {
    fromReconnect: true,
    quiet: !everConnected,
  });
  return res.ok ? { ok: true, reconnected: true } : res;
}

async function listScenes() {
  const ready = await ensureConnected();
  if (!ready.ok) return { ok: false, error: ready.error || "Not connected", scenes: [] };
  try {
    const res = await obs.call("GetSceneList");
    const scenes = (res.scenes || []).map((s) => s.sceneName);
    return {
      ok: true,
      scenes,
      currentProgramSceneName: res.currentProgramSceneName,
    };
  } catch (err) {
    return { ok: false, error: friendlyError(err), scenes: [] };
  }
}

async function listInputs() {
  const ready = await ensureConnected();
  if (!ready.ok) return { ok: false, error: ready.error || "Not connected", inputs: [] };
  try {
    const res = await obs.call("GetInputList");
    const inputs = (res.inputs || []).map((i) => ({
      name: i.inputName,
      kind: i.inputKind,
    }));
    return { ok: true, inputs };
  } catch (err) {
    return { ok: false, error: friendlyError(err), inputs: [] };
  }
}

async function listMediaInputs() {
  const ready = await ensureConnected();
  if (!ready.ok) return { ok: false, error: ready.error || "Not connected", inputs: [] };
  try {
    const res = await obs.call("GetInputList");
    const inputs = (res.inputs || [])
      .filter((i) => {
        const kind = String(i.inputKind || "").toLowerCase();
        return (
          kind.includes("ffmpeg") ||
          kind.includes("vlc") ||
          kind.includes("media")
        );
      })
      .map((i) => i.inputName);
    return { ok: true, inputs };
  } catch (err) {
    return { ok: false, error: friendlyError(err), inputs: [] };
  }
}

async function setScene(sceneName) {
  const ready = await ensureConnected();
  if (!ready.ok) return { ok: false, error: ready.error };
  try {
    await obs.call("SetCurrentProgramScene", { sceneName });
    return { ok: true, action: "scene", detail: sceneName };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

async function triggerMedia(inputName, mediaAction = "restart") {
  const ready = await ensureConnected();
  if (!ready.ok) return { ok: false, error: ready.error };
  try {
    const action =
      mediaAction === "play"
        ? "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY"
        : mediaAction === "stop"
          ? "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP"
          : mediaAction === "pause"
            ? "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE"
            : "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART";
    await obs.call("TriggerMediaInputAction", {
      inputName,
      mediaAction: action,
    });
    return { ok: true, action: "media", detail: `${mediaAction} ${inputName}` };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

async function doRecord(mode) {
  const ready = await ensureConnected();
  if (!ready.ok) return { ok: false, error: ready.error };
  try {
    if (mode === "start") await obs.call("StartRecord");
    else if (mode === "stop") await obs.call("StopRecord");
    else await obs.call("ToggleRecord");
    return { ok: true, action: "record", detail: mode };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

async function doStream(mode) {
  const ready = await ensureConnected();
  if (!ready.ok) return { ok: false, error: ready.error };
  try {
    if (mode === "start") await obs.call("StartStream");
    else if (mode === "stop") await obs.call("StopStream");
    else await obs.call("ToggleStream");
    return { ok: true, action: "stream", detail: mode };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

async function setInputVolume(inputName, midiValue) {
  const ready = await ensureConnected();
  if (!ready.ok) return { ok: false, error: ready.error };
  try {
    const mul = Math.max(0, Math.min(1, Number(midiValue) / 127));
    await obs.call("SetInputVolume", {
      inputName,
      inputVolumeMul: mul,
    });
    return { ok: true, action: "volume", detail: `${inputName} ${(mul * 100).toFixed(0)}%` };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

async function runAction(action, opts = {}) {
  if (!action || action.type === "none") {
    return { ok: false, error: "No action" };
  }
  if (action.type === "scene") return setScene(action.target);
  if (action.type === "media") {
    return triggerMedia(action.target, action.mediaAction || "restart");
  }
  if (action.type === "record") {
    return doRecord(action.recordAction || "toggle");
  }
  if (action.type === "stream") {
    return doStream(action.streamAction || "toggle");
  }
  if (action.type === "volume") {
    return setInputVolume(action.target, opts.midiValue);
  }
  return { ok: false, error: `Unknown action type: ${action.type}` };
}

module.exports = {
  connect,
  disconnect,
  ensureConnected,
  getState,
  onStateChange,
  listScenes,
  listInputs,
  listMediaInputs,
  setScene,
  triggerMedia,
  toggleRecord: () => doRecord("toggle"),
  startRecord: () => doRecord("start"),
  stopRecord: () => doRecord("stop"),
  toggleStream: () => doStream("toggle"),
  startStream: () => doStream("start"),
  stopStream: () => doStream("stop"),
  setInputVolume,
  runAction,
};
