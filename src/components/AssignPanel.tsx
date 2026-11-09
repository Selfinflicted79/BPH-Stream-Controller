import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MidiBinding, ActionType, ObsSceneItem } from "@/lib/types";
import { formatMidiSig } from "@/lib/desktop";
import { PAD_PALETTE, nearestPadColorIndex } from "@/lib/pad-palette";
import {
  TRANSPORT_GLYPHS,
  LIT_HUES,
  defaultLitHue,
  defaultTransportGlyph,
  type LitHue,
} from "@/lib/transport-glyphs";

/** Map a KeyboardEvent to our macro token (window-focused only — no hooks). */
function eventToMacroToken(e: KeyboardEvent): string | null {
  const code = e.code || "";
  if (code === "ControlLeft" || code === "ControlRight") return e.code === "ControlRight" ? "rctrl" : "lctrl";
  if (code === "AltLeft" || code === "AltRight") return e.code === "AltRight" ? "ralt" : "lalt";
  if (code === "ShiftLeft" || code === "ShiftRight") return e.code === "ShiftRight" ? "rshift" : "lshift";
  if (code === "MetaLeft" || code === "MetaRight") return "lwin";
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^F([1-9]|1[0-2])$/.test(code)) return code.toLowerCase();
  if (code === "Space") return "space";
  if (code === "Enter") return "enter";
  if (code === "Escape") return "esc";
  if (code === "Tab") return "tab";
  if (code === "Backspace") return "backspace";
  return null;
}

function chordFromHeld(held: Set<string>): string {
  const order = ["lctrl", "rctrl", "lalt", "ralt", "lshift", "rshift", "lwin"];
  const mods = order.filter((k) => held.has(k));
  const rest = [...held].filter((k) => !order.includes(k)).sort();
  return [...mods, ...rest].join("+");
}

interface Props {
  binding: MidiBinding | null;
  scenes: string[];
  mediaInputs: string[];
  audioInputs: string[];
  sceneItems: ObsSceneItem[];
  learning: boolean;
  hwOutName?: string | null;
  showPadLeds?: boolean;
  onChange: (next: MidiBinding) => void;
  onLearn: () => void;
  onCancelLearn: () => void;
  onClearMidi: () => void;
  onTest: () => void;
  onPadColor: (colorIndex: number) => void;
  onSyncColors: () => void;
}

function DigiScreen({
  label,
  children,
  accent = "cyan",
}: {
  label: string;
  children: ReactNode;
  accent?: "cyan" | "magenta" | "amber";
}) {
  return (
    <div className={`digi-screen digi-screen--${accent}`}>
      <div className="digi-screen__label">{label}</div>
      <div className="digi-screen__body">{children}</div>
    </div>
  );
}

export function AssignPanel({
  binding,
  scenes,
  mediaInputs,
  audioInputs,
  sceneItems,
  learning,
  hwOutName,
  showPadLeds = true,
  onChange,
  onLearn,
  onCancelLearn,
  onClearMidi,
  onTest,
  onPadColor,
  onSyncColors,
}: Props) {
  const [recordingMacro, setRecordingMacro] = useState(false);
  const heldKeys = useRef(new Set<string>());

  useEffect(() => {
    if (!recordingMacro) return;
    heldKeys.current = new Set();

    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      const token = eventToMacroToken(e);
      if (!token) return;
      heldKeys.current.add(token);
      const chord = chordFromHeld(heldKeys.current);
      if (binding) {
        onChange({
          ...binding,
          action: { ...binding.action, type: "macro", macroChord: chord },
        });
      }
    };
    const onUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const token = eventToMacroToken(e);
      if (token) heldKeys.current.delete(token);
      if (heldKeys.current.size === 0 && binding?.action.macroChord) {
        setRecordingMacro(false);
      }
    };
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
    };
  }, [recordingMacro, binding, onChange]);

  useEffect(() => {
    setRecordingMacro(false);
  }, [binding?.id]);

  if (!binding) {
    return (
      <aside className="digital-console">
        <div className="digital-console__title">ASSIGN</div>
        <DigiScreen label="STATUS">
          <p className="digi-copy">
            Click a pad, fader switch (under the sliders), knob, fader, or transport.
            FULL / 16 / TAP / REPEAT are local on the MPD and do not send MIDI — use Switch 1–4 instead.
            Pad Bank cannot be controlled over MIDI either way — app A–D only swaps saved bindings and pad colors on the 16 visible pads.
          </p>
        </DigiScreen>
      </aside>
    );
  }

  const set = (patch: Partial<MidiBinding>) => onChange({ ...binding, ...patch });
  const setAction = (patch: Partial<MidiBinding["action"]>) =>
    onChange({ ...binding, action: { ...binding.action, ...patch } });

  const activeColor =
    typeof binding.padColorIndex === "number"
      ? binding.padColorIndex
      : nearestPadColorIndex(binding.color);
  const isPad = binding.group === "pad";
  const isTransport = binding.group === "transport";
  const showPressMode =
    binding.group === "switch" ||
    binding.group === "pad" ||
    binding.group === "transport" ||
    binding.group === "mode";
  const activeGlyph = binding.uiGlyph || defaultTransportGlyph(binding.id);
  const activeLit = (binding.litHue || defaultLitHue(binding.id)) as LitHue;

  return (
    <aside className="digital-console">
      <div className="digital-console__title">ASSIGN</div>

      <DigiScreen label="CONTROL" accent="magenta">
        <div className="digi-readout digi-readout--lg">
          {isTransport ? (
            <span className="digi-glyph-preview">{activeGlyph}</span>
          ) : null}{" "}
          {binding.label}
        </div>
        <input
          className="digi-field"
          value={binding.label}
          maxLength={28}
          onChange={(e) => set({ label: e.target.value })}
          aria-label="Name"
        />
      </DigiScreen>

      {isTransport && (
        <DigiScreen label="FACE · SYMBOL & LIGHT" accent="amber">
          <span className="digi-meta">Symbol</span>
          <div className="digi-glyph-grid">
            {TRANSPORT_GLYPHS.map((g) => (
              <button
                key={g}
                type="button"
                className={`digi-glyph ${activeGlyph === g ? "active" : ""}`}
                onClick={() => set({ uiGlyph: g })}
                title={g}
              >
                {g}
              </button>
            ))}
          </div>
          <span className="digi-meta" style={{ marginTop: "0.45rem" }}>
            Light when active
          </span>
          <div className="digi-btn-row">
            {LIT_HUES.map((h) => (
              <button
                key={h.id}
                type="button"
                className={`digi-btn ${activeLit === h.id ? "digi-btn--primary" : ""}`}
                style={{
                  borderColor: activeLit === h.id ? h.swatch : undefined,
                  color: activeLit === h.id ? h.swatch : undefined,
                }}
                onClick={() => set({ litHue: h.id })}
              >
                {h.label}
              </button>
            ))}
          </div>
          <p className="digi-copy" style={{ fontSize: "0.72rem" }}>
            Defaults: Play/Stop/Pause green · Rec red. Use Toggle so the light stays on while streaming / overlay is up.
          </p>
        </DigiScreen>
      )}

      {isPad && showPadLeds && (
        <DigiScreen label="PAD LED · HARDWARE" accent="cyan">
          <div className="digi-swatches">
            {PAD_PALETTE.filter((p) => p.id > 0).map((p) => (
              <button
                key={p.id}
                type="button"
                className={`digi-swatch ${activeColor === p.id ? "active" : ""}`}
                style={{ background: p.hex }}
                title={p.name}
                onClick={() => onPadColor(p.id)}
              />
            ))}
          </div>
          <div className="digi-meta">
            {PAD_PALETTE.find((p) => p.id === activeColor)?.name || "—"}
            {hwOutName ? ` · via ${hwOutName}` : " · open MIDI to push"}
          </div>
          <button type="button" className="digi-btn" onClick={onSyncColors}>
            Sync all pads → MPD
          </button>
        </DigiScreen>
      )}

      <DigiScreen label="MIDI" accent="amber">
        <div className="digi-readout" style={{ fontFamily: "var(--font-mono)" }}>
          {formatMidiSig(binding.midi)}
        </div>
        {learning ? (
          <div className="space-y-2">
            <p className="digi-copy digi-copy--pulse">Waiting for MPD hit…</p>
            <button type="button" className="digi-btn" onClick={onCancelLearn}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="digi-btn-row">
            <button type="button" className="digi-btn digi-btn--primary" onClick={onLearn}>
              Learn
            </button>
            <button
              type="button"
              className="digi-btn"
              onClick={onClearMidi}
              disabled={!binding.midi}
            >
              Clear
            </button>
            <button type="button" className="digi-btn" onClick={onTest}>
              Test
            </button>
          </div>
        )}
      </DigiScreen>

      <DigiScreen label="ACTION" accent="magenta">
        <select
          className="digi-field"
          value={binding.action.type}
          onChange={(e) => {
            const type = e.target.value as ActionType;
            const firstItem = sceneItems[0];
            setAction({
              type,
              target:
                type === "scene"
                  ? scenes[0] || ""
                  : type === "source"
                    ? firstItem?.sourceName || ""
                    : type === "media" || type === "volume"
                      ? (type === "media" ? mediaInputs[0] : audioInputs[0]) || ""
                      : "",
              sceneName: type === "source" ? firstItem?.sceneName || "" : "",
              sourceAction: type === "source" ? "toggle" : binding.action.sourceAction,
              macroChord:
                type === "macro"
                  ? binding.action.macroChord || "lalt+1"
                  : binding.action.macroChord || "",
              macroStyle:
                type === "macro"
                  ? binding.action.macroStyle || "tap"
                  : binding.action.macroStyle || "tap",
            });
          }}
        >
          <option value="none">None</option>
          <option value="scene">OBS — Switch scene</option>
          <option value="source">OBS — Source / overlay on-off</option>
          <option value="media">OBS — Media</option>
          <option value="record">OBS — Recording</option>
          <option value="stream">OBS — Streaming</option>
          <option value="volume">OBS — Volume</option>
          <option value="macro">Keyboard macro</option>
        </select>

        {showPressMode && (
          <label className="block space-y-1 mt-2">
            <span className="digi-meta">Press mode</span>
            <select
              className="digi-field"
              value={binding.pressMode || "momentary"}
              onChange={(e) => {
                const pressMode = e.target.value as "momentary" | "toggle";
                if (binding.action.type === "macro") {
                  onChange({
                    ...binding,
                    pressMode,
                    action: { ...binding.action, macroStyle: "tap" },
                  });
                } else {
                  set({ pressMode });
                }
              }}
            >
              <option value="momentary">Momentary (while pressed)</option>
              <option value="toggle">Toggle (press on / press off, stays lit)</option>
            </select>
          </label>
        )}

        {binding.action.type === "macro" && (
          <div className="mt-2 space-y-2">
            <label className="block space-y-1">
              <span className="digi-meta">Chord</span>
              <input
                className="digi-field"
                value={binding.action.macroChord || ""}
                placeholder="lalt+1"
                spellCheck={false}
                onChange={(e) => setAction({ macroChord: e.target.value })}
              />
            </label>
            <div className="digi-btn-row">
              <button
                type="button"
                className={`digi-btn digi-btn--primary ${recordingMacro ? "digi-btn--pulse" : ""}`}
                onClick={() => setRecordingMacro((v) => !v)}
              >
                {recordingMacro ? "Recording… click stop" : "Record macro"}
              </button>
              {["lalt+1", "lalt+2", "ctrl+shift+s", "f8"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="digi-btn"
                  onClick={() =>
                    setAction({ macroChord: preset, macroStyle: "tap" })
                  }
                >
                  {preset}
                </button>
              ))}
            </div>
            <label className="block space-y-1">
              <span className="digi-meta">Macro style</span>
              <select
                className="digi-field"
                value={binding.action.macroStyle || "tap"}
                onChange={(e) =>
                  setAction({
                    macroStyle: e.target.value as "tap" | "hold",
                  })
                }
              >
                <option value="tap">Tap (recommended — chord once per press)</option>
                <option value="hold">Hold keys (experimental — can stick Alt)</option>
              </select>
            </label>
            <p className="digi-copy" style={{ fontSize: "0.72rem" }}>
              {recordingMacro
                ? "Focus this window, hold your shortcut, then release — it saves automatically."
                : "Mic: use Toggle + Tap, and set your companion hotkey to toggle (not hold). Sustained Alt-hold from apps is unreliable and can stick the key."}
            </p>
          </div>
        )}

        {binding.action.type === "scene" && (
          <select
            className="digi-field mt-2"
            value={binding.action.target}
            onChange={(e) => setAction({ target: e.target.value })}
          >
            {!scenes.length && <option value="">Connect OBS</option>}
            {scenes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        {binding.action.type === "source" && (
          <>
            <select
              className="digi-field mt-2"
              value={`${binding.action.sceneName || ""}|||${binding.action.target || ""}`}
              onChange={(e) => {
                const [sceneName = "", sourceName = ""] = e.target.value.split("|||");
                setAction({ target: sourceName, sceneName });
              }}
            >
              {!sceneItems.length && (
                <option value="|||">Connect OBS / refresh</option>
              )}
              {sceneItems.map((item) => (
                <option
                  key={`${item.sceneName}::${item.sourceName}::${item.sceneItemId}`}
                  value={`${item.sceneName}|||${item.sourceName}`}
                >
                  {item.label}
                </option>
              ))}
            </select>
            <select
              className="digi-field mt-2"
              value={binding.action.sourceAction || "toggle"}
              onChange={(e) =>
                setAction({
                  sourceAction: e.target.value as "toggle" | "show" | "hide",
                })
              }
            >
              <option value="toggle">Toggle show / hide</option>
              <option value="show">Show (eye on)</option>
              <option value="hide">Hide (eye off)</option>
            </select>
            <p className="digi-copy" style={{ fontSize: "0.72rem" }}>
              Pick Scene / Source — same name in different scenes are separate. Refresh after adding overlays in OBS.
            </p>
          </>
        )}

        {binding.action.type === "media" && (
          <>
            <select
              className="digi-field mt-2"
              value={binding.action.target}
              onChange={(e) => setAction({ target: e.target.value })}
            >
              {!mediaInputs.length && <option value="">Connect OBS</option>}
              {mediaInputs.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className="digi-field mt-2"
              value={binding.action.mediaAction || "restart"}
              onChange={(e) =>
                setAction({
                  mediaAction: e.target.value as "play" | "restart" | "stop" | "pause",
                })
              }
            >
              <option value="restart">Restart</option>
              <option value="play">Play</option>
              <option value="pause">Pause</option>
              <option value="stop">Stop</option>
            </select>
          </>
        )}

        {binding.action.type === "record" && (
          <select
            className="digi-field mt-2"
            value={binding.action.recordAction || "toggle"}
            onChange={(e) =>
              setAction({
                recordAction: e.target.value as "toggle" | "start" | "stop",
              })
            }
          >
            <option value="toggle">Toggle</option>
            <option value="start">Start</option>
            <option value="stop">Stop</option>
          </select>
        )}

        {binding.action.type === "stream" && (
          <select
            className="digi-field mt-2"
            value={binding.action.streamAction || "toggle"}
            onChange={(e) =>
              setAction({
                streamAction: e.target.value as "toggle" | "start" | "stop",
              })
            }
          >
            <option value="toggle">Toggle</option>
            <option value="start">Start</option>
            <option value="stop">Stop</option>
          </select>
        )}

        {binding.action.type === "volume" && (
          <select
            className="digi-field mt-2"
            value={binding.action.target}
            onChange={(e) => setAction({ target: e.target.value })}
          >
            {!audioInputs.length && <option value="">Connect OBS</option>}
            {audioInputs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </DigiScreen>
    </aside>
  );
}
