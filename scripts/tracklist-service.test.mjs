// Unit and integration tests for Tracklist & Setlist Service.
import assert from "node:assert/strict";
import { join } from "node:path";
import { parseTimestamp, parseTitle, parseTracklist } from "./lib/track-parser.mjs";
import { TrackMatcher } from "./lib/track-matcher.mjs";

const ART_URL = /^https:\/\/(is[0-9]-ssl\.mzstatic\.com|coverartarchive\.org|i\.ytimg\.com)\//;

// 1. Timestamp Parsing
assert.equal(parseTimestamp("00:00 Nathan").offset, 0);
assert.equal(parseTimestamp("1:02:15 Danielle").offset, 3735);
assert.equal(parseTimestamp("[05:20] Kammy").offset, 320);
assert.equal(parseTimestamp("(01:14:20) Turn On The Lights").offset, 4460);
assert.equal(parseTimestamp("142 - Kammy").offset, 142);
assert.equal(parseTimestamp("No timestamp").offset, null);

// 2. Title AST & Remix Decomposition
const orig = parseTitle("Delilah (pull me out of this)");
assert.equal(orig.type, "track");
assert.equal(orig.personName, "Delilah");
assert.equal(orig.versionType, "original");

const rmx = parseTitle("Delilah (HAAi remix)");
assert.equal(rmx.type, "track");
assert.equal(rmx.personName, "Delilah");
assert.equal(rmx.versionType, "remix");
assert.equal(rmx.remixer, "HAAi");

const fredRmx = parseTitle("Cat Power - I Think Of Angels (Fred again.. Remix)");
assert.equal(fredRmx.artist, "Cat Power");
assert.equal(fredRmx.isFredRemix, true);
assert.equal(fredRmx.versionType, "remix");

const vip = parseTitle("Fred again.. & BIA - ICEY.. (Live Edit)");
assert.equal(vip.versionType, "live_edit");

const id = parseTitle("45:10 ID - ID");
assert.equal(id.type, "id");

const interlude = parseTitle("Interlude");
assert.equal(interlude.type, "interlude");

// 3. Tracklist Multi-line Parsing with Durations
const raw = `
00:00 Nathan (still breathing)
02:22 Kammy (like i do)
06:22 Danielle (smile on my face)
`;
const entries = parseTracklist(raw, 600);
assert.equal(entries.length, 3);
assert.equal(entries[0].offset, 0);
assert.equal(entries[0].duration, 142);
assert.equal(entries[1].offset, 142);
assert.equal(entries[1].duration, 240);
assert.equal(entries[2].offset, 382);
assert.equal(entries[2].duration, 218); // 600 - 382

// 4. Local In-Memory Matcher
const matcher = new TrackMatcher(join(import.meta.dirname, "..", "public", "data"));
const m1 = matcher.match(parseTitle("Danielle (smile on my face)"));
assert.equal(m1.title, "Danielle (smile on my face)");
assert.equal(m1.album, "Actual Life 3 (January 1 - September 9 2022)");
assert.ok(m1.art && ART_URL.test(m1.art), "Danielle art must match ART_URL");

const m2 = matcher.match(parseTitle("Delilah (HAAi remix)"));
assert.ok(m2.album, "Remix should resolve base album");
assert.ok(m2.art && ART_URL.test(m2.art), "Remix should inherit verified art");

const m3 = matcher.match(parseTitle("stayinit (VIP / Outro)"));
assert.ok(m3.art && ART_URL.test(m3.art), "VIP should resolve USB art");

console.log("✓ All tracklist service tests passed");
