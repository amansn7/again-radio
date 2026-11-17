import { loadProgram, loadStation, type Program } from "./station.ts";
import { loadCatalogue } from "./catalogue.ts";
import { videoProgram } from "./live.ts";
import { LIVE_EPOCH } from "./schedule.ts";

/** One turn on air: a stretch of one video, from `start` for `length` seconds. */
export interface Slot {
  path: string;
  program: Program;
  start: number;
  length: number;
}

// A 108-hour tour film would otherwise own the station for four days: air it show by show.
const LONG = 3 * 3600;
const CHAPTER_CAP = 3600;

export function buildSlots(programs: { path: string; program: Program }[], videos: Program[]): Slot[] {
  const slots: Slot[] = [];
  const seen = new Set<string>();
  for (const { path, program } of programs) {
    if (seen.has(program.youtubeId)) continue;
    seen.add(program.youtubeId);
    if (program.duration <= LONG) {
      slots.push({ path, program, start: 0, length: program.duration });
      continue;
    }
    for (const e of program.entries) {
      if (e.type === "track") slots.push({ path, program, start: e.offset, length: Math.min(e.duration, CHAPTER_CAP) });
    }
  }
  for (const program of videos) {
    if (seen.has(program.youtubeId) || program.duration <= 0) continue;
    seen.add(program.youtubeId);
    slots.push({ path: `video:${program.youtubeId}`, program, start: 0, length: program.duration });
  }
  return slots;
}

let pending: Promise<Slot[]> | null = null;

/** Every programme in station.json plus every catalogue set and live cut, once each. */
export function loadSlots(): Promise<Slot[]> {
  pending ??= (async () => {
    const [station, catalogue] = await Promise.all([loadStation(), loadCatalogue()]);
    const programs = await Promise.all(
      station.rotation.map(async (r) => ({ path: r.program, program: await loadProgram(r.program) })),
    );
    const videos = catalogue.filter((v) => v.kind === "set" || v.kind === "live").map(videoProgram);
    return buildSlots(programs, videos);
  })();
  return pending;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: T[], rand: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Slot order for one full cycle. Seeded by the cycle number so every listener hears the same
 * thing, fresh each cycle, and never the same slot twice across the seam between cycles.
 */
export function cycleOrder(n: number, cycle: number): number[] {
  const order = shuffled([...Array(n).keys()], rng(cycle + 1));
  if (n > 1 && cycle > 0) {
    const prev = shuffled([...Array(n).keys()], rng(cycle));
    if (order[0] === prev[n - 1]) [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
}

/** Where the shared broadcast is now: slot index, seconds into the slot, cycle number. */
export function liveSlot(
  lengths: number[],
  nowSec: number,
  epochSec: number = LIVE_EPOCH,
): { index: number; offset: number; cycle: number } {
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total <= 0) return { index: 0, offset: 0, cycle: 0 };
  const since = Math.max(nowSec - epochSec, 0);
  const cycle = Math.floor(since / total);
  let t = since - cycle * total;
  for (const index of cycleOrder(lengths.length, cycle)) {
    if (t < lengths[index]) return { index, offset: t, cycle };
    t -= lengths[index];
  }
  return { index: cycleOrder(lengths.length, cycle)[0], offset: 0, cycle };
}

export interface OnAir {
  index: number;
  cycle: number;
  /** Seconds into the video. */
  offset: number;
}

const playable = (slots: Slot[], bad: Set<string>, i: number) => !bad.has(slots[i].program.youtubeId);

/** The next playable slot in broadcast order, from its start. */
export function slotAfter(slots: Slot[], bad: Set<string>, index: number, cycle: number): OnAir {
  for (let k = 0; k < slots.length * 2; k++) {
    const order = cycleOrder(slots.length, cycle);
    const i = order.indexOf(index);
    if (i === order.length - 1) {
      cycle++;
      index = cycleOrder(slots.length, cycle)[0];
    } else index = order[i + 1];
    if (playable(slots, bad, index)) break;
  }
  return { index, cycle, offset: slots[index].start };
}

/** The shared broadcast right now, skipping anything that would not play here. */
export function onAirNow(slots: Slot[], bad: Set<string>, nowSec: number): OnAir {
  const at = liveSlot(slots.map((s) => s.length), nowSec);
  if (!playable(slots, bad, at.index)) return slotAfter(slots, bad, at.index, at.cycle);
  return { index: at.index, cycle: at.cycle, offset: slots[at.index].start + Math.floor(at.offset) };
}
