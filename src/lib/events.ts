import type { ProgramEntry } from "./station.ts";

export const RADIO_TRACK = "radio:track";
export const RADIO_TIME = "radio:time";
export const RADIO_STATE = "radio:state";
export const RADIO_CUE = "radio:cue";

export interface TrackInfo {
  programId: string;
  programTitle: string;
  venue?: string;
  date?: string;
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
}

export interface CueInfo {
  program: string;
  offset: number;
}
