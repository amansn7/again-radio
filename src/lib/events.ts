import type { ProgramEntry } from "./station.ts";
import type { CatalogueItem } from "./catalogue.ts";

export const RADIO_TRACK = "radio:track";
export const RADIO_TIME = "radio:time";
export const RADIO_STATE = "radio:state";
export const RADIO_CUE = "radio:cue";
export const RADIO_LIVE = "radio:live";
export const RADIO_LIVE_STREAM = "radio:live-stream";
export const RADIO_TOAST = "radio:toast";
/** Open the search sheet, optionally prefilled: detail `{ query?: string }`. */
export const RADIO_SEARCH = "radio:search";
export const RADIO_JOCKEY = "radio:jockey";
export const RADIO_JOCKEY_SPEAK = "radio:jockey:speak";
export const RADIO_JOCKEY_END = "radio:jockey:end";

export interface JockeyStateDetail {
  enabled: boolean;
  /** RoryKind names switched on. */
  kinds: string[];
  speaking: boolean;
  text?: string;
  jockeyName: string;
}

export interface TrackInfo {
  programId: string;
  programPath: string;
  /** The video on screen; its thumbnail is the closest thing to "the video's colours". */
  youtubeId: string;
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
  /** Sub-second playback position, for anything that has to land on the beat. */
  exact: number;
  duration: number;
}

export interface StateInfo {
  playing: boolean;
  muted: boolean;
  live: boolean;
  /** Tracks of the current set play in a shuffled order. */
  shuffle: boolean;
}

/** Either a programme path (`programs/<id>.json`) at an offset, or one catalogue video. */
export type CueInfo =
  | { program: string; offset: number }
  | { video: CatalogueItem; offset: number };

/** The latest track on air, for anything that starts listening after the player spoke. */
export let lastTrack: TrackInfo | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(RADIO_TRACK, (e) => (lastTrack = (e as CustomEvent<TrackInfo>).detail));
}

export function toast(message: string): void {
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent(RADIO_TOAST, { detail: { message } }));
  }
}
