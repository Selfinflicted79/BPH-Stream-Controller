import type { CSSProperties } from "react";
import type { MidiBinding } from "@/lib/types";

interface Props {
  bindings: MidiBinding[];
  selectedId: string | null;
  firedId: string | null;
  litIds?: Set<string> | string[];
  ccValues: Record<string, number>;
  onSelect: (id: string) => void;
  selectedLabel?: string;
  boardLive?: boolean;
  activeBank?: number;
  onBankSelect?: (bankIndex: number) => void;
}

/** Pad order on Mini: bottom row 1–4 L→R, top row 5–8 L→R */
const PAD_ROWS = [
  [5, 6, 7, 8],
  [1, 2, 3, 4],
];

const WHITE_PATTERN = [true, false, true, false, true, true, false, true, false, true, false, true];

export function MpkMiniSurface({
  bindings,
  selectedId,
  firedId,
  litIds,
  ccValues,
  onSelect,
  selectedLabel,
  boardLive = false,
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
      return `macro: ${b.action.macroChord || "?"}`;
    }
    if (b.action.target) return `${b.action.type}: ${b.action.target}`;
    return b.action.type;
  };

  const bankLetter = activeBank === 1 ? "B" : "A";

  return (
    <div className={`mpk-stage ${boardLive ? "mpk-stage--live" : ""}`}>
      <div className="mpk-stage__hint">
        <span>MPK Mini MK3 · click a pad, knob, or key to assign · Bank {bankLetter}</span>
        {selectedLabel && (
          <span className="mpk-stage__hint-sel">
            Selected · <strong>{selectedLabel}</strong>
          </span>
        )}
      </div>

      <div
        className={`mpk-chassis ${boardLive ? "mpk-chassis--live" : ""}`}
        role="group"
        aria-label="MPK Mini MK3 controller"
      >
        <div className="mpk-top">
          <div className="mpk-brand-block">
            <span className="mpk-brand">AKAI</span>
            <span className="mpk-model">MPK mini</span>
            <span className="mpk-mk">MK3</span>
          </div>

          <div className="mpk-oled">
            <div className="mpk-oled__glow" />
            <div className="mpk-oled__text">
              <span>BPH Stream</span>
              <span className="mpk-oled__line2">
                {selectedLabel ? `Edit: ${selectedLabel}` : `Bank ${bankLetter} · OBS`}
              </span>
            </div>
          </div>

          <div className="mpk-soft">
            {(
              [
                { id: "mpk-prog", short: "PROG" },
                { id: "mpk-cc", short: "CC" },
                { id: "mpk-arp", short: "ARP" },
                { id: "mpk-sustain", short: "SUS" },
              ] as const
            ).map(({ id, short }) => {
              const b = byId(id);
              if (!b) return null;
              return (
                <button
                  key={id}
                  type="button"
                  className={`mpk-soft-btn ${selectedId === b.id ? "selected" : ""} ${firedId === b.id ? "fired" : ""} ${bound(b) ? "bound" : ""}`}
                  onClick={() => onSelect(b.id)}
                  title={`${b.label} — ${actionHint(b)}`}
                >
                  {short}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mpk-mid">
          <div className="mpk-modes-row">
            <div className="mpk-bank-pair" role="group" aria-label="Pad banks A B">
              {(["A", "B"] as const).map((letter, i) => (
                <button
                  key={letter}
                  type="button"
                  className={`mpk-bank-light ${activeBank === i ? "lit" : ""} ${i === 0 ? "red" : "green"}`}
                  onClick={() => onBankSelect?.(i)}
                  title={`Pad Bank ${letter}`}
                >
                  {letter}
                </button>
              ))}
            </div>
            {(
              [
                { id: "mpk-full", short: "FULL" },
                { id: "mpk-repeat", short: "REPEAT" },
                { id: "mpk-oct-down", short: "OCT−" },
                { id: "mpk-oct-up", short: "OCT+" },
              ] as const
            ).map(({ id, short }) => {
              const b = byId(id);
              if (!b) return null;
              return (
                <button
                  key={id}
                  type="button"
                  className={`mpk-mode-btn ${selectedId === b.id ? "selected" : ""} ${firedId === b.id ? "fired" : ""} ${bound(b) ? "bound" : ""}`}
                  onClick={() => onSelect(b.id)}
                  title={`${b.label} — ${actionHint(b)}`}
                >
                  {short}
                </button>
              );
            })}
          </div>

          <div className="mpk-knobs">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
              const b = byId(`knob-${n}`);
              if (!b) return null;
              const val = ccValues[b.id] ?? b.lastValue ?? 64;
              const deg = (val / 127) * 270 - 135;
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`mpk-knob-wrap ${selectedId === b.id ? "selected" : ""} ${bound(b) ? "bound" : ""}`}
                  onClick={() => onSelect(b.id)}
                  title={`${b.label} — ${val}/127 — ${actionHint(b)}`}
                >
                  <div className="mpk-knob">
                    <span
                      className="mpk-knob__mark"
                      style={{ transform: `rotate(${deg}deg)` }}
                    />
                    <span className="mpk-knob__hub" />
                  </div>
                  <span className="mpk-knob__label">{b.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mpk-pads">
            {PAD_ROWS.map((row) =>
              row.map((n) => {
                const b = byId(`pad-${n}`);
                if (!b) return null;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`mpk-pad ${selectedId === b.id ? "selected" : ""} ${firedId === b.id ? "fired" : ""} ${bound(b) ? "bound" : ""}`}
                    style={{ "--pad-color": b.color } as CSSProperties}
                    onClick={() => onSelect(b.id)}
                    title={`${b.label} (Bank ${bankLetter}) — ${actionHint(b)}`}
                  >
                    <span className="mpk-pad__face" />
                    <span className="mpk-pad__num">{n}</span>
                    {bound(b) && <span className="mpk-pad__dot" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="mpk-bottom">
          <div className="mpk-stick" aria-hidden title="Joystick (decorative)">
            <span className="mpk-stick__knob" />
          </div>

          <div className="mpk-keys" role="group" aria-label="25-key keyboard">
            {Array.from({ length: 25 }, (_, i) => {
              const b = byId(`key-${i + 1}`);
              if (!b) return null;
              const isBlack = !WHITE_PATTERN[i % 12];
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`mpk-key ${isBlack ? "black" : "white"} ${selectedId === b.id ? "selected" : ""} ${isLit(b.id) ? "fired" : ""} ${bound(b) ? "bound" : ""}`}
                  onClick={() => onSelect(b.id)}
                  title={`${b.label} — ${actionHint(b)}`}
                  style={{ zIndex: isBlack ? 2 : 1 }}
                >
                  {!isBlack && <span className="mpk-key__label">{b.label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
