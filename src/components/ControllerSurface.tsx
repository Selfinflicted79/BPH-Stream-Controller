import type { MidiBinding } from "@/lib/types";
import { MpdSurface } from "./MpdSurface";
import { MpkMiniSurface } from "./MpkMiniSurface";

interface Props {
  surfaceId?: string;
  bindings: MidiBinding[];
  selectedId: string | null;
  firedId: string | null;
  litIds?: Set<string> | string[];
  ccValues: Record<string, number>;
  onSelect: (id: string) => void;
  selectedLabel?: string;
  boardLive?: boolean;
  lcdHit?: { title: string; detail: string } | null;
  activeBank?: number;
  onBankSelect?: (bankIndex: number) => void;
}

export function ControllerSurface({ lcdHit, ...rest }: Props) {
  if (rest.surfaceId === "mpk-mini-mk3") {
    return <MpkMiniSurface {...rest} />;
  }
  return <MpdSurface {...rest} lcdHit={lcdHit} />;
}
