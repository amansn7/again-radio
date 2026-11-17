// Full-library rotation: every slot airs exactly once per cycle, order refreshes each cycle,
// no slot repeats across the seam, and the real data yields every programme and video.
import { readFileSync } from "node:fs";
import { buildSlots, cycleOrder, liveSlot, onAirNow, slotAfter } from "../src/lib/rotation.ts";
import { SetShuffle } from "../src/lib/set-shuffle.ts";
import { LIVE_EPOCH } from "../src/lib/schedule.ts";
import { videoProgram } from "../src/lib/live.ts";

const fail = (m) => { console.error("✗", m); process.exit(1); };
const json = (p) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), "utf8"));

const station = json("station.json");
const programs = station.rotation.map((r) => ({ path: r.program, program: json(r.program) }));
const videos = json("catalogue.json").items.filter((v) => v.kind === "set" || v.kind === "live").map(videoProgram);
const slots = buildSlots(programs, videos);

const ids = new Set([...programs.map((p) => p.program.youtubeId), ...videos.map((v) => v.youtubeId)]);
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
const total = lengths.reduce((a, b) => a + b, 0);
const seen = [];
for (let t = 0; t < total; t += 60) {
  const { index, cycle } = liveSlot(lengths, t, 0);
  if (cycle !== 0) fail("cycle 0 overran");
  if (seen.at(-1) !== index) seen.push(index);
}
if (seen.length !== n || new Set(seen).size !== n) fail(`cycle walk aired ${new Set(seen).size}/${n} slots`);
if (liveSlot(lengths, total + 1, 0).cycle !== 1) fail("second cycle not reached");

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

console.log(`✓ rotation: ${n} slots, ${ids.size} videos, ${(total / 3600).toFixed(1)} h per cycle`);
