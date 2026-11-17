import { readFileSync } from "node:fs";
import { parseShows, upcoming, onAir, stations, xOf, glow, readout, heading, dayLabel, WIDE } from "../src/lib/shows.ts";

const fail = (m) => { console.error("✗", m); process.exit(1); };
const assert = (c, m) => { if (!c) fail(m); };
const json = JSON.parse(readFileSync(new URL("../public/data/shows.json", import.meta.url), "utf8"));

const { shows } = parseShows(json);
const D = 86400_000, H = 3600_000, delhi = shows[0].t;
assert(parseShows({ checked: "x", shows: [{ city: "A", venue: "V", tz: "UTC", start: "nope", country: "C" }, ...json.shows] }).shows.length === 5, "parse drops bad rows");
assert(onAir(shows, delhi - 1) === undefined && onAir(shows, delhi) === shows[0] && onAir(shows, delhi + 9 * H) === undefined, "on-air boundaries");
assert(upcoming(shows, delhi + 9 * H)[0].city === "Mumbai", "upcoming skips ended");
assert(stations(shows).map((s) => `${s.city}${s.shows.length}`).join() === "Delhi1,Mumbai2,Bengaluru2", "station grouping");
const fake = (city, t) => ({ city, country: "X", venue: "V", tz: "UTC", start: "", t });
assert(stations([fake("A", 0), fake("B", D)]).length === 2 && stations([fake("A", 0), fake("A", 3 * D)]).length === 2, "grouping rules");
const now = delhi - 17 * D, up = upcoming(shows, now);
assert(xOf(now, now, up, WIDE) === 14, "xOf now");
assert(Math.abs(xOf(delhi, now, up, WIDE) - 48) < 1e-9, "xOf capped");
assert(Math.abs(xOf(shows[4].t, now, up, WIDE) - 91) < 1e-9, "xOf last");
assert(xOf(delhi, delhi - H, up, WIDE) < 17, "gap opens near start");
assert(xOf(shows[1].t, now, up, WIDE) > 48 && xOf(shows[1].t, now, up, WIDE) < 91, "xOf between");
assert(xOf(0, shows[4].t + D, [], WIDE) === 14 && upcoming(shows, shows[4].t + D).length === 0, "empty upcoming");
assert(readout(17 * D + 12 * H + 56 * 60e3 + 38e3) === "17 d 12:56:38" && readout(5 * H + 7e3) === "05:00:07" && readout(-5) === "00:00:00", "readout");
assert(glow(8 * D) === 0 && glow(2 * D) === 0.4 && glow(0) === 1, "glow");
assert(heading(shows) === "India, December 2026" && heading([...shows, fake("Paris", Date.parse("2027-01-10"))]) === "Upcoming shows", "heading");
assert(dayLabel(shows[0]) === "Sat 5 Dec", "dayLabel");
console.log("✓ shows");
