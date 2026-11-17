import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildIndex, search } from "../src/lib/search.ts";
import { parseShows } from "../src/lib/shows.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => JSON.parse(readFileSync(`${root}/public/data/${p}`, "utf8"));
const albums = read("albums.json");
const index = buildIndex({
  catalogue: [
    { youtubeId: "aaaaaaaaaaa", title: "Kyle (i found you)", kind: "song", duration: 200, channel: "Fred again..", published: "2019-05-01" },
    { youtubeId: "bbbbbbbbbbb", title: "Boiler Room: London", kind: "set", duration: 4300, channel: "Boiler Room" },
  ],
  programs: ["boiler-room-london", "rooftop-live", "alex-palace-bangalter"].map((id) => ({
    path: `programs/${id}.json`, program: read(`programs/${id}.json`),
  })),
  shows: { path: "programs/usb002-every-show.json", program: read("programs/usb002-every-show.json") },
  albums: albums.albums,
  tour: parseShows(read("shows.json")).shows,
});

const fail = (m) => { console.error(`✗ ${m}`); process.exit(1); };
const has = (q, pred, what) => {
  const r = search(index, q);
  if (!r.some(pred)) fail(`"${q}" should find ${what}; got ${r.map((d) => d.title).join(", ")}`);
};

has("kyle", (d) => d.group === "Songs" && d.title.startsWith("Kyle"), "the song");
has("kamy", (d) => d.group === "In sets" && d.title.startsWith("Kammy"), "Kammy via typo");
has("glasgow", (d) => d.group === "Shows" && d.title === "GLASGOW", "the show");
has("boiler", (d) => d.group === "In sets", "moments");
has("mahalaxmi", (d) => d.group === "On tour" && d.title === "Mumbai", "venue");
has("delhi", (d) => d.group === "On tour", "tour date");
if (search(index, "").length || search(index, "  ").length) fail("empty query should return nothing");
for (const g of new Set(search(index, "a").map((d) => d.group)))
  if (search(index, "a").filter((d) => d.group === g).length > 8) fail("cap 8 per group");

console.log("✓ search");
