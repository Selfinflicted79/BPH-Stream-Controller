import type { CSSProperties } from "react";
import type { MidiBinding } from "@/lib/types";

interface Props {
  bindings: MidiBinding[];
  selectedId: string | null;
  firedId: string | null;
  /** Binding ids latched on (toggle) — yellow stays lit. */
  litIds?: Set<string> | string[];
  ccValues: Record<string, number>;
  onSelect: (id: string) => void;
  selectedLabel?: string;
  boardLive?: boolean;
  lcdHit?: { title: string; detail: string } | null;
  activeBank?: number;
  onBankSelect?: (bankIndex: number) => void;
}

/** Physical MPD226: pad 1 bottom-left → pad 16 top-right */
const PAD_ROWS = [
  [13, 14, 15, 16],
  [9, 10, 11, 12],
  [5, 6, 7, 8],
  [1, 2, 3, 4],
];

const BANK_LABELS = ["A", "B", "C", "D"] as const;

export function MpdSurface({
  bindings,
  selectedId,
  firedId,
  litIds,
  ccValues,
  onSelect,
  selectedLabel,
  boardLive = false,
  lcdHit = null,
  activeBank = 0,
  onBankSelect,
}: Props) {
  const byId = (id: string) => bindings.find((b) => b.id === id);
  const bound = (b?: MidiBinding | null) => !!b?.midi;
  const isLit = (id: string) => {
    if (firedId === id) return true;
    if (!litIds) return false;
    if (litIds instanceof Set) return litIds.has(id);
    return litIds.includes(id);
  };
  const actionHint = (b?: MidiBinding | null) => {
    if (!b || b.action.type === "none") return "unassigned";
    if (b.action.type === "macro") {
      return `macro: ${b.action.macroChord || b.action.target || "?"}`;
    }
    if (b.action.target) return `${b.action.type}: ${b.action.target}`;
    return b.action.type;
  };

  const bankLetter = BANK_LABELS[Math.max(0, Math.min(3, activeBank))] || "A";

  return (
    <div className={`mpd-stage ${boardLive ? "mpd-stage--live" : ""}`}>
      <div className="mpd-stage__hint">
        <span>Click a control on the device to assign · Bank {bankLetter}</span>
        {selectedLabel && (
          <span className="mpd-stage__hint-sel">
            Selected · <strong>{selectedLabel}</strong>
          </span>
        )}
      </div>

      <div
        className={`mpd-chassis ${boardLive ? "mpd-chassis--live" : ""}`}
        role="group"
        aria-label="MPD226 controller"
      >
        {/* Top bezel: LCD + bank A–D lights + nav chrome */}
        <div className="mpd-bezel">
          <div className="mpd-lcd">
            <div className="mpd-lcd__glow" />
            <div className="mpd-lcd__text">
              {lcdHit ? (
                <>
                  <span>{lcdHit.title}</span>
                  <span className="mpd-lcd__line2">{lcdHit.detail}</span>
                </>
              ) : (
                <>
                  <span>BPH Stream</span>
                  <span className="mpd-lcd__line2">
                    {selectedLabel
                      ? `Edit: ${selectedLabel}`
                      : `Bank ${bankLetter} · OBS Live`}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="mpd-nav">
            <div
              className="mpd-bank-lights"
              role="group"
              aria-label="Pad banks A to D"
            >
              {BANK_LABELS.map((letter, i) => (
                <button
                  key={letter}
                  type="button"
                  className={`mpd-bank-light ${activeBank === i ? "lit" : ""}`}
                  onClick={() => onBankSelect?.(i)}
                  title={`App bank ${letter} — swaps saved pads/switches + pad colors. MPD Pad Bank button is hardware-only (no MIDI).`}
                >
                  {letter}
                </button>
              ))}
            </div>
            <div className="mpd-encoder" aria-hidden>
              <span />
            </div>
          </div>
          <div className="mpd-bank-row" aria-hidden>
            {["PRESET", "PAD", "CTRL", "EDIT", "GLOBAL"].map((t, i) => (
              <div key={t} className={`mpd-bank-btn ${i === 1 ? "lit" : ""}`}>
                {t}
              </div>
            ))}
          </div>
          <div className="mpd-brand">
            <span className="mpd-brand__akai">BPH</span>
            <span className="mpd-brand__model">MPD226</span>
          </div>
        </div>

        <div className="mpd-body">
          {/* Pads */}
          <div className="mpd-pads">
            {PAD_ROWS.map((row) =>
              row.map((n) => {
                const b = byId(`pad-${n}`);
                if (!b) return null;
                const selected = selectedId === b.id;
                const fired = firedId === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`mpd-pad ${selected ? "selected" : ""} ${fired ? "fired" : ""} ${bound(b) ? "bound" : ""}`}
                    style={{ "--pad-color": b.color } as CSSProperties}
                    onClick={() => onSelect(b.id)}
                    title={`${b.label} (Bank ${bankLetter}) — ${actionHint(b)}`}
                  >
                    <span className="mpd-pad__face" />
                    <span className="mpd-pad__edge" />
                    <span className="mpd-pad__meta">
                      <span className="mpd-pad__num">{String(n).padStart(2, "0")}</span>
                      <span className="mpd-pad__name">{b.label}</span>
                    </span>
                    {bound(b) && <span className="mpd-pad__dot" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Mode column: local MPD only — no MIDI from hardware */}
          <div className="mpd-modes">
            {(
              [
                { id: "mode-full", short: "FULL", amber: false },
                { id: "mode-16", short: "16 LVL", amber: false },
                { id: "mode-tap", short: "TAP", amber: true },
                { id: "mode-repeat", short: "REPEAT", amber: true },
              ] as const
            ).map(({ id, short, amber }) => {
              const b = byId(id);
              if (!b) return null;
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`mpd-mode ${amber ? "amber" : ""} ${selectedId === b.id ? "selected" : ""} ${firedId === b.id ? "fired" : ""} ${bound(b) ? "bound" : ""}`}
                  onClick={() => onSelect(b.id)}
                  title={`${b.label} — MPD local (no MIDI). Use Switch 1–4 under faders instead. ${actionHint(b)}`}
                >
                  <span className="mpd-mode__short">{short}</span>
                  <span className="mpd-mode__name">{b.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right control bank */}
          <div className="mpd-controls">
            <div className="mpd-knobs">
              {[1, 2, 3, 4].map((n) => {
                const b = byId(`knob-${n}`);
                if (!b) return null;
                const val = ccValues[b.id] ?? b.lastValue ?? 64;
                const deg = (val / 127) * 270 - 135;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`mpd-knob-wrap ${selectedId === b.id ? "selected" : ""} ${bound(b) ? "bound" : ""}`}
                    onClick={() => onSelect(b.id)}
                    title={`${b.label} — ${actionHint(b)}`}
                  >
                    <div className="mpd-knob">
                      <span className="mpd-knob__ring" />
                      <span
                        className="mpd-knob__mark"
                        style={{ transform: `rotate(${deg}deg)` }}
                      />
                      <span className="mpd-knob__hub" />
                    </div>
                    <span className="mpd-ctrl-label">{n}</span>
                  </button>
                );
              })}
            </div>

            <div className="mpd-faders">
              {[1, 2, 3, 4].map((n) => {
                const b = byId(`fader-${n}`);
                if (!b) return null;
                const val = ccValues[b.id] ?? b.lastValue ?? 0;
                const travel = 148 - 20 - 20;
                const topPx = 10 + travel * (1 - val / 127);
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`mpd-fader-wrap ${selectedId === b.id ? "selected" : ""} ${bound(b) ? "bound" : ""}`}
                    onClick={() => onSelect(b.id)}
                    title={`${b.label} — ${val}/127 — ${actionHint(b)}`}
                  >
                    <div className="mpd-fader">
                      <div className="mpd-fader__slot" />
                      <div
                        className="mpd-fader__fill"
                        style={{ height: `${(val / 127) * 100}%` }}
                      />
                      <div
                        className="mpd-fader__cap"
                        style={{ top: `${topPx}px` }}
                      />
                    </div>
                    <span className="mpd-ctrl-label">{n}</span>
                    <span className="mpd-fader__val">{val}</span>
                  </button>
                );
              })}
            </div>

            {/* Physical MPD226 switches under faders — send MIDI, light yellow when pressed */}
            <div className="mpd-switches">
              {[1, 2, 3, 4].map((n) => {
                const b = byId(`sw-${n}`);
                if (!b) return null;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`mpd-sw ${selectedId === b.id ? "selected" : ""} ${isLit(b.id) ? "lit" : ""} ${bound(b) ? "bound" : ""}`}
                    onClick={() => onSelect(b.id)}
                    title={`${b.label} (Bank ${bankLetter}) — ${b.pressMode || "momentary"} — ${actionHint(b)}`}
                  >
                    <span className="mpd-sw__lamp" />
                    <span className="mpd-sw__name">{b.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mpd-transport">
              {(
                [
                  { id: "tr-stop", icon: "■", cls: "" },
                  { id: "tr-play", icon: "▶", cls: "" },
                  { id: "tr-rec", icon: "●", cls: "rec" },
                  { id: "tr-pause", icon: "❚❚", cls: "" },
                ] as const
              ).map(({ id, icon, cls }) => {
                const b = byId(id);
                if (!b) return null;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`mpd-tr ${cls} ${selectedId === b.id ? "selected" : ""} ${firedId === b.id ? "fired" : ""} ${bound(b) ? "bound" : ""}`}
                    onClick={() => onSelect(b.id)}
                    title={`${b.label} — ${actionHint(b)}`}
                  >
                    <span className="mpd-tr__icon">{icon}</span>
                    <span className="mpd-tr__name">{b.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mpd-chassis__shine" aria-hidden />
        <div className="mpd-chassis__feet" aria-hidden />
      </div>
    </div>
  );
}
