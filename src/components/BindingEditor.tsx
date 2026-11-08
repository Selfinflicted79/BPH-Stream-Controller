import type { MidiBinding, ActionType } from "@/lib/types";
import { formatMidiSig } from "@/lib/desktop";

interface Props {
  binding: MidiBinding | null;
  scenes: string[];
  mediaInputs: string[];
  audioInputs: string[];
  learning: boolean;
  onChange: (next: MidiBinding) => void;
  onLearn: () => void;
  onCancelLearn: () => void;
  onClearMidi: () => void;
  onTest: () => void;
  onRemove?: () => void;
}

export function BindingEditor({
  binding,
  scenes,
  mediaInputs,
  audioInputs,
  learning,
  onChange,
  onLearn,
  onCancelLearn,
  onClearMidi,
  onTest,
  onRemove,
}: Props) {
  if (!binding) {
    return (
      <div className="panel p-5 h-full flex items-center justify-center text-[var(--muted)]">
        Select a pad, transport control, or fader/knob slot to bind.
      </div>
    );
  }

  const set = (patch: Partial<MidiBinding>) => onChange({ ...binding, ...patch });
  const setAction = (patch: Partial<MidiBinding["action"]>) =>
    onChange({ ...binding, action: { ...binding.action, ...patch } });

  return (
    <div className="panel p-5 space-y-4">
      <div>
        <div
          className="text-xs tracking-[0.2em] uppercase text-[var(--muted)]"
          style={{ fontFamily: "var(--font-rack)" }}
        >
          {binding.group}
        </div>
        <h2
          className="text-xl font-extrabold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {binding.label}
        </h2>
      </div>

      <label className="block space-y-1">
        <span className="text-sm text-[var(--muted)]">Label</span>
        <input
          className="field"
          value={binding.label}
          maxLength={32}
          onChange={(e) => set({ label: e.target.value })}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-[var(--muted)]">UI color</span>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={binding.color}
            onChange={(e) => set({ color: e.target.value })}
            className="h-10 w-14 cursor-pointer rounded border border-[var(--edge)] bg-transparent"
          />
          <input
            className="field"
            value={binding.color}
            onChange={(e) => set({ color: e.target.value })}
          />
        </div>
      </label>

      <div className="space-y-2 rounded-lg border border-[var(--edge)] bg-[#0a0c12] p-3">
        <div className="text-sm text-[var(--muted)]">MIDI control</div>
        <div className="text-sm" style={{ fontFamily: "var(--font-mono)" }}>
          {formatMidiSig(binding.midi)}
        </div>
        {learning ? (
          <div className="space-y-2">
            <p className="text-sm text-[var(--accent)] font-semibold">
              Move a fader / hit a pad on the MPD226…
            </p>
            <button type="button" className="btn" onClick={onCancelLearn}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={onLearn}>
              Learn MIDI
            </button>
            <button type="button" className="btn" onClick={onClearMidi} disabled={!binding.midi}>
              Clear
            </button>
            <button type="button" className="btn" onClick={onTest}>
              Test OBS action
            </button>
          </div>
        )}
      </div>

      <label className="block space-y-1">
        <span className="text-sm text-[var(--muted)]">OBS action</span>
        <select
          className="field"
          value={binding.action.type}
          onChange={(e) => {
            const type = e.target.value as ActionType;
            setAction({
              type,
              target:
                type === "scene"
                  ? scenes[0] || ""
                  : type === "media" || type === "volume"
                    ? (type === "media" ? mediaInputs[0] : audioInputs[0]) || ""
                    : "",
            });
          }}
        >
          <option value="none">None</option>
          <option value="scene">Switch scene</option>
          <option value="media">Media play / pause / stop</option>
          <option value="record">Recording</option>
          <option value="stream">Streaming</option>
          <option value="volume">Audio volume (fader/knob)</option>
        </select>
      </label>

      {binding.action.type === "scene" && (
        <label className="block space-y-1">
          <span className="text-sm text-[var(--muted)]">Scene</span>
          <select
            className="field"
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
        </label>
      )}

      {binding.action.type === "media" && (
        <>
          <label className="block space-y-1">
            <span className="text-sm text-[var(--muted)]">Media source</span>
            <select
              className="field"
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
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-[var(--muted)]">Media action</span>
            <select
              className="field"
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
          </label>
        </>
      )}

      {binding.action.type === "record" && (
        <label className="block space-y-1">
          <span className="text-sm text-[var(--muted)]">Record</span>
          <select
            className="field"
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
        </label>
      )}

      {binding.action.type === "stream" && (
        <label className="block space-y-1">
          <span className="text-sm text-[var(--muted)]">Stream</span>
          <select
            className="field"
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
        </label>
      )}

      {binding.action.type === "volume" && (
        <label className="block space-y-1">
          <span className="text-sm text-[var(--muted)]">OBS audio input</span>
          <select
            className="field"
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
          <p className="text-xs text-[var(--muted)] mt-1">
            Bind a fader/knob (CC). Moving it sets this input’s volume.
          </p>
        </label>
      )}

      {onRemove && binding.group === "cc" && (
        <button type="button" className="btn" onClick={onRemove}>
          Remove this fader/knob slot
        </button>
      )}
    </div>
  );
}
