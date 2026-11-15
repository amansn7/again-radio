#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DATA = "public/data";
const TYPES = new Set(["track", "interlude", "id"]);
const errors = [];
const warn = [];

const fail = (msg) => errors.push(msg);

function validateProgram(p, file) {
  for (const k of ["id", "title", "youtubeId", "duration", "entries"]) {
    if (p[k] === undefined) fail(`${file}: missing "${k}"`);
  }
  if (p.youtubeId && !/^[A-Za-z0-9_-]{11}$/.test(p.youtubeId)) {
    fail(`${file}: youtubeId "${p.youtubeId}" is not 11 chars`);
  }
  const entries = p.entries ?? [];
  if (!entries.length) fail(`${file}: no entries`);
  let prevEnd = -1;
  entries.forEach((e, i) => {
    const at = `${file} entry ${i} (${e.title ?? "?"})`;
    if (!Number.isInteger(e.offset) || e.offset < 0) fail(`${at}: bad offset`);
    if (!Number.isInteger(e.duration) || e.duration <= 0) fail(`${at}: bad duration`);
    if (!TYPES.has(e.type)) fail(`${at}: type "${e.type}" not in ${[...TYPES]}`);
    if (e.offset < prevEnd) fail(`${at}: overlaps previous entry (${e.offset} < ${prevEnd})`);
    if (p.duration && e.offset + e.duration > p.duration + 2) {
      fail(`${at}: runs past program duration`);
    }
    if (e.type !== "id" && !String(e.title ?? "").trim()) fail(`${at}: empty title`);
    if (!e.album && !e.memory && e.type === "track") warn.push(`${at}: no album and no memory`);
    prevEnd = e.offset + e.duration;
  });
}

function validateStation(s) {
  if (!Array.isArray(s.rotation) || !s.rotation.length) warn.push("station.json: empty rotation");
  const hours = new Set();
  for (const b of s.hourBlocks ?? []) {
    const span = ((b.to - b.from + 24) % 24) || 24;
    for (let i = 0; i < span; i++) hours.add((b.from + i) % 24);
  }
  if (hours.size !== 24) fail(`station.json: hourBlocks cover ${hours.size}/24 hours`);
}

function main() {
  if (!existsSync(DATA)) {
    console.log("· no public/data yet — nothing to verify (phase 1)");
    return;
  }
  const stationPath = join(DATA, "station.json");
  if (existsSync(stationPath)) {
    const s = JSON.parse(readFileSync(stationPath, "utf8"));
    validateStation(s);
    for (const r of s.rotation ?? []) {
      const f = join(DATA, r.program);
      if (!existsSync(f)) { fail(`rotation points at missing ${r.program}`); continue; }
      validateProgram(JSON.parse(readFileSync(f, "utf8")), r.program);
    }
  } else {
    warn.push("no station.json");
  }
  const pdir = join(DATA, "programs");
  if (existsSync(pdir)) {
    for (const f of readdirSync(pdir).filter((n) => n.endsWith(".json"))) {
      validateProgram(JSON.parse(readFileSync(join(pdir, f), "utf8")), `programs/${f}`);
    }
  }
  for (const w of warn) console.log(`· ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    process.exit(1);
  }
  console.log("✓ data verified");
}

function assert(cond, msg) {
  if (cond) return;
  console.error(`selftest: ${msg}`);
  process.exit(1);
}

async function selftest() {
  const good = { id: "x", title: "t", youtubeId: "GiXKukOtmeE", duration: 100, entries: [
    { offset: 0, duration: 40, type: "track", title: "a", album: "b" },
    { offset: 40, duration: 30, type: "interlude", title: "id" },
    { offset: 70, duration: 30, type: "id", title: "ID" },
  ]};
  const bad = { ...good, entries: [
    { offset: 0, duration: 40, type: "track", title: "a", album: "b" },
    { offset: 10, duration: 30, type: "track", title: "b", album: "c" },
    { offset: 90, duration: 30, type: "nope", title: "" },
  ]};
  errors.length = 0; validateProgram(good, "good");
  if (errors.length) { console.error("selftest: good program rejected"); process.exit(1); }
  errors.length = 0; validateProgram(bad, "bad");
  if (errors.length < 2) { console.error("selftest: bad program not caught"); process.exit(1); }
  errors.length = 0;
  validateStation({ hourBlocks: [{ from: 0, to: 24 }] });
  if (errors.length) { console.error("selftest: full-day blocks rejected"); process.exit(1); }
  errors.length = 0;

  const { blockForHour, seededAutoTheme, themeForHour } = await import("../src/lib/theme.ts");
  const blocks = [
    { from: 4, to: 10, theme: "diary", label: "dawn" },
    { from: 10, to: 16, theme: "sleek", label: "day" },
    { from: 16, to: 22, theme: "diary", label: "dusk" },
    { from: 22, to: 4, theme: "sleek", label: "night" },
  ];
  for (const h of [22, 23, 0, 1, 2, 3]) {
    assert(blockForHour(blocks, h).label === "night", `night block should cover hour ${h}`);
  }
  assert(blockForHour(blocks, 4).label === "dawn", "night block must not cover hour 4");
  assert(blockForHour([], 3).label === "day", "empty blocks should fall back to a default block");
  assert(themeForHour(blocks, 5) === "diary", "themeForHour(5) should be diary");
  assert(themeForHour(blocks, 12) === "sleek", "themeForHour(12) should be sleek");

  const dateKey = "2026-11-15";
  let flips = 0;
  for (let h = 0; h < 24; h++) {
    const auto = seededAutoTheme(blocks, h, dateKey);
    assert(auto === seededAutoTheme(blocks, h, dateKey), `seededAutoTheme not deterministic at ${h}`);
    assert(auto === "diary" || auto === "sleek", `seededAutoTheme returned "${auto}"`);
    if (auto !== themeForHour(blocks, h)) flips++;
  }
  assert(flips >= 2 && flips <= 12, `seededAutoTheme flipped ${flips}/24 hours, expected roughly a third`);

  console.log("✓ selftest");
}

if (process.argv.includes("--selftest")) await selftest();
else main();
