// Builds public/data/songs.json from MusicBrainz: every released Fred again.. track, as facts
// only (title, release, year, featured artists). No prose, no images.
// Usage: node scripts/songs.mjs [--dry]
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const ARTIST = "bca46a0c-25c9-42ca-98c2-e64c8a5e337e";
const OUT = join(import.meta.dirname, "..", "public", "data", "songs.json");
const DRY = process.argv.includes("--dry");
const API = "https://musicbrainz.org/ws/2";
const HEADERS = { "User-Agent": "again-radio-fan-data/0.1 (static fan site build script)", Accept: "application/json" };
// MusicBrainz allows one request per second.
const GAP = 1100;
// Remix, live and DJ-mix release groups repeat songs under other names; keep the originals.
const SKIP = new Set(["Remix", "Live", "DJ-mix", "Interview", "Demo"]);

let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(Math.max(0, last + GAP - Date.now()));
    last = Date.now();
    const res = await fetch(`${API}/${path}${path.includes("?") ? "&" : "?"}fmt=json`, { headers: HEADERS }).catch(() => null);
    if (res?.ok) return res.json();
    if (res?.status === 503 || !res) {
      await sleep(5000);
      continue;
    }
    throw new Error(`${res.status} for ${path}`);
  }
  throw new Error(`gave up on ${path}`);
}

// A version of a song, not a song: "(HAAi remix)", "(extended)", "(KETTAMA MIX)", "(… edit)".
const VERSION = /([(\[][^)\]]*|\s-\s.*)\b(remix|mix|dub|edit|extended|version|instrumental|vip)\b/i;
const key = (t) => t.toLowerCase().replace(/\s*[(\[](feat|with|ft)\.?[^)\]]*[)\]]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

async function releaseGroups() {
  const all = [];
  for (let offset = 0; ; offset += 100) {
    const j = await get(`release-group?artist=${ARTIST}&limit=100&offset=${offset}`);
    all.push(...j["release-groups"]);
    if (all.length >= j["release-group-count"] || !j["release-groups"].length) return all;
  }
}

const groups = (await releaseGroups())
  .filter((g) => ["Album", "Single", "EP"].includes(g["primary-type"]))
  .filter((g) => !(g["secondary-types"] ?? []).some((t) => SKIP.has(t)))
  .filter((g) => g["first-release-date"])
  .sort((a, b) => a["first-release-date"].localeCompare(b["first-release-date"]));
console.log(`${groups.length} release groups`);

const songs = new Map();
for (const g of groups) {
  const j = await get(`release?release-group=${g.id}&inc=recordings+artist-credits&limit=1`);
  const rel = j.releases?.[0];
  if (!rel) continue;
  for (const medium of rel.media ?? []) {
    for (const track of medium.tracks ?? []) {
      const credits = track["artist-credit"] ?? track.recording?.["artist-credit"] ?? [];
      if (!credits.some((c) => c.artist?.id === ARTIST)) continue;
      const title = track.title.trim();
      if (VERSION.test(title)) continue;
      const k = key(title);
      if (!k) continue;
      // Earliest release keeps the year; an album or EP that collects a single becomes its home.
      const seen = songs.get(k);
      if (seen) {
        if (seen.single && g["primary-type"] !== "Single") Object.assign(seen, { release: g.title, single: false });
        continue;
      }
      const others = credits.filter((c) => c.artist?.id !== ARTIST).map((c) => c.name);
      const song = { title, release: g.title, year: Number(g["first-release-date"].slice(0, 4)), single: g["primary-type"] === "Single" };
      if (others.length) song.with = others;
      songs.set(k, song);
    }
  }
  console.log(`  ${g["first-release-date"]} ${g.title}: ${songs.size} songs so far`);
}

const out = {
  checked: new Date().toISOString().slice(0, 10),
  source: `https://musicbrainz.org/artist/${ARTIST}`,
  songs: [...songs.values()].map(({ single, ...s }) => s),
};
if (DRY) console.log(JSON.stringify(out.songs.slice(0, 5), null, 2));
else writeFileSync(OUT, `{\n  "checked": "${out.checked}",\n  "source": "${out.source}",\n  "songs": [\n${out.songs.map((s) => `    ${JSON.stringify(s)}`).join(",\n")}\n  ]\n}\n`);
console.log(`${songs.size} songs${DRY ? " (dry run)" : ` → ${OUT}`}`);
