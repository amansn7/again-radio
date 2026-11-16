import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { entryAt, entryIndexAt } from "../src/lib/schedule.ts";

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

console.log("✓ schedule");
