#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseTracklist, parseTitle } from "./lib/track-parser.mjs";
import { TrackMatcher } from "./lib/track-matcher.mjs";
import { ArtClient } from "./lib/art-client.mjs";

const DATA = join(import.meta.dirname, "..", "public", "data");
const matcher = new TrackMatcher(DATA);
const artClient = new ArtClient();
const args = process.argv.slice(2);
const cmd = args[0] || "audit";
const DRY = args.includes("--dry");

function auditPrograms() {
  const pdir = join(DATA, "programs");
  const files = readdirSync(pdir).filter((n) => n.endsWith(".json"));
  let total = 0, noArt = 0, noAlbum = 0, ids = 0;
  for (const f of files) {
    const p = JSON.parse(readFileSync(join(pdir, f), "utf8"));
    for (const e of p.entries ?? []) {
      if (e.type === "id") ids++;
      else if (e.type === "track") {
        total++;
        if (!e.art) noArt++;
        if (!e.album) noAlbum++;
      }
    }
  }
  console.log(`Audited ${files.length} programs: ${total} tracks (${ids} IDs) | Missing Art: ${noArt} | Missing Album: ${noAlbum}`);
  return { files: files.length, total, noArt, noAlbum, ids };
}

async function enrichProgram(file) {
  const path = file.endsWith(".json") ? file : join(DATA, "programs", `${file}.json`);
  if (!existsSync(path)) throw new Error(`Not found: ${path}`);
  const p = JSON.parse(readFileSync(path, "utf8"));
  let updated = 0;

  for (let i = 0; i < (p.entries ?? []).length; i++) {
    const e = p.entries[i];
    if (e.type === "id" || e.type === "interlude") continue;
    const ast = parseTitle(e.title, e.artist);
    const m = matcher.match(ast);

    if (!e.album && m.album) { e.album = m.album; updated++; }
    if (!e.art && m.art) { e.art = m.art; updated++; }
    if (!e.art && !DRY) {
      const netArt = await artClient.resolve(e.title, e.artist, e.album);
      if (netArt) { e.art = netArt; updated++; }
    }
    if (!e.art && p.youtubeId) {
      e.art = `https://i.ytimg.com/vi/${p.youtubeId}/hqdefault.jpg`;
      updated++;
    }
  }

  if (updated > 0 && !DRY) {
    writeFileSync(path, JSON.stringify(p, null, 2) + "\n");
    console.log(`✓ ${path}: updated ${updated} field(s)`);
  }
  return updated;
}

async function enrichAll() {
  const pdir = join(DATA, "programs");
  for (const f of readdirSync(pdir).filter((n) => n.endsWith(".json"))) {
    await enrichProgram(join(pdir, f));
  }
}

async function processSetlist() {
  const show = args[args.indexOf("--show") + 1];
  const source = args[args.indexOf("--source") + 1];
  const inputIdx = args.indexOf("--input");
  const input = inputIdx >= 0 ? readFileSync(args[inputIdx + 1], "utf8") : "";
  if (!show || !source || !/^[a-z0-9-]+$/.test(show)) {
    throw new Error("Usage: setlist --show <kebab-id> --source <url> [--input <file>]");
  }

  const entries = parseTracklist(input);
  const outPath = join(DATA, "setlists.json");
  const store = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { shows: {} };

  store.shows[show] = {
    showId: show,
    source,
    updatedAt: new Date().toISOString(),
    tracks: entries.map((e) => {
      const m = matcher.match(e.ast);
      return { title: m.title ?? e.title, type: e.type, ...(m.album ? { album: m.album } : {}) };
    }),
  };

  if (!DRY) {
    writeFileSync(outPath, JSON.stringify(store, null, 2) + "\n");
    console.log(`✓ Recorded setlist for ${show} (${store.shows[show].tracks.length} tracks) -> ${outPath}`);
  }
}

async function main() {
  if (cmd === "audit") auditPrograms();
  else if (cmd === "enrich-all") { auditPrograms(); await enrichAll(); auditPrograms(); }
  else if (cmd === "program" && args[1]) await enrichProgram(args[1]);
  else if (cmd === "setlist") await processSetlist();
  else console.log("Usage: tracklist-service.mjs [audit | enrich-all | program <file> | setlist]");
}

await main();
