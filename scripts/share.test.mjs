// Deep links and share text: /?p=<program-id>&t=<seconds>, shared as /p/<id>?t=<seconds>.
import { readFileSync } from "node:fs";
import { parseLink, resolveLink, sharePrograms, shareText, shareUrl } from "../src/lib/share.ts";

const fail = (m) => { console.error("✗", m); process.exit(1); };
const assert = (c, m) => { if (!c) fail(m); };

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
assert(same(parseLink("?p=boiler-room-london&t=1592"), { id: "boiler-room-london", t: 1592 }), "programme + time");
assert(same(parseLink("?p=video-9Stt4wq3KCE"), { id: "video-9Stt4wq3KCE", t: 0 }), "video id, no time");
assert(same(parseLink("?p=boiler-room-london&t=-5"), { id: "boiler-room-london", t: 0 }), "negative time clamps");
assert(same(parseLink("?p=boiler-room-london&t=abc"), { id: "boiler-room-london", t: 0 }), "junk time is 0");
assert(parseLink("") === null && parseLink("?t=40") === null, "no programme, no link");
assert(parseLink("?p=../../etc") === null && parseLink("?p=Boiler%20Room") === null, "ids are kebab-case or video-<id> only");

const boiler = { id: "boiler-room-london", duration: 4305, youtubeId: "c0-hvjV2A5Y", title: "Boiler Room: London", entries: [] };
const lot = { id: "video-9Stt4wq3KCE", duration: 4381, youtubeId: "9Stt4wq3KCE", title: "Lot", entries: [] };
const slots = [
  { path: "programs/boiler-room-london.json", program: boiler, start: 0, length: 4305 },
  { path: "video:9Stt4wq3KCE", program: lot, start: 0, length: 4381 },
];
const r = resolveLink({ id: "boiler-room-london", t: 1592 }, slots);
assert(r && r.path === "programs/boiler-room-london.json" && r.program === boiler && r.offset === 1592, "resolves a programme");
assert(resolveLink({ id: "video-9Stt4wq3KCE", t: 10 }, slots)?.path === "video:9Stt4wq3KCE", "resolves a catalogue set");
assert(resolveLink({ id: "boiler-room-london", t: 99999 }, slots)?.offset === 4304, "time past the end clamps inside");
assert(resolveLink({ id: "not-a-show", t: 0 }, slots) === null, "unknown id falls back to live");

assert(shareUrl("https://again-radio.pages.dev", "boiler-room-london", 1592.7) === "https://again-radio.pages.dev/p/boiler-room-london?t=1592", "share url floors seconds");
assert(shareUrl("https://again-radio.pages.dev", "boiler-room-london", 0) === "https://again-radio.pages.dev/p/boiler-room-london", "no t at the start");
assert(shareText("Feelings", "Boiler Room: London") === "Listening to Feelings, Boiler Room: London, on again radio", "track and set");
assert(shareText("The Lot Radio", "The Lot Radio") === "Listening to The Lot Radio on again radio", "no repeat when the track is the set");

// Every set on the dial gets a share page: the 5 station programmes and the catalogue sets.
const read = (p) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), "utf8"));
const progs = sharePrograms(read);
const ids = progs.map((p) => p.id);
assert(ids.includes("boiler-room-london") && ids.includes("usb002-every-show"), "station programmes");
assert(ids.includes("video-9Stt4wq3KCE") && progs.find((p) => p.id === "video-9Stt4wq3KCE").venue === "The Lot Radio", "catalogue sets, named by place");
assert(new Set(ids).size === ids.length, "ids unique");
assert(ids.length === 20, `one page per id (5 programmes + 15 catalogue sets), got ${ids.length}`);
// A catalogue copy of a station programme resolves to the programme the dial knows.
const naples = { id: "rooftop-naples", duration: 3797, youtubeId: "2yfyPeAEV3A", title: "Naples", entries: [] };
const dial = [...slots, { path: "programs/rooftop-naples.json", program: naples, start: 0, length: 3797 }];
assert(resolveLink({ id: "video-2yfyPeAEV3A", t: 60 }, dial)?.path === "programs/rooftop-naples.json", "video id falls back to the same video on the dial");

console.log("✓ share");
