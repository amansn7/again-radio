import type { ProgramEntry, StationConfig } from "./station.ts";

export interface EntryAt {
  entry: ProgramEntry;
  index: number;
  /** seconds elapsed inside the entry */
  elapsed: number;
  /** 0..1 through the entry */
  progress: number;
}

export function entryIndexAt(entries: ProgramEntry[], seconds: number): number {
  if (!entries.length) return -1;
  let lo = 0;
  let hi = entries.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].offset <= seconds) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function entryAt(entries: ProgramEntry[], seconds: number): EntryAt | null {
  if (!entries.length) return null;
  const index = entryIndexAt(entries, seconds);
  const entry = entries[index];
  const elapsed = Math.min(Math.max(seconds - entry.offset, 0), entry.duration);
  const progress = entry.duration > 0 ? elapsed / entry.duration : 0;
  return { entry, index, elapsed, progress };
}

export function nextProgramIndex(rotation: StationConfig["rotation"], index: number): number {
  if (!rotation.length) return 0;
  return (index + 1) % rotation.length;
}

export function programPath(rotation: StationConfig["rotation"], index: number): string {
  if (!rotation.length) return "";
  const i = Math.min(Math.max(index, 0), rotation.length - 1);
  return rotation[i].program;
}
