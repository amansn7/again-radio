// Resolves iTunes artwork URLs into the data JSON (URL strings only, never images).
// Usage: node scripts/resolve-art.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DATA = join(import.meta.dirname, "..", "public", "data");
const DRY = process.argv.includes("--dry");
const GAP = 4500;
let last = 0;

const norm = (s) =>
  String(s ?? "").toLowerCase().replace(/\s*[(\[][^)\]]*[)\]]/g, "").replace(/\s+-\s+(ep|single)$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(term, entity) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=5`;
  for (let attempt = 0; attempt < 2; attempt++) {
    await sleep(Math.max(0, last + GAP - Date.now()));
    last = Date.now();
    const res = await fetch(url).catch(() => null);
    if (res?.ok) return (await res.json()).results ?? [];
    if (res && (res.status === 403 || res.status === 429) && attempt === 0) {
      console.log(`  ${res.status}, waiting 60s`);
      await sleep(60000);
      continue;
    }
    return [];
  }
  return [];
}

function pick(rows, want, field, artist) {
  const w = norm(want);
  if (!w) return null;
  const a = artist.toLowerCase();
  const ok = rows.filter((r) => {
    const n = String(r.artistName ?? "").toLowerCase();
    return n.includes("fred again") || (a && n.includes(a));
  });
  const hit = ok.find((r) => norm(r[field]) === w) ?? ok.find((r) => norm(r[field]).startsWith(w));
  const art = hit?.artworkUrl100;
  return typeof art === "string" && art ? art.replace("100x100bb", "600x600bb") : null;
}

async function resolveTrack(e) {
  const artist = e.artist?.trim() || "Fred again..";
  let art = pick(await search(`${artist} ${e.title}`, "song"), e.title, "trackName", artist);
  if (!art && e.album) art = pick(await search(`${artist} ${e.album}`, "album"), e.album, "collectionName", artist);
  return art;
}

const withArt = (e, art) => {
  const out = {};
  for (const [k, v] of Object.entries(e)) {
    out[k] = v;
    if (k === (e.album !== undefined ? "album" : "title")) out.art = art;
  }
  return out;
};

const stats = {};
const count = (f, ok) => ((stats[f] ??= { matched: 0, unmatched: 0 })[ok ? "matched" : "unmatched"]++);

for (const f of readdirSync(join(DATA, "programs")).filter((n) => n.endsWith(".json"))) {
  const path = join(DATA, "programs", f);
  const p = JSON.parse(readFileSync(path, "utf8"));
  let changed = false;
  for (let i = 0; i < p.entries.length; i++) {
    const e = p.entries[i];
    if (e.type !== "track" || e.art || !e.title) continue;
    const art = await resolveTrack(e);
    console.log(`${f} ${e.title}: ${art ?? "-"}`);
    count(f, art);
    if (art) {
      p.entries[i] = withArt(e, art);
      changed = true;
      if (!DRY) writeFileSync(path, JSON.stringify(p, null, 2) + "\n");
    }
  }
}

const apath = join(DATA, "albums.json");
let text = readFileSync(apath, "utf8");
const albums = JSON.parse(text).albums ?? [];
for (const a of albums) {
  if (a.art) continue;
  const art = pick(await search(`Fred again.. ${a.title}`, "album"), a.title, "collectionName", "") ??
    pick(await search(`Fred again.. ${a.title}`, "song"), a.title, "trackName", "");
  console.log(`albums ${a.title}: ${art ?? "-"}`);
  count("albums.json", art);
  if (!art) continue;
  // albums.json keeps one object per line, so insert in place instead of re-serialising
  const needle = `"title": ${JSON.stringify(a.title)}`;
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => l.includes(needle));
  if (idx < 0 || !/ \},?$/.test(lines[idx])) continue;
  lines[idx] = lines[idx].replace(/ \}(,?)$/, `, "art": "${art}" }$1`);
  text = lines.join("\n");
  if (!DRY) writeFileSync(apath, text);
}

console.log(DRY ? "dry run" : "written", JSON.stringify(stats, null, 1));
