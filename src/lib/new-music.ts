import { fetchJson, type Program } from "./station.ts";
import { LIVE_EPOCH } from "./schedule.ts";
import type { CatalogueItem } from "./catalogue.ts";

/** One official upload found by scripts/new-music.mjs. */
export interface NewMusicItem {
  youtubeId: string;
  title: string;
  artist: string;
  song: string;
  duration: number;
  published: string;
  addedAt: string;
}

/** The newest songs air together as "New on the channel"; older ones take their own slots. */
export const BLOCK_SIZE = 20;
const WEEK = 7 * 86400;

const str = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const day = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v);

export function parseNewMusic(raw: unknown): NewMusicItem[] {
  const items = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((v): NewMusicItem[] => {
    const r = (v ?? {}) as Record<string, unknown>;
    const ok = str(r.youtubeId) && /^[\w-]{11}$/.test(r.youtubeId) && str(r.title) && str(r.artist) && str(r.song) &&
      typeof r.duration === "number" && r.duration > 0 && day(r.published) && day(r.addedAt);
    return ok ? [r as unknown as NewMusicItem] : [];
  });
}

export async function loadNewMusic(): Promise<NewMusicItem[]> {
  try {
    return parseNewMusic(await fetchJson("/data/new-music.json"));
  } catch {
    return [];
  }
}

const key = (i: NewMusicItem) => i.song.toLowerCase().trim();
const newest = (g: NewMusicItem[]) => g.reduce((a, b) => (`${b.published}${b.addedAt}` > `${a.published}${a.addedAt}` ? b : a));

/** Every upload of a song in one group; groups ordered by their newest upload, newest first. */
export function songGroups(items: NewMusicItem[]): NewMusicItem[][] {
  const groups = new Map<string, NewMusicItem[]>();
  for (const i of items) groups.set(key(i), [...(groups.get(key(i)) ?? []), i]);
  const order = (g: NewMusicItem[]) => `${newest(g).published}${newest(g).addedAt}`;
  return [...groups.values()].sort((a, b) => order(b).localeCompare(order(a)));
}

/** FNV-1a: a stable pseudo-random pick every listener agrees on. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Which upload of a song plays this week. Weekly, not per cycle: versions differ in length, and a
 * cycle's slot lengths must not change while the clock is computed from them.
 */
export function pickVersion(group: NewMusicItem[], week: number): NewMusicItem {
  const sorted = [...group].sort((a, b) => a.youtubeId.localeCompare(b.youtubeId));
  return sorted[hash(`${key(sorted[0])}:${week}`) % sorted.length];
}

function program(i: NewMusicItem, label: string): Program {
  return {
    id: `new-${i.youtubeId}`,
    title: label,
    venue: label,
    date: i.published,
    youtubeId: i.youtubeId,
    duration: i.duration,
    source: "Fred again.. / YouTube",
    entries: [{ offset: 0, duration: i.duration, type: "track", title: i.song, artist: i.artist,
      art: `https://i.ytimg.com/vi/${i.youtubeId}/hqdefault.jpg` }],
  };
}

export function newMusicPrograms(items: NewMusicItem[], nowSec: number): { fresh: Program[]; graduated: Program[] } {
  const week = Math.floor(Math.max(nowSec - LIVE_EPOCH, 0) / WEEK);
  const picked = songGroups(items).map((g) => pickVersion(g, week));
  return {
    fresh: picked.slice(0, BLOCK_SIZE).map((i) => program(i, "New on the channel")),
    graduated: picked.slice(BLOCK_SIZE).map((i) => program(i, "From the channel")),
  };
}

export function newMusicCatalogue(items: NewMusicItem[]): CatalogueItem[] {
  return items.map((i) => ({ youtubeId: i.youtubeId, title: i.title, song: i.song, kind: "song", duration: i.duration,
    published: i.published, channel: "Fred again.." }));
}
