/**
 * Single-zone backlight control for Razer Tartarus Chroma (0x1532:0x0208)
 * via OpenRazer-style HID feature reports. Requires Synapse to be quit.
 */

const RAZER_VID = 0x1532;
const TARTARUS_CHROMA_PID = 0x0208;
const REPORT_LEN = 90;
const LED_BACKLIGHT = 0x01;

let hid = null;
let device = null;
let lastColor = { r: 0, g: 255, b: 80 };
let flashTimer = null;

function loadHid() {
  if (hid) return hid;
  try {
    hid = require("node-hid");
    return hid;
  } catch (err) {
    console.warn("[lighting] node-hid unavailable:", err.message);
    return null;
  }
}

function crcXor(buf) {
  let crc = 0;
  for (let i = 2; i < 88; i++) crc ^= buf[i];
  return crc;
}

function makeReport(commandClass, commandId, args) {
  const buf = Buffer.alloc(REPORT_LEN);
  buf[0] = 0x00; // status
  buf[1] = 0xff; // transaction id (Tartarus often uses 0xFF)
  buf[2] = 0x00;
  buf[3] = 0x00; // remaining packets
  buf[4] = 0x00; // protocol
  buf[5] = args.length; // data size
  buf[6] = commandClass;
  buf[7] = commandId;
  for (let i = 0; i < args.length; i++) buf[8 + i] = args[i];
  buf[88] = crcXor(buf);
  buf[89] = 0x00;
  return buf;
}

function sendReport(report) {
  if (!device) return false;
  try {
    // Prefer feature report; fall back to write
    if (typeof device.sendFeatureReport === "function") {
      // Some stacks want report id prefixed
      const withId = Buffer.concat([Buffer.from([0x00]), report]);
      try {
        device.sendFeatureReport(withId);
        return true;
      } catch {
        device.sendFeatureReport(report);
        return true;
      }
    }
    device.write(Buffer.concat([Buffer.from([0x00]), report]));
    return true;
  } catch (err) {
    console.warn("[lighting] send failed:", err.message);
    return false;
  }
}

function openDevice() {
  const HID = loadHid();
  if (!HID) return { ok: false, error: "node-hid not loaded" };

  closeDevice();

  let devices = [];
  try {
    devices = HID.devices().filter(
      (d) => d.vendorId === RAZER_VID && d.productId === TARTARUS_CHROMA_PID
    );
  } catch (err) {
    return { ok: false, error: err.message };
  }

  if (!devices.length) {
    return { ok: false, error: "Tartarus Chroma not found (quit Synapse and replug if needed)" };
  }

  // Prefer interfaces that look like vendor/control rather than pure keyboard
  const ranked = [...devices].sort((a, b) => {
    const score = (d) => {
      let s = 0;
      if (d.usagePage === 0x01 && d.usage === 0x06) s -= 5; // keyboard
      if (d.interface != null && d.interface > 0) s += 2;
      if (d.path && /mi_01|mi_02|col/i.test(d.path)) s += 1;
      return s;
    };
    return score(b) - score(a);
  });

  const errors = [];
  for (const info of ranked) {
    try {
      device = new HID.HID(info.path);
      device.on("error", (e) => console.warn("[lighting] device error:", e.message));
      return { ok: true, path: info.path, product: info.product };
    } catch (err) {
      errors.push(`${info.path}: ${err.message}`);
    }
  }

  return { ok: false, error: errors.join(" | ") || "could not open HID device" };
}

function closeDevice() {
  if (flashTimer) {
    clearTimeout(flashTimer);
    flashTimer = null;
  }
  if (device) {
    try {
      device.close();
    } catch {
      /* ignore */
    }
    device = null;
  }
}

function setLedRgb(r, g, b) {
  lastColor = { r, g, b };
  // class 0x03, id 0x01 = set LED RGB (OpenRazer standard)
  const report = makeReport(0x03, 0x01, [0x01, LED_BACKLIGHT, r & 0xff, g & 0xff, b & 0xff]);
  return sendReport(report);
}

function setLedEffectStatic() {
  // class 0x03, id 0x02 = set LED effect; 0x00 = static
  const report = makeReport(0x03, 0x02, [0x01, LED_BACKLIGHT, 0x00]);
  return sendReport(report);
}

function setLedStateOn() {
  const report = makeReport(0x03, 0x00, [0x01, LED_BACKLIGHT, 0x01]);
  return sendReport(report);
}

function setBrightness(pct) {
  const value = Math.max(0, Math.min(100, pct | 0));
  const report = makeReport(0x03, 0x03, [0x01, LED_BACKLIGHT, value]);
  return sendReport(report);
}

function applyStaticColor(r, g, b, brightness = 100) {
  if (!device) {
    const opened = openDevice();
    if (!opened.ok) return opened;
  }
  setLedStateOn();
  setLedEffectStatic();
  setLedRgb(r, g, b);
  setBrightness(brightness);
  return { ok: true, color: { r, g, b }, brightness };
}

function flashColor(r, g, b, ms = 180, idle, brightness = 100) {
  if (!device) {
    const opened = openDevice();
    if (!opened.ok) return opened;
  }
  if (flashTimer) clearTimeout(flashTimer);
  setLedRgb(r, g, b);
  const restore = idle || lastColor;
  flashTimer = setTimeout(() => {
    setLedRgb(restore.r, restore.g, restore.b);
    setBrightness(brightness);
    flashTimer = null;
  }, ms);
  return { ok: true };
}

function status() {
  return {
    open: !!device,
    lastColor,
  };
}

module.exports = {
  openDevice,
  closeDevice,
  applyStaticColor,
  flashColor,
  status,
  RAZER_VID,
  TARTARUS_CHROMA_PID,
};
