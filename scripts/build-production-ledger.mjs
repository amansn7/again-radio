import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const dataDir = join(root, "public", "data");
const catalog = JSON.parse(readFileSync(join(dataDir, "songs.json"), "utf8")).songs;
const groups = [
  ["Actual Life", "https://www.qobuz.com/us-en/album/actual-life-fred-again/elkynhkxgxd0b"],
  ["Actual Life (April 14 - December 17 2020)", "https://www.qobuz.com/us-en/album/actual-life-april-14-december-17-2020-fred-again/yh2tkxef06pva"],
  ["Actual Life 2 (February 2 - October 15 2021)", "https://www.qobuz.com/us-en/album/actual-life-2-february-2-october-15-2021-fred-again/k7p4gnsxxy3bc", ["Roze (Forgive)"]],
  ["Actual Life 2 Piano (February 2 - October 15 2021)", "https://www.qobuz.com/us-en/album/actual-life-2-piano-ep-february-2-october-15-2021-fred-again/tw8mpslzldc2b"],
  ["Actual Life 3 (January 1 - September 9 2022)", "https://www.qobuz.com/gb-en/album/actual-life-3-january-1-september-9-2022-fred-again/w36xbir8qucna"],
  ["Actual Life 3 Piano (January 1 - September 9 2022)", "https://www.qobuz.com/us-en/album/actual-life-3-piano-ep-fred-again/dm0b9e9blw0ia"],
  ["Secret Life", "https://www.qobuz.com/us-en/album/secret-life-fred-again-brian-eno/v0kenfw6hhwqb"],
  ["ten days", "https://www.qobuz.com/us-en/album/ten-days-fred-again/pglnwqmrwe67b"],
  ["9 months & 50 hours", "https://www.qobuz.com/us-en/album/9-months-50-hours-fred-again-latin-mafia/h2mpnngb24dex"],
  ["Skepta .. Fred", "https://www.qobuz.com/us-en/album/skepta-fred-skepta-x-fred-again/qlnbyngnbjjlb"],
];
const partial = [
  ["GANG", ["Charades", "SOLDIERS", "Judge Me (interlude)", "Smoke", "GANG", "Told", "Know Me"], "https://www.qobuz.com/nz-en/album/gang-headie-one-x-fred-again/g75ov596xp7ta"],
  ["USB", ["ItsNotREEAALLLLLLLL", "BerwynGesaffNeighbours", "stayinit", "leavemealone", "Baby again..", "Rumble", "Jungle", "Admit It (u dont want 2)", "Lights Out"], "https://www.qobuz.com/us-en/album/usb-fred-again/mtuk6su8ngrag"],
  ["USB002", ["you’re a star", "Ambery", "Facilita", "HARDSTYLE 2", "Winny", "ICEY..", "..FEISTY", "solo", "Lights Burn Dimmer", "OK OK", "Victory Lap Five"], "https://www.qobuz.com/us-en/album/usb-fred-again/mtuk6su8ngrag"],
];
const singles = [
  { title: "Don’t Judge Me", release: "Don’t Judge Me", url: "https://www.qobuz.com/us-en/album/dont-judge-me-fred-again-headie-one-raphael-saadiq/" },
  { title: "I Luv U", release: "I Luv U", url: "https://www.qobuz.com/us-en/album/i-luv-u-fred-again-wallfacer/" },
  { title: "Talk of the Town", release: "Talk of the Town", url: "https://www.qobuz.com/us-en/album/talk-of-the-town-fred-again-sammy-virji-reggie/etyi20lk5w3ic" },
  { title: "scared", release: "scared", url: "https://www.qobuz.com/us-en/album/scared-fred-again-young-thug/b0govnfzbsqia" },
];
const verified = [];
const matched = new Set();

function add(song, url) {
  if (matched.has(song.title.toLowerCase())) return;
  matched.add(song.title.toLowerCase());
  verified.push({
    id: `fred-prod-${song.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    title: song.title,
    artists: ["Fred again..", ...(song.with ?? [])],
    release: song.release,
    year: song.year,
    fredCreditName: "Fred again..",
    roles: ["producer"],
    status: "verified",
    sources: [{ url, type: "track credits", note: "Qobuz track-level credits list Fred again.. as Producer." }],
  });
}

for (const [release, url, excluded = []] of groups) {
  for (const song of catalog.filter((s) => s.release === release && !excluded.includes(s.title))) add(song, url);
}
for (const [release, titles, url] of partial) {
  for (const title of titles) {
    const song = catalog.find((s) => s.release === release && s.title === title);
    if (!song) throw new Error(`Missing ${title} in ${release}`);
    add(song, url);
  }
}
for (const row of singles) {
  const song = catalog.find((s) => s.title === row.title && s.release === row.release);
  if (song) add(song, row.url);
}

for (const row of [
  { title: "Fighting For?", artists: ["Roots Manuva"], release: "Bleeds", year: 2015, name: "Fred Gibson", role: "additional producer", url: "https://music.apple.com/us/song/1033571078", note: "Apple Music track credits list Fred Gibson as Additional Producer." },
  { title: "After the Afterparty (feat. Lil Yachty)", artists: ["Charli xcx", "Lil Yachty"], release: "After the Afterparty - Single", year: 2016, name: "Fred again..", role: "producer", url: "https://music.apple.com/us/song/1161690780", note: "Apple Music track credits list Fred again.. as Producer." },
  { title: "Bad Habits", artists: ["Ed Sheeran"], release: "=", year: 2021, name: "FRED", role: "producer", url: "https://www.youtube.com/watch?v=hJWSZDJb-W4", note: "Official Ed Sheeran/Atlantic credits list FRED as Producer; identity supported by the cited Fred Gibson profile." },
]) verified.push({ id: `fred-prod-${row.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`, title: row.title, artists: row.artists, release: row.release, year: row.year, fredCreditName: row.name, roles: [row.role], status: "verified", sources: [{ url: row.url, type: "track credits", note: row.note }] });

const candidates = [
  { id: "eno-hyde-someday-world", title: "Someday World (tracks 1–9)", release: "Someday World", year: 2014, fredCreditName: "Fred Gibson", roles: ["producer"], status: "release-level; track mapping needed", sources: [{ url: "https://musicbrainz.org/release/8778e8a2-5d11-4d06-97fa-80c0ccf08e66", type: "release credits", note: "Map the release-level producer relationships to individual tracks before counting them." }] },
  { id: "maisie-peters-elvis-song", title: "Elvis Song", release: "You Signed Up for This", year: 2021, fredCreditName: "Fred again..", roles: ["producer"], status: "secondary source; official credit needed", sources: [{ url: "https://readdork.com/track/maisie-peters-elvis-song", type: "track profile", note: "Secondary track profile identifies Fred again.. as producer; not counted as verified." }] },
  { id: "roots-manuva-bleeds-unspecified", title: "Bleeds (unspecified additional tracks)", release: "Bleeds", year: 2015, fredCreditName: "Fred", roles: ["production assistance"], status: "release-level; track mapping needed", sources: [{ url: "https://ninjatune.net/release/roots-manuva/bleeds", type: "label release page", note: "Label notes production assistance without specifying tracks; not counted as verified." }] },
];
const exclusions = [{ id: "actual-life-2-roze-forgive", title: "Roze (Forgive)", release: "Actual Life 2 (February 2 - October 15 2021)", year: 2021, status: "not counted: no Fred producer credit listed", sources: [{ url: groups[2][1], type: "track credits", note: "Qobuz lists Avery Wilson as Producer and Fred again.. as composer, mixer, engineer, programmer, vocalist, and main artist, but not Producer." }] }];
const unresolved = catalog.filter((s) => !matched.has(s.title.toLowerCase()) && !exclusions.some((e) => e.title.toLowerCase() === s.title.toLowerCase())).map(({ title, release, year }) => ({ title, release, year, status: "credit not yet verified" }));
const ledger = {
  checked: "2026-11-18",
  scope: "Released recordings with a track-level Producer, Co-producer, or Additional Producer credit for Fred Gibson, Fred again.., or a verified alias. Songwriting, engineering, mixing, performance, and artist billing alone do not qualify.",
  coverage: `${catalog.length - unresolved.length - exclusions.length} of ${catalog.length} MusicBrainz artist-catalog tracks have a track-level producer credit in this ledger; ${unresolved.length} remain unverified and ${exclusions.length} have a reviewed non-producer credit. Producer-only tracks are listed separately where confirmed.`,
  songs: verified.sort((a, b) => a.year - b.year || a.title.localeCompare(b.title)),
  candidates,
  exclusions,
  reconciliation: {
    source: "https://musicbrainz.org/artist/bca46a0c-25c9-42ca-98c2-e64c8a5e337e",
    artistCatalogEntries: catalog.length,
    verifiedArtistCatalogEntries: catalog.length - unresolved.length - exclusions.length,
    unresolvedArtistCatalogEntries: unresolved.length,
    explicitlyExcludedArtistCatalogEntries: exclusions.length,
    unresolved,
  },
};
writeFileSync(join(dataDir, "production.json"), `${JSON.stringify(ledger, null, 2)}\n`);
console.log(`${ledger.songs.length} verified entries; ${unresolved.length} artist-catalog tracks need further credit research.`);
