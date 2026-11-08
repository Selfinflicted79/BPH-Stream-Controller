export type SurfaceId = "mpd226" | "mpk-mini-mk3";

export interface SurfaceInfo {
  id: SurfaceId | string;
  name: string;
  shortName: string;
  bankCount: number;
  bankLabels: string[];
  hasPadLeds: boolean;
}

export const SURFACE_FALLBACK: SurfaceInfo[] = [
  {
    id: "mpd226",
    name: "Akai MPD226",
    shortName: "MPD226",
    bankCount: 4,
    bankLabels: ["A", "B", "C", "D"],
    hasPadLeds: true,
  },
  {
    id: "mpk-mini-mk3",
    name: "Akai MPK Mini MK3",
    shortName: "MPK Mini",
    bankCount: 2,
    bankLabels: ["A", "B"],
    hasPadLeds: false,
  },
];

export function detectSurfaceIdFromName(deviceName: string | null | undefined): SurfaceId | null {
  const name = String(deviceName || "");
  if (/mpk\s*mini|mpkmini/i.test(name)) return "mpk-mini-mk3";
  if (/mpd226|mpd\s*226/i.test(name)) return "mpd226";
  return null;
}
