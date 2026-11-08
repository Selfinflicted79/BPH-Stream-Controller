const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

/** @type {import('child_process').ChildProcess | null} */
let child = null;
/** @type {((evt: object) => void) | null} */
let onEvent = null;
let buffer = "";
let lastError = null;
let lastStatus = null;
let deviceSeen = false;
let devicePath = null;
let lastKey = null;
let startedAt = null;

function helperDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "tartarus-input");
  }
  return path.join(__dirname, "..", "native", "bin");
}

function helperPath() {
  return path.join(helperDir(), "TartarusInput.exe");
}

function getStatus() {
  return {
    running: !!child,
    path: helperPath(),
    exists: fs.existsSync(helperPath()),
    lastError,
    lastStatus,
    deviceSeen,
    devicePath,
    lastKey,
    startedAt,
    blockEnabled: false,
    blockKeyCount: 0,
  };
}

function setBlockConfig() {
  // Key swallowing removed — Windows still sees the Tartarus as a HID keyboard;
  // userspace cannot reclassify it. Kept as a no-op for API compatibility.
  return getStatus();
}

function start(handler) {
  stop();
  onEvent = handler;
  lastError = null;
  lastStatus = null;
  deviceSeen = false;
  devicePath = null;

  const exe = helperPath();
  if (!fs.existsSync(exe)) {
    lastError = `TartarusInput.exe not found at ${exe}`;
    console.warn("[tartarus-input]", lastError);
    return { ok: false, error: lastError };
  }

  try {
    child = spawn(exe, [], {
      cwd: helperDir(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    lastError = err.message;
    child = null;
    return { ok: false, error: lastError };
  }

  startedAt = Date.now();

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.status === "ready") lastStatus = "ready";
        if (msg.status === "device") {
          deviceSeen = true;
          devicePath = msg.path || null;
          lastStatus = "device";
        }
        if (msg.error) {
          lastError = `${msg.error}${msg.code != null ? ` (${msg.code})` : ""}`;
          lastStatus = "error";
        }
        if (msg.type === "key") {
          lastKey = {
            vKey: msg.vKey,
            name: msg.name,
            down: msg.down,
            at: Date.now(),
          };
        }
        onEvent?.(msg);
      } catch {
        console.log("[tartarus-input] raw:", line);
      }
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    console.warn("[tartarus-input:err]", chunk);
    lastError = String(chunk).trim();
  });

  child.on("error", (err) => {
    lastError = err.message;
    child = null;
  });

  child.on("exit", (code) => {
    console.warn("[tartarus-input] exited", code);
    if (code && code !== 0 && !lastError) {
      lastError = `Helper exited with code ${code}`;
    }
    child = null;
  });

  return { ok: true, path: exe };
}

function stop() {
  if (child) {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    child = null;
  }
  buffer = "";
}

function isRunning() {
  return !!child;
}

module.exports = {
  start,
  stop,
  isRunning,
  helperPath,
  getStatus,
  setBlockConfig,
};
