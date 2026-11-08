# BPH Stream Controller

**Akai MPD226** (MIDI) → **OBS** over WebSocket. Pads, transport, faders/knobs — no keyboard macros, no system key hooks.

## Setup

1. OBS → Settings → WebSocket: enable, set password.
2. Plug in the MPD226 (working USB cable).
3. Run the app and connect OBS.
4. Click a pad slot → **Learn MIDI** → hit that pad → set OBS action → **Save profile**.

## Build

```bash
npm install
npx electron-rebuild -f -w midi
npm run dist:win
```

Portable exe: `release/BPH-Stream-Controller-0.2.0-portable.exe`

## Dev

```bash
npm run dev:electron
```

## Notes

- MixLine is separate (local control API in another project).
- Tartarus keyboard control is not used in 0.2.0.
