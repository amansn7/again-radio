import type { CatalogueItem } from "./catalogue.ts";
import type { Program, ProgramEntry } from "./station.ts";
import { personFromTitle } from "./memories.ts";
import { dayLabel, upcoming, type Show } from "./shows.ts";

export type Group = "Songs" | "In sets" | "Shows" | "Releases" | "On tour";
export const GROUPS: Group[] = ["Songs", "In sets", "Shows", "Releases", "On tour"];

export type Action =
  | { type: "video"; video: CatalogueItem; offset: number }
  | { type: "program"; program: string; offset: number }
  | { type: "query"; query: string }
  | { type: "scroll"; target: string }
  | { type: "link"; url: string };

export interface Art { entry?: ProgramEntry; yt?: string }

export interface Doc {
  art?: Art;
  group: Group;
  title: string;
  context: string;
  right: string;
  action: Action;
  titleTokens: string[];
  tokens: string[];
}

export interface Album { year: number; title: string; subtitle?: string; kind?: string }
/** A released track (public/data/songs.json, from MusicBrainz). */
export interface Song { title: string; release: string; year: number; with?: string[] }
export interface Sources {
  catalogue: CatalogueItem[];
  programs: { path: string; program: Program }[];
  shows: { path: string; program: Program } | null;
  albums: Album[];
  tour: Show[];
  songs: Song[];
}

export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const toks = (s: string): string[] => (norm(s) ? norm(s).split(" ") : []);

export function fmtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const year = (iso?: string): string => (iso && /^\d{4}/.test(iso) ? iso.slice(0, 4) : "");

function doc(group: Group, title: string, context: string, right: string, action: Action, extra: string[]): Doc {
  const titleTokens = toks(title);
  return { group, title, context, right, action, titleTokens, tokens: [...titleTokens, ...extra.flatMap(toks)] };
}

export function buildIndex(src: Sources): Doc[] {
  const docs: Doc[] = [];
  for (const c of src.catalogue) {
    const isSet = c.kind === "set";
    const d = doc(isSet ? "Shows" : "Songs", c.title, c.album ?? c.channel, year(c.published),
      { type: "video", video: c, offset: 0 },
      [c.song ?? "", c.album ?? "", c.channel, personFromTitle(c.title) ?? "", year(c.published)]);
    d.art = { yt: c.youtubeId };
    docs.push(d);
  }
  for (const { path, program: p } of src.programs) {
    for (const e of p.entries) {
      if (e.type !== "track" || !e.title) continue;
      const d = doc("In sets", e.title, `in ${p.title}`, fmtTime(e.offset),
        { type: "program", program: path, offset: e.offset },
        [personFromTitle(e.title) ?? "", e.album ?? "", e.artist ?? "", e.memory ?? "", p.title, p.venue ?? "", year(p.date)]);
      d.art = { entry: e, yt: p.youtubeId };
      docs.push(d);
    }
  }
  if (src.shows) {
    const { path, program: p } = src.shows;
    for (const e of p.entries) {
      if (!e.title) continue;
      const d = doc("Shows", e.title, e.memory ?? p.title, fmtTime(e.offset),
        { type: "program", program: path, offset: e.offset }, [e.memory ?? "", e.album ?? "", p.title]);
      d.art = { yt: p.youtubeId };
      docs.push(d);
    }
  }
  // A song the radio can play (catalogue or a set) is found there; only the rest link out to YouTube.
  const onAir = new Set([
    ...src.catalogue.map((c) => norm(c.song ?? c.title)),
    ...src.programs.flatMap(({ program: p }) => p.entries.map((e) => norm(e.title ?? ""))),
  ]);
  for (const s of src.songs) {
    if (onAir.has(norm(s.title))) continue;
    const by = s.with?.length ? ` · with ${s.with.join(", ")}` : "";
    const d = doc("Songs", s.title, `${s.release}${by}`, String(s.year),
      { type: "link", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`Fred again.. ${s.title}`)}` },
      [personFromTitle(s.title) ?? "", s.release, ...(s.with ?? []), String(s.year)]);
    d.art = { entry: { offset: 0, duration: 0, type: "track", title: s.title, album: s.release } };
    docs.push(d);
  }
  for (const a of src.albums) {
    const tracks = src.songs.filter((s) => norm(s.release) === norm(a.title)).map((s) => s.title);
    const d = doc("Releases", a.title, a.subtitle ?? a.kind ?? "", String(a.year),
      { type: "query", query: a.title }, [a.subtitle ?? "", a.kind ?? "", String(a.year), ...tracks]);
    d.art = { entry: { offset: 0, duration: 0, type: "track", album: a.title } };
    docs.push(d);
  }
  for (const t of upcoming(src.tour, Date.now())) {
    docs.push(doc("On tour", t.city, t.venue, dayLabel(t),
      { type: "scroll", target: "#tour" }, [t.venue, t.start.slice(0, 10), "tour", t.country]));
  }
  return docs;
}

function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length || i === b.length) return true;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

function tokenScore(q: string, t: string): number {
  if (q === t) return 4;
  if (t.startsWith(q)) return 3;
  if (t.includes(q)) return 2;
  return q.length >= 4 && t.length >= 4 && oneEdit(q, t) ? 1 : 0;
}

function best(q: string, tokens: string[]): number {
  let b = 0;
  for (const t of tokens) b = Math.max(b, tokenScore(q, t));
  return b;
}

/** Every query token must match somewhere; title matches count double. */
function score(qs: string[], d: Doc): number {
  let total = 0;
  for (const q of qs) {
    const s = best(q, d.tokens);
    if (!s) return 0;
    total += s + best(q, d.titleTokens);
  }
  return total;
}

export function search(index: Doc[], query: string, cap = 8): Doc[] {
  const qs = toks(query);
  if (!qs.length) return [];
  const scored: { d: Doc; s: number }[] = [];
  for (const d of index) {
    const s = score(qs, d);
    if (s) scored.push({ d, s });
  }
  const rank = (d: Doc) => GROUPS.indexOf(d.group);
  scored.sort((a, b) => rank(a.d) - rank(b.d) || b.s - a.s);
  const seen: Record<string, number> = {};
  return scored.filter(({ d }) => (seen[d.group] = (seen[d.group] ?? 0) + 1) <= cap).map((x) => x.d);
}
