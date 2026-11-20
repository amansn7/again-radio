// Full-library rotation: every slot airs exactly once per cycle, order refreshes each cycle,
// no slot repeats across the seam, and the real data yields every programme and video.
import { readFileSync } from "node:fs";
import { buildSlots, cycleOrder, liveSlot, onAirNow, slotAfter } from "../src/lib/rotation.ts";
import { SetShuffle } from "../src/lib/set-shuffle.ts";
import { LIVE_EPOCH } from "../src/lib/schedule.ts";
import { videoProgram } from "../src/lib/live.ts";
import { existsSync } from "node:fs";
import { parseNewMusic, newMusicPrograms } from "../src/lib/new-music.ts";

const fail = (m) => { console.error("✗", m); process.exit(1); };
const json = (p) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), "utf8"));

const station = json("station.json");
const programs = station.rotation.map((r) => ({ path: r.program, program: json(r.program) }));
const videos = json("catalogue.json").items.filter((v) => v.kind === "set" || v.kind === "live").map(videoProgram);
const newPath = new URL("../public/data/new-music.json", import.meta.url);
const fresh = newMusicPrograms(existsSync(newPath) ? parseNewMusic(json("new-music.json")) : [], LIVE_EPOCH);
const slots = buildSlots(programs, videos, fresh.fresh, fresh.graduated);

const ids = new Set([...programs.map((p) => p.program.youtubeId), ...videos.map((v) => v.youtubeId),
  ...fresh.fresh.map((p) => p.youtubeId), ...fresh.graduated.map((p) => p.youtubeId)]);
const aired = new Set(slots.map((s) => s.program.youtubeId));
for (const id of ids) if (!aired.has(id)) fail(`${id} never airs`);
if (slots.some((s) => s.length <= 0 || s.length > 4 * 3600)) fail("a slot is empty or hogs the station");

const n = slots.length;
for (let c = 0; c < 20; c++) {
  const o = cycleOrder(n, c);
  if (new Set(o).size !== n || o.length !== n) fail(`cycle ${c} is not a permutation`);
  if (c > 0 && cycleOrder(n, c - 1)[n - 1] === o[0]) fail(`cycle ${c} repeats across the seam`);
}
if (cycleOrder(n, 1).join() === cycleOrder(n, 2).join()) fail("order does not refresh per cycle");

// Walk one whole cycle minute by minute: every slot shows up, in one contiguous block each.
const lengths = slots.map((s) => s.length);
const blk = slots.flatMap((s, i) => (s.block ? [i] : []));
const total = lengths.reduce((a, b) => a + b, 0);
const seen = [];
for (let t = 0; t < total; t += 60) {
  const { index, cycle } = liveSlot(lengths, t, 0, blk);
  if (cycle !== 0) fail("cycle 0 overran");
  if (seen.at(-1) !== index) seen.push(index);
}
if (seen.length !== n || new Set(seen).size !== n) fail(`cycle walk aired ${new Set(seen).size}/${n} slots`);
if (liveSlot(lengths, total + 1, 0, blk).cycle !== 1) fail("second cycle not reached");

// Unplayable videos are skipped, live and when moving on.
const bad = new Set([slots[0].program.youtubeId]);
for (let t = 0; t < total; t += 600) if (bad.has(slots[onAirNow(slots, bad, LIVE_EPOCH + t).index].program.youtubeId)) fail("aired a bad slot");
const nxt = slotAfter(slots, bad, 1, 0);
if (bad.has(slots[nxt.index].program.youtubeId) || nxt.offset !== slots[nxt.index].start) fail("slotAfter landed badly");

// Set shuffle: every other entry exactly once, current first, back retraces, off restores nothing queued.
const sh = new SetShuffle();
sh.set(true, 10, 4);
const got = [];
for (let n; (n = sh.next()) !== undefined;) got.push(n);
if (got.length !== 9 || new Set(got).size !== 9 || got.includes(4)) fail(`shuffle order ${got}`);
if (sh.back() !== got[7] || sh.next() !== got[8]) fail("shuffle back/next do not retrace");
sh.set(false, 10, 4);
if (sh.on || sh.next() !== undefined) fail("shuffle off still queues");
sh.on = true; sh.reset(3, 0);
if (sh.picking !== 0 || [sh.next(), sh.next()].sort().join() !== "1,2") fail("reset on a new set");

// New on the channel: the block airs back to back, newest first, and changes nothing without it.
function oldCycleOrder(n, cycle) {
  const rngOf = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const shuf = (items, rand) => { const a = items.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const order = shuf([...Array(n).keys()], rngOf(cycle + 1));
  if (n > 1 && cycle > 0) { const prev = shuf([...Array(n).keys()], rngOf(cycle)); if (order[0] === prev[n - 1]) [order[0], order[1]] = [order[1], order[0]]; }
  return order;
}
for (let c = 0; c <= 50; c++) if (cycleOrder(8, c).join() !== oldCycleOrder(8, c).join()) fail(`no block: cycle ${c} order changed`);
const BLOCK = [5, 6, 7];
const inner = new Set();
for (let c = 0; c <= 50; c++) {
  const o = cycleOrder(8, c, BLOCK);
  if (o.length !== 8 || new Set(o).size !== 8) fail(`block: cycle ${c} is not a permutation`);
  const at = o.indexOf(5);
  if (o.slice(at, at + 3).sort().join() !== "5,6,7") fail(`block: cycle ${c} split the block (${o})`);
  inner.add(o.slice(at, at + 3).join());
  if (c > 0) {
    const prev = cycleOrder(8, c - 1, BLOCK);
    const lastUnit = BLOCK.includes(prev[7]) ? 5 : prev[7];
    if (lastUnit === o[0]) fail(`block: cycle ${c} repeats across the seam`);
  }
}
if (inner.size < 2) fail("block: inner order never reshuffles");
if (cycleOrder(3, 4, [2]).length !== 3) fail("block of one");
const mk = (id, block) => ({ path: `video:${id}`, program: { youtubeId: id }, start: 0, length: 100, ...(block ? { block: true } : {}) });
const bslots = [0, 1, 2, 3, 4].map((i) => mk(`v${i}`)).concat([5, 6, 7].map((i) => mk(`v${i}`, true)));
const bbad = new Set(["v6"]);
for (let c = 0; c < 10; c++) {
  const o = cycleOrder(8, c, BLOCK);
  const from = o.indexOf(6) - 1;
  if (from < 0) continue;
  const next = slotAfter(bslots, bbad, o[from], c);
  if (next.index === 6) fail("slotAfter aired a bad block slot");
}

console.log(`✓ rotation: ${n} slots, ${ids.size} videos, ${(total / 3600).toFixed(1)} h per cycle`);
