import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { entryAt, entryIndexAt, livePosition } from "../src/lib/schedule.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const program = JSON.parse(
  readFileSync(`${root}/public/data/programs/boiler-room-london.json`, "utf8"),
);
const entries = program.entries;

const cases = [
  [0, "Nathan (still breathing)"],
  [141, "Nathan (still breathing)"],
  [142, "Kammy (like i do)"],
  [578, "Tanya (maybe life)"],
  [4023, "Clara (the night is dark)"],
  [4300, "Clara (the night is dark)"],
];

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

for (const [t, want] of cases) {
  const got = entryAt(entries, t);
  if (!got || got.entry.title !== want) {
    fail(`${t}s → "${got?.entry.title}" want "${want}"`);
  }
}

if (entryIndexAt(entries, -5) !== 0) fail("negative time should clamp to first entry");
if (entryAt([], 10) !== null) fail("empty program should return null");

const mid = entryAt(entries, 578 + 100);
const want = 100 / 231;
if (Math.abs(mid.progress - want) > 1e-9) fail(`progress ${mid.progress} want ${want}`);

const D = [100, 50, 200];
const lp = (now) => JSON.stringify(livePosition(D, now, 0));
const wantLp = (now, index, offset) => {
  if (lp(now) !== JSON.stringify({ index, offset })) fail(`livePosition(${now}) = ${lp(now)} want ${index}/${offset}`);
};
wantLp(0, 0, 0);
wantLp(99, 0, 99);
wantLp(100, 1, 0);
wantLp(149, 1, 49);
wantLp(150, 2, 0);
wantLp(349, 2, 199);
wantLp(350, 0, 0);
wantLp(350 * 3 + 120, 1, 20);
wantLp(-1, 2, 199);
wantLp(-350, 0, 0);
wantLp(-351, 2, 199);
if (livePosition([], 10, 0).index !== 0) fail("empty durations should return index 0");
if (JSON.stringify(livePosition(D, 450, 100)) !== lp(350)) fail("epoch offset should shift position");

console.log("✓ schedule");
