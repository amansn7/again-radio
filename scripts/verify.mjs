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
  let noAlbum = 0;
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
    if (e.art !== undefined && !ART_URL.test(e.art)) fail(`${at}: art must be an https mzstatic/coverartarchive/ytimg URL`);
    if (!e.album && e.type === "track") noAlbum++;
    prevEnd = e.offset + e.duration;
  });
  if (noAlbum) warn.push(`${file}: ${noAlbum} track(s) with no album (song-art fallback)`);
}

const ART_URL = /^https:\/\/(is[0-9]-ssl\.mzstatic\.com|coverartarchive\.org|i\.ytimg\.com)\//;

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
  const seen = new Set();
  const stationPath = join(DATA, "station.json");
  if (existsSync(stationPath)) {
    const s = JSON.parse(readFileSync(stationPath, "utf8"));
    validateStation(s);
    for (const r of s.rotation ?? []) {
      const f = join(DATA, r.program);
      if (!existsSync(f)) { fail(`rotation points at missing ${r.program}`); continue; }
      seen.add(r.program);
      validateProgram(JSON.parse(readFileSync(f, "utf8")), r.program);
    }
  } else {
    warn.push("no station.json");
  }
  const pdir = join(DATA, "programs");
  if (existsSync(pdir)) {
    for (const f of readdirSync(pdir).filter((n) => n.endsWith(".json"))) {
      if (seen.has(`programs/${f}`)) continue;
      validateProgram(JSON.parse(readFileSync(join(pdir, f), "utf8")), `programs/${f}`);
    }
  }
  const cpath = join(DATA, "catalogue.json");
  if (existsSync(cpath)) {
    const KINDS = new Set(["song", "video", "live", "set", "film", "other"]);
    const ids = new Set();
    (JSON.parse(readFileSync(cpath, "utf8")).items ?? []).forEach((it, i) => {
      const at = `catalogue.json item ${i} (${it?.title ?? "?"})`;
      if (!/^[\w-]{11}$/.test(it?.youtubeId ?? "")) fail(`${at}: bad youtubeId`);
      if (!String(it?.title ?? "").trim()) fail(`${at}: empty title`);
      if (!String(it?.channel ?? "").trim()) fail(`${at}: empty channel`);
      if (!KINDS.has(it?.kind)) fail(`${at}: unknown kind "${it?.kind}"`);
      if (!Number.isInteger(it?.duration) || it.duration < 0) fail(`${at}: bad duration`);
      if (it?.place !== undefined && (typeof it.place !== "string" || !it.place.trim() || it.place.length > 32)) fail(`${at}: place must be a non-empty string of at most 32 chars`);
      if (ids.has(it?.youtubeId)) fail(`${at}: duplicate id`);
      ids.add(it?.youtubeId);
    });
  }
  const songsPath = join(DATA, "songs.json");
  if (existsSync(songsPath)) {
    const titles = new Set();
    (JSON.parse(readFileSync(songsPath, "utf8")).songs ?? []).forEach((r, i) => {
      const at = `songs.json song ${i} (${r?.title ?? "?"})`;
      if (!String(r?.title ?? "").trim() || !String(r?.release ?? "").trim() || !Number.isInteger(r?.year)) fail(`${at}: needs title, release, year`);
      if (r.with !== undefined && !(Array.isArray(r.with) && r.with.every((w) => typeof w === "string" && w.trim()))) fail(`${at}: with must be a list of names`);
      const k = r.title.toLowerCase();
      if (titles.has(k)) fail(`${at}: duplicate title`);
      titles.add(k);
    });
  }
  const productionPath = join(DATA, "production.json");
  if (existsSync(productionPath)) {
    const production = JSON.parse(readFileSync(productionPath, "utf8"));
    const ids = new Set();
    for (const [group, rows] of [["songs", production.songs ?? []], ["candidates", production.candidates ?? []]]) {
      if (!Array.isArray(rows)) { fail(`production.json: ${group} must be a list`); continue; }
      rows.forEach((r, i) => {
        const at = `production.json ${group} ${i} (${r?.title ?? "?"})`;
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r?.id ?? "")) fail(`${at}: bad id`);
        if (ids.has(r?.id)) fail(`${at}: duplicate id`);
        ids.add(r?.id);
        if (!String(r?.title ?? "").trim() || !String(r?.release ?? "").trim() || !Number.isInteger(r?.year)) fail(`${at}: needs title, release, year`);
        if (!Array.isArray(r?.roles) || !r.roles.length || !r.roles.every((role) => typeof role === "string" && role.trim())) fail(`${at}: needs credited roles`);
        if (!Array.isArray(r?.sources) || !r.sources.length || !r.sources.every((s) => /^https:\/\//.test(s?.url ?? "") && String(s?.type ?? "").trim() && String(s?.note ?? "").trim())) fail(`${at}: needs source URLs, types, and notes`);
      });
    }
    if (!String(production.scope ?? "").trim() || !String(production.coverage ?? "").trim()) fail("production.json: document scope and coverage limits");
  }
  const apath = join(DATA, "albums.json");
  if (existsSync(apath)) {
    const a = JSON.parse(readFileSync(apath, "utf8"));
    (a.albums ?? []).forEach((r, i) => {
      if (r?.art !== undefined && !ART_URL.test(r.art)) fail(`albums.json album ${i}: art must be an https mzstatic/coverartarchive URL`);
      if (!Number.isInteger(r?.year) || !String(r?.title ?? "").trim() || typeof r?.subtitle !== "string") fail(`albums.json album ${i}: needs year, title, subtitle`);
    });
  }
  const spath = join(DATA, "shows.json");
  if (existsSync(spath)) {
    const rows = JSON.parse(readFileSync(spath, "utf8")).shows ?? [];
    rows.forEach((r, i) => {
      const at = `shows.json show ${i}`;
      for (const k of ["city", "country", "venue", "tz"]) if (!String(r?.[k] ?? "").trim()) fail(`${at}: missing "${k}"`);
      if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?[+-]\d\d:\d\d$/.test(r?.start ?? "")) fail(`${at}: bad start`);
      else if (Number.isNaN(Date.parse(r.start))) fail(`${at}: start is not a real date`);
      try { new Intl.DateTimeFormat("en", { timeZone: r.tz }); } catch { fail(`${at}: invalid tz "${r.tz}"`); }
    });
    if (rows.length && rows.every((r) => Date.parse(r.start) + 9 * 3600_000 < Date.now())) {
      warn.push("shows.json: every show has ended — add new dates or empty the list");
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

  const { blockForHour } = await import("../src/lib/theme.ts");
  const blocks = [
    { from: 4, to: 10, label: "dawn" },
    { from: 10, to: 16, label: "day" },
    { from: 16, to: 22, label: "dusk" },
    { from: 22, to: 4, label: "night" },
  ];
  for (const h of [22, 23, 0, 1, 2, 3]) {
    assert(blockForHour(blocks, h).label === "night", `night block should cover hour ${h}`);
  }
  assert(blockForHour(blocks, 4).label === "dawn", "night block must not cover hour 4");
  assert(blockForHour([], 3).label === "day", "empty blocks should fall back to a default block");

  const { derivePalette } = await import("../src/lib/palette.ts");
  const [art1, art2, art3, accent] = derivePalette([[200, 40, 40], [20, 20, 20], [120, 120, 120], [240, 240, 240]]);
  assert(art3.join() === "20,20,20", "art-3 should be the darkest sampled colour");
  assert(art2.join() === "120,120,120", "art-2 should be the second-lightest colour");
  assert(art1.join() === "120,120,120", "art-1 should be the median colour");
  assert(accent.join() === "255,55,55", `accent should be the saturated red lifted to luma 120, got ${accent}`);

  const { beatAt } = await import("../src/lib/pulse.ts");
  assert(beatAt(30, 120, 200).kick > 0.99, "kick should peak on the beat");
  assert(beatAt(30.45, 120, 200).kick < 0.01, "kick should decay before the next beat");
  assert(beatAt(30.25, 120, 200).hat > 0.99, "hat should peak on the off-beat");
  assert(beatAt(30, 120, 200).env === 1, "envelope should be full mid-track");
  assert(beatAt(1, 120, 200).env < 0.2, "envelope should fade in at the start");
  assert(beatAt(199, 120, 200).env < 0.3, "envelope should fade out at the end");
  assert(beatAt(30, 0, 200).kick === 0, "no tempo means no kick");

  const { normTitle } = await import("../src/lib/art.ts");
  assert(normTitle("Actual Life 3 (January 1 - September 9 2022)") === "actual life 3", "normTitle should drop the date parenthetical");
  assert(normTitle("Kyle (I Found You) - Single") === "kyle", "normTitle should drop the release-type suffix");

  const { albumEntry } = await import("../src/components/dial-data.ts");
  const programs = ["boiler-room-london", "rooftop-live", "alex-palace-bangalter", "usb002-every-show"].map((id) => ({
    path: `programs/${id}.json`, data: JSON.parse(readFileSync(join(DATA, "programs", `${id}.json`), "utf8")) }));
  assert(albumEntry("Actual Life 3 (January 1 - September 9 2022)", programs)?.path === "programs/boiler-room-london.json", "Actual Life 3 should play from Boiler Room");
  assert(albumEntry("USB002", programs)?.entry.title === "GLASGOW", "USB002 should play its first show");
  assert(albumEntry("ten days", programs) !== null, "ten days is on air");
  assert(albumEntry("Secret Life", programs) === null, "Secret Life is not on air yet");

  console.log("✓ selftest");
}

if (process.argv.includes("--selftest")) await selftest();
else main();
