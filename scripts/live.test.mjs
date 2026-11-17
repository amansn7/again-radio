import { hereText, videoProgram } from "../src/lib/live.ts";

const fail = (m) => { console.error("✗", m); process.exit(1); };
const assert = (c, m) => { if (!c) fail(m); };

const base = { youtubeId: "9Stt4wq3KCE", title: "Overmono, Fred again.. and Lil Yachty at The Lot Radio", kind: "set", duration: 4381, channel: "The Lot Radio" };
const p = videoProgram({ ...base, place: "The Lot Radio" });
assert(p.entries[0].title === "The Lot Radio" && p.entries[0].artist === base.title && p.venue === "The Lot Radio", "place becomes the name, title the serif line");
const q = videoProgram(base);
assert(q.entries[0].title === base.title && q.entries[0].artist === undefined && q.venue === "The Lot Radio", "no place: unchanged");
const r = videoProgram({ ...base, place: "X", song: "Delilah" });
assert(r.entries[0].title === "Delilah", "song still wins");

const h = (s, p) => hereText(s, p);
assert(h(30, "Boiler Room, London").long === "just started at Boiler Room, London" && h(30).short === "just started", "<1 min");
assert(h(23 * 60 + 59, "Boiler Room, London").long === "23 min into Boiler Room, London", "minutes floor");
assert(h(3600 + 12 * 60).short === "1 h 12 min in" && h(7200).short === "2 h in", "hours");
assert(h(388800 - 1).short === "107 h 59 min in", "USB002 scale");
assert(h(-5).short === "just started", "negative clamps");
assert(h(600).long === "10 min in", "no place: long equals short");

console.log("✓ live");
