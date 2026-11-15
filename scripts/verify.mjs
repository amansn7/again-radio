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

function selftest() {
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
  console.log("✓ selftest");
}

if (process.argv.includes("--selftest")) selftest();
else main();
