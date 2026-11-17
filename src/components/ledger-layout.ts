import type { Artist, Release } from "../lib/artist.ts";

/** Names and labels are packed as if the stage were this many px wide (its minimum). */
export const VW = 1100;
const NAME_PX = 8;
const NAME_PAD = 22;
const LABEL_PX = 9;
const LABEL_PAD = 10;
const NAME_GAP = 6;
const MIN_ROWS = 4;
const MAX_ROWS = 7;
const MAX_DRIFT = 110;
const LABEL_GAP = 14;
const RECORD_TYPES = ["album", "ep", "mixtape", "live"];

export interface Spot { start: number; end: number }

/** First-fit by start edge: uses the fewest rows an interval set allows. */
export function packRows(items: Spot[], gap: number): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a]!.start - items[b]!.start);
  const ends: number[] = [];
  const rows = new Array<number>(items.length).fill(0);
  for (const i of order) {
    const it = items[i]!;
    let r = ends.findIndex((e) => e + gap <= it.start);
    if (r < 0) r = ends.push(0) - 1;
    ends[r] = it.end;
    rows[i] = r;
  }
  return rows;
}

export interface Placed { row: number; drift: number; flip: boolean }

/**
 * Names sit at their date in a few rows. When a row is taken the name slides right
 * (drift, px at VW) into the row that costs least; a new row opens once the cheapest drift
 * passes MAX_DRIFT. Near the right edge a name is anchored at its date and reads leftwards.
 */
export function placeNames(items: { x: number; w: number }[]): Placed[] {
  const ends = new Array<number>(MIN_ROWS).fill(-Infinity);
  const out = new Array<Placed>(items.length);
  const order = items.map((_, i) => i).sort((a, b) => items[a]!.x - items[b]!.x);
  for (const i of order) {
    const { x, w } = items[i]!;
    const starts = ends.map((e) => Math.max(x, e + NAME_GAP));
    let row = starts.indexOf(Math.min(...starts));
    if (starts[row]! - x > MAX_DRIFT && ends.length < MAX_ROWS) { ends.push(-Infinity); row = ends.length - 1; starts.push(x); }
    if (starts[row]! + w <= VW) {
      ends[row] = starts[row]! + w;
      out[i] = { row, drift: starts[row]! - x, flip: false };
      continue;
    }
    row = ends.findIndex((e) => e + NAME_GAP <= x - w);
    if (row < 0) { ends.push(-Infinity); row = ends.length - 1; }
    ends[row] = x;
    out[i] = { row, drift: 0, flip: true };
  }
  return out;
}

export interface RecordItem { rel: Release; x: number; w: number; lane: number; lw: number; flip: boolean; band: boolean }
export interface TickItem { rel: Release; x: number }
export interface NameItem { name: string; pi: number; rel: Release; x: number; row: number; flip: boolean; drift: number }
export interface Layout {
  years: { label: number; x: number }[];
  records: RecordItem[];
  ticks: TickItem[];
  names: NameItem[];
  lanes: number;
  rows: number;
}

const ms = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

export const sentenceDate = (iso: string): string =>
  new Date(ms(iso)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function layoutLedger(a: Artist, now = Date.now()): Layout {
  const all = a.releases.flatMap((r) => [ms(r.date), ...(r.span ? [ms(r.span.from), ms(r.span.to)] : [])]);
  const y0 = new Date(Math.min(...all)).getUTCFullYear();
  const t0 = Date.UTC(y0, 0, 1);
  const t1 = Math.max(now, ...all);
  const pct = (t: number): number => ((t - t0) / (t1 - t0)) * 100;
  const px = (p: number): number => (p / 100) * VW;

  const years = [];
  for (let y = y0; Date.UTC(y, 0, 1) <= t1; y++) years.push({ label: y, x: pct(Date.UTC(y, 0, 1)) });

  const isRecord = (r: Release): boolean => !!r.span || RECORD_TYPES.includes(r.type);
  const recs = a.releases.filter(isRecord).map((rel) => {
    const x = pct(ms(rel.span?.from ?? rel.date));
    const w = rel.span ? Math.max(pct(ms(rel.span.to)) - x, 0.25) : 0;
    const lw = rel.title.length * LABEL_PX + LABEL_PAD;
    const flip = px(x) + lw > VW;
    const right = px(x + w);
    return { rel, x, w, lw, flip, band: !!rel.span, spot: flip ? { start: right - lw, end: right } : { start: px(x), end: Math.max(px(x + w), px(x) + lw) } };
  });
  const lanes = packRows(recs.map((r) => r.spot), LABEL_GAP);
  const records = recs.map(({ spot: _s, ...r }, i) => ({ ...r, lane: lanes[i]! }));

  const byId = new Map(a.releases.map((r) => [r.id, r]));
  const songs = new Map(a.songs.map((s) => [s.id, s]));
  const named = a.people.flatMap((p, pi) => {
    const rels = p.songIds.flatMap((id) => songs.get(id)?.releaseIds ?? []).flatMap((id) => byId.get(id) ?? []);
    const rel = rels.sort((x, y) => ms(x.date) - ms(y.date))[0];
    if (!rel) return [];
    const x = pct(ms(rel.date));
    return [{ name: p.name, pi, rel, x, w: p.name.length * NAME_PX + NAME_PAD }];
  });
  const placed = placeNames(named.map((n) => ({ x: px(n.x), w: n.w })));
  const names = named.map(({ w: _w, ...n }, i) => ({ ...n, ...placed[i]! }));

  return {
    years, records, names,
    ticks: a.releases.filter((r) => !isRecord(r)).map((rel) => ({ rel, x: pct(ms(rel.date)) })),
    lanes: Math.max(1, ...lanes.map((l) => l + 1)),
    rows: Math.max(1, ...placed.map((p) => p.row + 1)),
  };
}
