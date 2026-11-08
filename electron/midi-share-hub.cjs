/**
 * BPH MIDI Share Hub — no loopMIDI required between BPH apps.
 * Stream Controller owns the hardware MIDI port and broadcasts every message
 * to localhost so MixLine can subscribe.
 *
 * WebSocket: ws://127.0.0.1:18726
 *   hello → { v:1, type:"hello", app:"stream-controller" }
 *   midi  → { v:1, type:"midi", bytes:[...], msg:{...}, at:ms }
 *
 * UDP mirror: JSON datagrams to 127.0.0.1:18727
 */

const http = require("http");
const dgram = require("dgram");
const crypto = require("crypto");

const WS_PORT = 18726;
const UDP_PORT = 18727;
const UDP_HOST = "127.0.0.1";
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

let enabled = false;
/** @type {import('http').Server | null} */
let httpServer = null;
/** @type {Set<any>} */
let clients = new Set();
/** @type {import('dgram').Socket | null} */
let udp = null;
let lastError = null;

function getStatus() {
  return {
    enabled,
    mode: "bph",
    wsPort: WS_PORT,
    udpPort: UDP_PORT,
    clients: clients.size,
    listening: !!httpServer,
    lastError,
    url: `ws://127.0.0.1:${WS_PORT}`,
  };
}

function wsSend(socket, text) {
  const payload = Buffer.from(String(text), "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    return; // skip huge
  }
  try {
    socket.write(Buffer.concat([header, payload]));
  } catch {
    /* drop */
  }
}

function broadcast(obj) {
  if (!enabled) return;
  const payload = JSON.stringify(obj);

  for (const socket of [...clients]) {
    if (socket.destroyed) {
      clients.delete(socket);
      continue;
    }
    wsSend(socket, payload);
  }

  if (udp) {
    try {
      udp.send(Buffer.from(payload, "utf8"), UDP_PORT, UDP_HOST);
    } catch {
      /* ignore */
    }
  }
}

function publishMidi(bytes, msg) {
  if (!enabled) return;
  const arr = Array.isArray(bytes) ? bytes : Array.from(bytes || []);
  if (!arr.length) return;
  broadcast({
    v: 1,
    type: "midi",
    bytes: arr,
    msg: msg || null,
    at: Date.now(),
  });
}

function acceptWebSocket(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash("sha1")
    .update(key + GUID, "binary")
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n"
  );

  clients.add(socket);
  wsSend(
    socket,
    JSON.stringify({
      v: 1,
      type: "hello",
      app: "stream-controller",
      wsPort: WS_PORT,
      udpPort: UDP_PORT,
    })
  );

  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
  // Keepalive / ignore client frames (MixLine is receive-only)
  socket.on("data", () => {});
}

function start() {
  if (httpServer) {
    enabled = true;
    return { ok: true, ...getStatus() };
  }

  try {
    httpServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          ...getStatus(),
          hint: "MixLine should connect with WebSocket to this URL path /",
        })
      );
    });

    httpServer.on("upgrade", (req, socket) => {
      acceptWebSocket(req, socket);
    });

    httpServer.on("error", (err) => {
      lastError = err.message;
      enabled = false;
      httpServer = null;
    });

    httpServer.listen(WS_PORT, "127.0.0.1", () => {
      lastError = null;
    });

    udp = dgram.createSocket("udp4");
    udp.bind(0, "127.0.0.1");

    enabled = true;
    return { ok: true, ...getStatus() };
  } catch (err) {
    lastError = err.message;
    enabled = false;
    return { ok: false, error: lastError };
  }
}

function stop() {
  enabled = false;
  for (const socket of clients) {
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
  }
  clients.clear();
  if (httpServer) {
    try {
      httpServer.close();
    } catch {
      /* ignore */
    }
    httpServer = null;
  }
  if (udp) {
    try {
      udp.close();
    } catch {
      /* ignore */
    }
    udp = null;
  }
  return { ok: true, ...getStatus() };
}

function setEnabled(on) {
  if (on) return start();
  return stop();
}

module.exports = {
  WS_PORT,
  UDP_PORT,
  start,
  stop,
  setEnabled,
  publishMidi,
  getStatus,
};
