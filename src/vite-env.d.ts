/// <reference types="vite/client" />

import type {
  Profile,
  MidiStatus,
  MidiMessage,
  ActionResult,
  MidiDevice,
} from "./lib/types";

export interface BphDesktopApi {
  isElectron: boolean;
  getProfile: () => Promise<Profile>;
  saveProfile: (
    profile: Profile
  ) => Promise<{ ok: boolean; profile?: Profile }>;
  updateBinding?: (
    binding: Profile["midiBindings"][0]
  ) => Promise<{ ok: boolean; profile?: Profile; error?: string }>;
  obsConnect: (opts: {
    host: string;
    port: number;
    password: string;
  }) => Promise<{ ok: boolean; error?: string; url?: string }>;
  obsDisconnect: () => Promise<{ connected: boolean }>;
  obsState: () => Promise<{
    connected: boolean;
    lastError: string | null;
    waitingForObs?: boolean;
    reconnecting?: boolean;
  }>;
  obsScenes: () => Promise<{
    ok: boolean;
    scenes: string[];
    currentProgramSceneName?: string;
    error?: string;
  }>;
  obsMedia: () => Promise<{ ok: boolean; inputs: string[]; error?: string }>;
  obsInputs: () => Promise<{
    ok: boolean;
    inputs: { name: string; kind: string }[];
    error?: string;
  }>;
  midiStatus: () => Promise<MidiStatus>;
  midiList: () => Promise<{ ok: boolean; devices: MidiDevice[]; error?: string }>;
  midiOpen: (
    index?: number
  ) => Promise<{ ok: boolean; error?: string; name?: string; index?: number }>;
  midiClose: () => Promise<MidiStatus>;
  midiShareSet?: (opts: {
    shareMode?: "bph" | "loopmidi" | "off";
    enabled?: boolean;
    shareOutputName?: string;
    index?: number;
  }) => Promise<{
    ok: boolean;
    error?: string | null;
    profile?: Profile;
    status?: MidiStatus;
  }>;
  midiLearnStart: (id: string) => Promise<{ ok: boolean; id: string }>;
  midiLearnCancel: () => Promise<{ ok: boolean }>;
  midiClear: (id: string) => Promise<{ ok: boolean; profile?: Profile }>;
  midiAddCc: () => Promise<{
    ok: boolean;
    binding?: Profile["midiBindings"][0];
    profile?: Profile;
  }>;
  midiRemove: (
    id: string
  ) => Promise<{ ok: boolean; error?: string; profile?: Profile }>;
  testBinding: (id: string) => Promise<{ ok: boolean; error?: string }>;
  midiSetPadColor?: (payload: {
    bindingId: string;
    colorIndex?: number;
    hex?: string;
  }) => Promise<{
    ok: boolean;
    colorIndex?: number;
    hex?: string;
    hardware?: { ok: boolean; error?: string };
    profile?: Profile;
    error?: string;
  }>;
  midiSyncPadColors?: () => Promise<{
    ok: boolean;
    count?: number;
    outName?: string | null;
    error?: string;
  }>;
  padPalette?: () => Promise<
    { id: number; name: string; hex: string }[]
  >;
  setActiveBank?: (bankIndex: number) => Promise<{
    ok: boolean;
    profile?: Profile;
    bank?: string;
    bankIndex?: number;
    error?: string;
  }>;
  listSurfaces?: () => Promise<{
    ok: boolean;
    surfaces: {
      id: string;
      name: string;
      shortName: string;
      bankCount: number;
      bankLabels: string[];
      hasPadLeds: boolean;
    }[];
    surfaceId: string;
  }>;
  setSurface?: (surfaceId: string) => Promise<{
    ok: boolean;
    profile?: Profile;
    surfaceId?: string;
    error?: string;
  }>;
  toggleState?: () => Promise<{ toggledIds: string[] }>;
  releaseKeys?: () => Promise<{ ok: boolean }>;
  onBindingToggle?: (
    handler: (evt: {
      id: string;
      on: boolean;
      toggledIds?: string[];
    }) => void
  ) => () => void;
  onBankChanged?: (
    handler: (evt: {
      bankIndex: number;
      bank: string;
      reason?: string;
    }) => void
  ) => () => void;
  onSurface?: (
    handler: (evt: {
      surfaceId: string;
      detected?: string | null;
      auto?: boolean;
      from?: string;
    }) => void
  ) => () => void;
  onMidiMessage: (handler: (evt: MidiMessage) => void) => () => void;
  onMidiStatus: (handler: (evt: MidiStatus) => void) => () => void;
  onMidiLearnResult: (
    handler: (evt: {
      id: string;
      midi: Profile["midiBindings"][0]["midi"];
      label: string;
      profile: Profile;
    }) => void
  ) => () => void;
  onBindingFire: (handler: (evt: { id: string; msg: MidiMessage }) => void) => () => void;
  onCcValue?: (handler: (evt: { id: string; value: number }) => void) => () => void;
  onActionResult: (handler: (evt: ActionResult) => void) => () => void;
  onObsState: (handler: (evt: unknown) => void) => () => void;
  onProfile: (handler: (evt: Profile) => void) => () => void;
}

declare global {
  interface Window {
    bphDesktop?: BphDesktopApi;
  }
}

export {};
