// Full-library rotation: every slot airs exactly once per cycle, order refreshes each cycle,
// no slot repeats across the seam, and the real data yields every programme and video.
import { readFileSync } from "node:fs";
import { buildSlots, cycleOrder, liveSlot } from "../src/lib/rotation.ts";
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

console.log(`✓ rotation: ${n} slots, ${ids.size} videos, ${(total / 3600).toFixed(1)} h per cycle`);
