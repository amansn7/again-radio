import { fetchJson } from "./station.ts";

export interface Release {
  id: string;
  collectionId: number;
  title: string;
  type: string;
  date: string;
  span?: { from: string; to: string };
  trackIds: string[];
}

export interface Song {
  id: string;
  title: string;
  releaseIds: string[];
}

export interface Person {
  name: string;
  songIds: string[];
}

export interface Artist {
  releases: Release[];
  songs: Song[];
  people: Person[];
  shows: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isRec) : []);

function parseRelease(r: Record<string, unknown>): Release | null {
  const { id, title, type, date, collectionId } = r;
  if (typeof id !== "string" || typeof title !== "string" || typeof date !== "string" || !ISO.test(date)) return null;
  const rel: Release = {
    id, title, date,
    collectionId: typeof collectionId === "number" ? collectionId : 0,
    type: typeof type === "string" ? type : "other",
    trackIds: strs(r.trackIds),
  };
  const s = r.span;
  if (isRec(s) && typeof s.from === "string" && typeof s.to === "string" && ISO.test(s.from) && ISO.test(s.to)) {
    rel.span = { from: s.from, to: s.to };
  }
  return rel;
}

export function parseArtist(raw: unknown): Artist {
  const r = isRec(raw) ? raw : {};
  const releases = list(r.releases).map(parseRelease).filter((x): x is Release => x !== null);
  const songs = list(r.songs).flatMap((s) =>
    typeof s.id === "string" && typeof s.title === "string" ? [{ id: s.id, title: s.title, releaseIds: strs(s.releaseIds) }] : []);
  const people = list(r.people).flatMap((p) =>
    typeof p.name === "string" ? [{ name: p.name, songIds: strs(p.songIds) }] : []);
  return { releases, songs, people, shows: Array.isArray(r.shows) ? r.shows.length : 0 };
}

export async function loadArtist(): Promise<Artist> {
  const a = parseArtist(await fetchJson("/data/artist.json"));
  if (!a.releases.length) throw new Error("artist.json has no releases");
  return a;
}
