import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssignPanel } from "@/components/AssignPanel";
import { ControllerSurface } from "@/components/ControllerSurface";
import { MidiDevicePanel } from "@/components/MidiDevicePanel";
import { ObsSettings } from "@/components/ObsSettings";
import { desktop } from "@/lib/desktop";
import { checkControllerUpdate } from "@/lib/update-check";
import { SURFACE_FALLBACK, type SurfaceInfo } from "@/lib/devices";
import type { MidiBinding, MidiStatus, ObsSceneItem, Profile } from "@/lib/types";

const emptyMidi: MidiStatus = {
  available: false,
  open: false,
  index: -1,
  name: null,
  lastError: null,
  lastMessage: null,
  devices: [],
};

export default function App() {
  const api = desktop();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedId, setSelectedId] = useState<string>("pad-1");
  const [firedId, setFiredId] = useState<string | null>(null);
  const [litIds, setLitIds] = useState<Set<string>>(() => new Set());
  const [learning, setLearning] = useState(false);
  const [scenes, setScenes] = useState<string[]>([]);
  const [mediaInputs, setMediaInputs] = useState<string[]>([]);
  const [audioInputs, setAudioInputs] = useState<string[]>([]);
  const [sceneItems, setSceneItems] = useState<ObsSceneItem[]>([]);
  const [obsConnected, setObsConnected] = useState(false);
  const [obsWaiting, setObsWaiting] = useState(false);
  const [obsError, setObsError] = useState<string | null>(null);
  const [obsBusy, setObsBusy] = useState(false);
  const [midi, setMidi] = useState<MidiStatus>(emptyMidi);
  const [toast, setToast] = useState<string | null>(null);
  const [lcdHit, setLcdHit] = useState<{ title: string; detail: string } | null>(null);
  const lcdTimer = useRef<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [ccValues, setCcValues] = useState<Record<string, number>>({});
  const [surfaces, setSurfaces] = useState<SurfaceInfo[]>(SURFACE_FALLBACK);

  const selected = useMemo(
    () => profile?.midiBindings.find((b) => b.id === selectedId) ?? null,
    [profile, selectedId]
  );

  const surfaceMeta = useMemo(() => {
    const id = profile?.surfaceId || "mpd226";
    return surfaces.find((s) => s.id === id) || SURFACE_FALLBACK[0];
  }, [profile?.surfaceId, surfaces]);

  const showToast = (msg: string, ms = 4200) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), ms);
  };

  const showLcdHit = (title: string, detail: string) => {
    setLcdHit({ title, detail });
    if (lcdTimer.current) window.clearTimeout(lcdTimer.current);
    lcdTimer.current = window.setTimeout(() => setLcdHit(null), 2400);
  };

  const refreshObsLists = useCallback(async () => {
    const [sc, md, inp, items] = await Promise.all([
      api.obsScenes(),
      api.obsMedia(),
      api.obsInputs(),
      api.obsSceneItems ? api.obsSceneItems() : Promise.resolve({ ok: false as const, items: [] }),
    ]);
    if (sc.ok) setScenes(sc.scenes);
    if (md.ok) setMediaInputs(md.inputs);
    if (inp.ok) setAudioInputs(inp.inputs.map((i) => i.name));
    if (items.ok) setSceneItems(items.items);
  }, [api]);

  const refreshMidi = useCallback(async () => {
    const st = await api.midiStatus();
    setMidi(st);
  }, [api]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    (async () => {
      const p = await api.getProfile();
      setProfile(p);
      const seed: Record<string, number> = {};
      for (const b of p.midiBindings) {
        if (typeof b.lastValue === "number") seed[b.id] = b.lastValue;
      }
      setCcValues(seed);
      if (p.midiBindings[0]) setSelectedId(p.midiBindings[0].id);
      const surf = await api.listSurfaces?.();
      if (surf?.surfaces?.length) setSurfaces(surf.surfaces as SurfaceInfo[]);
      const st = await api.obsState();
      setObsConnected(st.connected);
      setObsError(st.lastError);
      if (st.connected) await refreshObsLists();
      await refreshMidi();
    })();

    unsubs.push(api.onMidiStatus((s) => setMidi(s)));
    // Don't refreshMidi on every CC tick — that was thrashing the UI while faders move
    unsubs.push(
      api.onMidiLearnResult((evt) => {
        setLearning(false);
        setProfile(evt.profile);
        setDirty(false);
        showToast(`Learned ${evt.label}`);
      })
    );
    if (api.onCcValue) {
      unsubs.push(
        api.onCcValue((evt) => {
          if (typeof evt.value !== "number") return;
          setCcValues((prev) => {
            const old = prev[evt.id];
            if (old === evt.value) return prev;
            // Soften noisy mid-throw pots on every fader/knob without lagging 0/127
            if (typeof old === "number" && evt.value > 2 && evt.value < 125) {
              const smoothed = Math.round(old * 0.35 + evt.value * 0.65);
              if (smoothed === old) return prev;
              return { ...prev, [evt.id]: smoothed };
            }
            return { ...prev, [evt.id]: evt.value };
          });
        })
      );
    }
    unsubs.push(
      api.onBindingFire((evt) => {
        // Pads/switches/transport — flash + select. CC meters use onCcValue only.
        if (evt.msg?.kind === "cc") return;
        setFiredId(evt.id);
        setSelectedId(evt.id);
        window.setTimeout(() => setFiredId(null), 140);
      })
    );
    if (api.onBindingToggle) {
      unsubs.push(
        api.onBindingToggle((evt) => {
          if (Array.isArray(evt.toggledIds)) {
            setLitIds(new Set(evt.toggledIds));
            return;
          }
          setLitIds((prev) => {
            const next = new Set(prev);
            if (evt.on) next.add(evt.id);
            else next.delete(evt.id);
            return next;
          });
        })
      );
    }
    if (api.onBankChanged) {
      unsubs.push(
        api.onBankChanged((evt) => {
          if (evt.reason === "pad-hit") {
            showToast(`Pad Bank ${evt.bank} (from pad hit)`);
          }
        })
      );
    }
    if (api.onSurface) {
      unsubs.push(
        api.onSurface((evt) => {
          if (evt.auto) {
            const name =
              SURFACE_FALLBACK.find((s) => s.id === evt.surfaceId)?.name ||
              evt.surfaceId;
            showToast(`Detected ${name} — switched controller face`);
          }
        })
      );
    }
    unsubs.push(
      api.onActionResult((evt) => {
        if (!evt.result.ok) {
          showToast(evt.result.error || "Action failed", 5500);
          return;
        }
        if (evt.meta?.actionType && evt.meta.actionType !== "volume") {
          const detail = evt.meta.detail ? ` — ${evt.meta.detail}` : "";
          const target = evt.meta.target ? ` “${evt.meta.target}”` : "";
          showLcdHit(
            evt.meta.label || evt.bindingId || "Pad",
            `${evt.meta.actionType}${target}${detail}`,
          );
        }
      })
    );
    unsubs.push(
      api.onObsState((evt) => {
        const st = evt as {
          connected?: boolean;
          lastError?: string | null;
          reason?: string;
          waitingForObs?: boolean;
          reconnecting?: boolean;
        };
        if (typeof st.connected === "boolean") {
          setObsConnected(st.connected);
          setObsWaiting(!!st.waitingForObs || (!!st.reconnecting && !st.connected));
          setObsError(st.lastError ?? null);
          // Quiet while scanning for OBS — no toast spam / UI freak-out
          if (st.reason === "connected") {
            showToast("OBS linked");
            void refreshObsLists();
          } else if (st.reason === "reconnected") {
            showToast("OBS reconnected");
            void refreshObsLists();
          } else if (st.reason === "closed") {
            showToast("OBS disconnected — waiting to reconnect…", 3500);
          }
          // waiting-for-obs / connect-failed / reconnect-scheduled → status only
          return;
        }
        api.obsState().then((s) => {
          setObsConnected(s.connected);
          setObsWaiting(!!(s as { waitingForObs?: boolean }).waitingForObs);
          setObsError(s.lastError);
        });
      })
    );
    unsubs.push(api.onProfile((p) => setProfile(p)));

    const t = window.setInterval(() => void refreshMidi(), 3000);
    return () => {
      unsubs.forEach((u) => u());
      window.clearInterval(t);
    };
  }, [api, refreshObsLists, refreshMidi]);

  const updateProfile = (next: Profile) => {
    setProfile(next);
    setDirty(true);
  };

  const save = async () => {
    if (!profile) return;
    const withCc = {
      ...profile,
      midiBindings: profile.midiBindings.map((b) =>
        typeof ccValues[b.id] === "number" ? { ...b, lastValue: ccValues[b.id] } : b
      ),
    };
    await api.saveProfile(withCc);
    setProfile(withCc);
    setDirty(false);
    void api.midiSyncPadColors?.();
    showToast("Profile saved");
  };

  const updateBinding = (next: MidiBinding) => {
    if (!profile) return;
    const nextProfile = {
      ...profile,
      midiBindings: profile.midiBindings.map((b) => (b.id === next.id ? next : b)),
    };
    setProfile(nextProfile);
    setDirty(true);
    // Push to Electron immediately so MIDI hits use this action (don't wait for Save)
    void api.updateBinding?.(next);
  };

  const connectObs = async () => {
    if (!profile) return;
    setObsBusy(true);
    const res = await api.obsConnect({
      host: profile.obs.host,
      port: profile.obs.port,
      password: profile.obs.password,
    });
    setObsBusy(false);
    setObsConnected(!!res.ok);
    // Manual connect with OBS down → quiet scan (same as launch)
    if (!res.ok) {
      setObsWaiting(true);
      setObsError("Waiting for OBS… start OBS anytime — we’ll link automatically");
      showToast("OBS not up yet — scanning in background", 3500);
    } else {
      setObsWaiting(false);
      setObsError(null);
      await refreshObsLists();
      showToast("Connected to OBS");
    }
  };

  if (!profile) {
    return (
      <div className="rack-shell relative flex min-h-dvh items-center justify-center text-[var(--muted)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_0%,rgba(77,232,255,0.18),transparent_42%),radial-gradient(ellipse_at_85%_8%,rgba(255,79,216,0.16),transparent_40%)]" />
        <p className="relative tracking-[0.2em] uppercase text-sm">Loading…</p>
      </div>
    );
  }

  const boardLive = midi.open && obsConnected;

  return (
    <div className={`rack-shell relative min-h-dvh overflow-x-hidden ${boardLive ? "is-live" : ""}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_0%,rgba(77,232,255,0.18),transparent_42%),radial-gradient(ellipse_at_85%_8%,rgba(255,79,216,0.16),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22 viewBox=%220 0 120 120%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22120%22 height=%22120%22 filter=%22url(%23n)%22 opacity=%220.55%22/%3E%3C/svg%3E')]" />

      <main className="app-stage relative mx-auto flex w-full max-w-[1680px] flex-col gap-[var(--rack-gap)]">
        <header className="app-header">
          <div className="app-header__brand">
            <div
              className={`logo-screen shrink-0 ${boardLive ? "logo-screen--live logo-screen--on" : "logo-screen--on"}`}
              aria-label="Badly Played Hub display"
            >
              <div className="logo-screen__glass">
                <img
                  src={`${import.meta.env.BASE_URL}bph-logo.png`}
                  alt="Badly Played Hub"
                  className="bph-logo"
                />
              </div>
              <span className="logo-screen__led" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="brand-eyebrow brand-eyebrow--on text-[10px] font-semibold tracking-[0.32em] uppercase">
                Badly Played Hub
              </p>
              <h1 className="brand-wordmark brand-wordmark--on brand-wordmark--hero mt-0.5 leading-none">
                Stream Controller
              </h1>
              <p className="mt-1 text-sm text-[var(--muted)]">MIDI and stream control hub</p>
            </div>
          </div>

          <div className="app-header__actions">
            <button
              type="button"
              className="chip-btn"
              title="Unstick Alt/Ctrl if a hold macro left keys down"
              onClick={async () => {
                await api.releaseKeys?.();
                setLitIds(new Set());
                showToast("Released stuck keys");
              }}
            >
              Release keys
            </button>
            <button type="button" className="chip-btn" onClick={save}>
              {dirty ? "Save*" : "Save"}
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() =>
                void (async () => {
                  try {
                    const result = await checkControllerUpdate("0.5.4");
                    if (!result.available) {
                      showToast(result.tag ? "You're on the latest Stream Controller." : "No release posted yet.");
                      return;
                    }
                    showToast(`Update ${result.tag} is ready.`);
                    if (result.page) window.open(result.page, "_blank", "noopener,noreferrer");
                  } catch {
                    showToast("Could not check for updates.");
                  }
                })()
              }
            >
              Updates
            </button>
            <div
              className={`live-pill ${boardLive ? "on" : "off"}`}
              title={
                boardLive
                  ? "MIDI + OBS connected — board is live"
                  : "Connect MIDI and OBS to light the board"
              }
            >
              <span className={`status-dot ${boardLive ? "on" : "off"}`} />
              {boardLive ? "BOARD LIVE" : "BOARD OFF"}
            </div>
          </div>
        </header>

        <MidiDevicePanel
          status={midi}
          shareMode={profile.midi.shareMode || "bph"}
          shareOutputName={profile.midi.shareOutputName || "BPH MixLine"}
          surfaces={surfaces}
          surfaceId={profile.surfaceId || "mpd226"}
          onSurfaceChange={async (surfaceId) => {
            const res = await api.setSurface?.(surfaceId);
            if (res?.profile) {
              setProfile(res.profile);
              setDirty(false);
              const first = res.profile.midiBindings[0];
              if (first) setSelectedId(first.id);
              const name =
                surfaces.find((s) => s.id === surfaceId)?.name || surfaceId;
              showToast(`Controller face → ${name}`);
            } else if (res && !res.ok) {
              showToast(res.error || "Surface switch failed");
            }
          }}
          onOpen={async (index) => {
            const res = await api.midiOpen(index);
            await refreshMidi();
            if (res.ok) {
              const p = await api.getProfile();
              setProfile(p);
              if (surfaceMeta.hasPadLeds) void api.midiSyncPadColors?.();
              showToast(`Opened ${res.name}`);
            } else {
              showToast(res.error || "Open failed");
            }
          }}
          onRefresh={async () => {
            await api.midiList();
            await refreshMidi();
          }}
          onShareChange={async (opts) => {
            updateProfile({
              ...profile,
              midi: {
                ...profile.midi,
                shareMode: opts.shareMode,
                shareEnabled: opts.shareMode !== "off",
                shareOutputName:
                  opts.shareOutputName || profile.midi.shareOutputName || "BPH MixLine",
              },
            });
            const res = await api.midiShareSet?.(opts);
            if (res?.profile) setProfile(res.profile);
            await refreshMidi();
            if (opts.shareMode === "bph") {
              showToast("BPH Share on — MixLine connects to ws://127.0.0.1:18726 (no loopMIDI)");
            } else if (opts.shareMode === "loopmidi") {
              showToast(
                res?.ok
                  ? `BPH Share + loopMIDI → ${res.status?.thruName || opts.shareOutputName}`
                  : res?.error || "loopMIDI port missing (BPH Share still works)"
              );
            } else {
              showToast("MIDI share off");
            }
          }}
        />

        <section className={`rack-panel surface-rack ${boardLive ? "rack-panel--live" : ""}`}>
          <span className="rack-screws-b" aria-hidden />
          <div className="surface-rack__head">
            <h2 className="surface-rack__name">{surfaceMeta.shortName || "MPD226"}</h2>
            <p className="surface-rack__hint">Colors left · device right</p>
          </div>
          <div className="mpd-workspace">
            <AssignPanel
              binding={selected}
              scenes={scenes}
              mediaInputs={mediaInputs}
              audioInputs={audioInputs}
              sceneItems={sceneItems}
              learning={learning}
              hwOutName={midi.outName}
              showPadLeds={!!surfaceMeta.hasPadLeds}
              onChange={updateBinding}
              onLearn={async () => {
                if (!selected) return;
                setLearning(true);
                await api.midiLearnStart(selected.id);
                showToast(
                  selected.group === "mode" && profile.surfaceId !== "mpk-mini-mk3"
                    ? "FULL/TAP/etc. don’t send MIDI — pick Switch 1–4 under the faders"
                    : "Hit a pad, key, or move a knob…"
                );
              }}
              onCancelLearn={async () => {
                setLearning(false);
                await api.midiLearnCancel();
              }}
              onClearMidi={async () => {
                if (!selected) return;
                const res = await api.midiClear(selected.id);
                if (res.profile) {
                  setProfile(res.profile);
                  setDirty(false);
                }
              }}
              onTest={() => selected && void api.testBinding(selected.id)}
              onPadColor={async (colorIndex) => {
                if (!selected) return;
                const res = await api.midiSetPadColor?.({
                  bindingId: selected.id,
                  colorIndex,
                });
                if (res?.profile) {
                  setProfile(res.profile);
                  setDirty(false);
                }
                if (res?.hardware && !res.hardware.ok) {
                  showToast(
                    res.hardware.error ||
                      "UI color saved — could not reach MPD LED out (need MIDIOUT4/Remote)",
                    5500
                  );
                } else if (res?.ok) {
                  showToast(`Pad LED → ${res.hex}`);
                }
              }}
              onSyncColors={async () => {
                const res = await api.midiSyncPadColors?.();
                showToast(
                  res?.ok
                    ? `Synced ${res.count} pads${res.outName ? ` via ${res.outName}` : ""}`
                    : res?.error || "Sync failed"
                );
              }}
            />
            <ControllerSurface
              surfaceId={profile.surfaceId || "mpd226"}
              bindings={profile.midiBindings}
              selectedId={selectedId}
              firedId={firedId}
              litIds={litIds}
              ccValues={ccValues}
              onSelect={setSelectedId}
              selectedLabel={selected?.label}
              boardLive={boardLive}
              lcdHit={lcdHit}
              activeBank={profile.activeBank ?? 0}
              onBankSelect={async (bankIndex) => {
                const res = await api.setActiveBank?.(bankIndex);
                if (res?.profile) {
                  setProfile(res.profile);
                  setDirty(false);
                  const letter =
                    surfaceMeta.bankLabels[bankIndex] ||
                    ["A", "B", "C", "D"][bankIndex] ||
                    "?";
                  showToast(`Pad Bank ${letter}`);
                } else if (res && !res.ok) {
                  showToast(res.error || "Bank switch failed");
                }
              }}
            />
          </div>
        </section>

        <ObsSettings
          host={profile.obs.host}
          port={profile.obs.port}
          password={profile.obs.password}
          autoConnect={profile.obs.autoConnect}
          connected={obsConnected}
          waiting={obsWaiting}
          lastError={obsError}
          busy={obsBusy}
          onChange={(patch) =>
            updateProfile({ ...profile, obs: { ...profile.obs, ...patch } })
          }
          onConnect={connectObs}
          onDisconnect={async () => {
            setObsBusy(true);
            await api.obsDisconnect();
            setObsBusy(false);
            setObsConnected(false);
            setObsWaiting(false);
          }}
          onRefresh={() => void refreshObsLists()}
        />
      </main>

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md rounded-sm border border-[color:var(--console-edge)] bg-[color:var(--console-face)] px-4 py-3 text-sm shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
          {toast}
        </div>
      )}
    </div>
  );
}
