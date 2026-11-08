import type { MidiBinding } from "@/lib/types";
import { formatMidiSig } from "@/lib/desktop";

interface Props {
  bindings: MidiBinding[];
  selectedId: string | null;
  firedId: string | null;
  onSelect: (id: string) => void;
  onAddCc: () => void;
}

export function BindingGrid({
  bindings,
  selectedId,
  firedId,
  onSelect,
  onAddCc,
}: Props) {
  const pads = bindings.filter((b) => b.group === "pad");
  const transport = bindings.filter((b) => b.group === "transport");
  const ccs = bindings.filter((b) => b.group === "cc");

  return (
    <div className="panel p-5 space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div
            className="text-xs tracking-[0.2em] uppercase text-[var(--muted)]"
            style={{ fontFamily: "var(--font-rack)" }}
          >
            Akai MPD226
          </div>
          <h2
            className="text-2xl font-extrabold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Pads & controls
          </h2>
        </div>
        <p className="text-sm text-[var(--muted)] max-w-xs text-right">
          Click a slot → Learn MIDI → set OBS action → Save.
        </p>
      </div>

      <div>
        <h3 className="text-sm text-[var(--muted)] mb-2 uppercase tracking-wider">Pads</h3>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
        >
          {pads.map((b) => (
            <PadButton
              key={b.id}
              binding={b}
              selected={selectedId === b.id}
              fired={firedId === b.id}
              onSelect={() => onSelect(b.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm text-[var(--muted)] mb-2 uppercase tracking-wider">
          Transport
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {transport.map((b) => (
            <PadButton
              key={b.id}
              binding={b}
              selected={selectedId === b.id}
              fired={firedId === b.id}
              onSelect={() => onSelect(b.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm text-[var(--muted)] uppercase tracking-wider">
            Faders / knobs
          </h3>
          <button type="button" className="btn" onClick={onAddCc}>
            Add slot
          </button>
        </div>
        {ccs.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Add a slot, Learn MIDI on a fader/knob, set action to Audio volume.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {ccs.map((b) => (
              <PadButton
                key={b.id}
                binding={b}
                selected={selectedId === b.id}
                fired={firedId === b.id}
                onSelect={() => onSelect(b.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PadButton({
  binding,
  selected,
  fired,
  onSelect,
}: {
  binding: MidiBinding;
  selected: boolean;
  fired: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`keycap min-h-[72px] p-2 text-left ${selected ? "selected" : ""} ${fired ? "pressed" : ""}`}
      style={{ ["--key-color" as string]: binding.color }}
      onClick={onSelect}
    >
      <span
        className="key-glow"
        style={{
          background: `linear-gradient(160deg, ${binding.color}aa, ${binding.color}22)`,
        }}
      />
      <span className="relative z-10 flex h-full flex-col justify-between gap-1">
        <span className="text-sm font-bold text-[#0b100e] line-clamp-2">{binding.label}</span>
        <span
          className="text-[10px] text-black/55"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {formatMidiSig(binding.midi)}
        </span>
        <span
          className="text-[10px] uppercase tracking-wider text-black/55"
          style={{ fontFamily: "var(--font-rack)" }}
        >
          {binding.action.type === "none" ? "no action" : binding.action.type}
        </span>
      </span>
    </button>
  );
}
