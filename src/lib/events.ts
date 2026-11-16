import type { ProgramEntry } from "./station.ts";
import type { CatalogueItem } from "./catalogue.ts";

export const RADIO_TRACK = "radio:track";
export const RADIO_TIME = "radio:time";
export const RADIO_STATE = "radio:state";
export const RADIO_CUE = "radio:cue";
export const RADIO_LIVE = "radio:live";
/** Open the search sheet, optionally prefilled: detail `{ query?: string }`. */
export const RADIO_SEARCH = "radio:search";

export interface TrackInfo {
  programId: string;
  programPath: string;
  programTitle: string;
  programDuration: number;
  venue?: string;
  date?: string;
  entries: ProgramEntry[];
  entry: ProgramEntry;
  index: number;
  elapsed: number;
  progress: number;
}

export interface TimeInfo {
  current: number;
  duration: number;
}

export interface StateInfo {
  playing: boolean;
  muted: boolean;
  live: boolean;
  tunedIn: boolean;
}

/** Either a programme path (`programs/<id>.json`) at an offset, or one catalogue video. */
export type CueInfo =
  | { program: string; offset: number }
  | { video: CatalogueItem; offset: number };
