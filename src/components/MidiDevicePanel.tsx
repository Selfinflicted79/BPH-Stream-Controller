import type { SurfaceInfo } from "@/lib/devices";
import type { MidiDevice, MidiStatus } from "@/lib/types";

interface Props {
  status: MidiStatus;
  shareMode: "bph" | "loopmidi" | "off";
  shareOutputName: string;
  surfaces?: SurfaceInfo[];
  surfaceId?: string;
  onSurfaceChange?: (surfaceId: string) => void;
  onOpen: (index: number) => void;
  onRefresh: () => void;
  onShareChange: (opts: {
    shareMode: "bph" | "loopmidi" | "off";
    shareOutputName?: string;
    index?: number;
  }) => void;
}

export function MidiDevicePanel({
  status,
  shareMode,
  shareOutputName,
  surfaces = [],
  surfaceId = "mpd226",
  onSurfaceChange,
  onOpen,
  onRefresh,
  onShareChange,
}: Props) {
  const devices: MidiDevice[] = status.devices || [];
  const outputs: MidiDevice[] = status.outputs || [];
  const hub = status.bphShare;

  return (
    <section className={`slim-rack ${status.open ? "slim-rack--hot" : ""}`}>
      <div className="slim-rack__id">
        <p className="slim-rack__eyebrow">MIDI RACK</p>
        <h2 className="slim-rack__title">Controller In</h2>
      </div>

      <div className="slim-rack__fields">
        <select
          className="slim-field"
          aria-label="MIDI input"
          value={status.index >= 0 ? status.index : ""}
          onChange={(e) => onOpen(Number(e.target.value))}
        >
          {!devices.length && <option value="">No MIDI devices</option>}
          {devices.map((d) => (
            <option key={d.index} value={d.index}>
              {d.name}
            </option>
          ))}
        </select>

        {!!surfaces.length && onSurfaceChange && (
          <select
            className="slim-field"
            aria-label="Controller face"
            value={surfaceId}
            onChange={(e) => onSurfaceChange(e.target.value)}
          >
            {surfaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        <select
          className="slim-field"
          aria-label="Share to MixLine"
          value={shareMode}
          onChange={(e) =>
            onShareChange({
              shareMode: e.target.value as "bph" | "loopmidi" | "off",
              shareOutputName,
            })
          }
        >
          <option value="bph">BPH Share</option>
          <option value="loopmidi">loopMIDI</option>
          <option value="off">Share off</option>
        </select>

        {shareMode === "loopmidi" && (
          <select
            className="slim-field"
            aria-label="loopMIDI output"
            value={
              status.thruIndex != null && status.thruIndex >= 0
                ? status.thruIndex
                : outputs.find((o) =>
                    o.name.toLowerCase().includes((shareOutputName || "bph mixline").toLowerCase()),
                  )?.index ?? ""
            }
            onChange={(e) => {
              const index = Number(e.target.value);
              const name = outputs.find((o) => o.index === index)?.name || shareOutputName;
              onShareChange({ shareMode: "loopmidi", index, shareOutputName: name });
            }}
          >
            {!outputs.length && <option value="">No MIDI outs</option>}
            {outputs.map((d) => (
              <option key={d.index} value={d.index}>
                {d.name}
              </option>
            ))}
          </select>
        )}

        <button type="button" className="slim-icon" title="Rescan MIDI" onClick={onRefresh}>
          ↻
        </button>
      </div>

      <div className="midi-info" title="Last pad or slider that moved">
        {status.lastMessage
          ? status.lastMessage.label ||
            (status.lastMessage.kind === "cc"
              ? `CC ${status.lastMessage.controller ?? "?"} · ${status.lastMessage.value ?? 0}`
              : `${status.lastMessage.kind} ${status.lastMessage.note ?? ""}`.trim())
          : "Waiting for a pad or slider"}
        {hub?.enabled && hub?.listening ? (
          <span className="midi-info__side">{hub.clients || 0} MixLine</span>
        ) : null}
      </div>

      <div className="slim-rack__meta">
        <div className={`slim-pill ${status.open ? "on" : "off"}`}>
          <span className={`status-dot ${status.open ? "on" : "off"}`} />
          {status.open ? "MIDI CC" : "CLOSED"}
          {status.open ? <span aria-hidden>✓</span> : null}
        </div>
      </div>

      {status.lastError ? <p className="slim-rack__error">{status.lastError}</p> : null}
    </section>
  );
}
