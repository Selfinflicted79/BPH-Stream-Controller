export type ActionType =
  | "none"
  | "scene"
  | "media"
  | "record"
  | "stream"
  | "volume"
  | "macro";

export interface ObsAction {
  type: ActionType;
  target: string;
  mediaAction?: "play" | "restart" | "stop" | "pause";
  recordAction?: "toggle" | "start" | "stop";
  streamAction?: "toggle" | "start" | "stop";
  /** Keyboard chord, e.g. "lalt+1" or "ctrl+shift+s" */
  macroChord?: string;
  /**
   * tap = press sends chord down+up once.
   * hold = keys stay down while switch is on (momentary hold or toggle latch).
   */
  macroStyle?: "tap" | "hold";
}

export interface MidiSig {
  kind: "note" | "cc";
  channel: number;
  note?: number;
  controller?: number;
}

export interface MidiBinding {
  id: string;
  label: string;
  color: string;
  group: "pad" | "transport" | "cc" | "mode" | "switch" | "key";
  midi: MidiSig | null;
  action: ObsAction;
  /**
   * momentary = active while held (light while pressed).
   * toggle = press on / press off (light stays lit while on).
   */
  pressMode?: "momentary" | "toggle";
  /** Last known CC value 0–127 (knobs/faders). */
  lastValue?: number;
  /** MPD226 hardware palette index 0–16. */
  padColorIndex?: number;
}

export interface BankSlot {
  id: "A" | "B" | "C" | "D" | string;
  name: string;
  /** Pad + switch bindings for this bank */
  bindings: MidiBinding[];
}

export interface PadPaletteColor {
  id: number;
  name: string;
  hex: string;
}

export interface Profile {
  version: number;
  /** Drawn controller face: mpd226 | mpk-mini-mk3 */
  surfaceId?: string;
  /** Per-surface binding snapshots so switching devices keeps each setup. */
  surfaceProfiles?: Record<
    string,
    {
      midiBindings: MidiBinding[];
      banks: BankSlot[];
      activeBank: number;
    }
  >;
  obs: {
    host: string;
    port: number;
    password: string;
    autoConnect: boolean;
  };
  midi: {
    preferredDevice: string;
    lastDeviceName: string;
    /** bph = localhost hub (no 3rd party); loopmidi = also virtual port; off = solo */
    shareMode?: "bph" | "loopmidi" | "off";
    shareEnabled?: boolean;
    shareOutputName?: string;
  };
  midiBindings: MidiBinding[];
  /** Active Pad Bank index (A–D on MPD, A–B on Mini). */
  activeBank?: number;
  /** Bank slots — pads (+ switches on MPD) are saved per bank. */
  banks?: BankSlot[];
  lighting?: {
    idleColor: string;
    brightness: number;
    flashOnPress: boolean;
  };
  blockPadKeys?: boolean;
  keyMap?: Record<string, number>;
  buttons?: unknown[];
}

export interface MidiDevice {
  index: number;
  name: string;
}

export interface MidiStatus {
  available: boolean;
  open: boolean;
  index: number;
  name: string | null;
  outOpen?: boolean;
  outIndex?: number;
  outName?: string | null;
  thruEnabled?: boolean;
  thruOpen?: boolean;
  thruIndex?: number;
  thruName?: string | null;
  bphShare?: {
    enabled?: boolean;
    listening?: boolean;
    url?: string;
    clients?: number;
    wsPort?: number;
    udpPort?: number;
    lastError?: string | null;
  };
  lastError: string | null;
  lastMessage: MidiMessage | null;
  devices: MidiDevice[];
  outputs?: MidiDevice[];
}

export interface MidiMessage {
  kind: string;
  channel: number;
  note?: number;
  velocity?: number;
  controller?: number;
  value?: number;
  at?: number;
  label?: string;
}

export interface ActionResult {
  bindingId?: string;
  button?: number | null;
  result: { ok: boolean; error?: string; skipped?: boolean };
  meta?: {
    label?: string;
    target?: string;
    actionType?: string;
    detail?: string | null;
  };
}
