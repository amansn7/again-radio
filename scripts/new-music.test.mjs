import test from "node:test";
import assert from "node:assert/strict";
import { splitTitle, songKey, isMusic } from "./lib/youtube-channel.mjs";

test("splitTitle", () => {
  assert.deepEqual(splitTitle("Fred again.., Jozzy & Jim Legxacy - ten (Official Indian Lyric Visualiser)"),
    { artist: "Fred again.., Jozzy & Jim Legxacy", song: "ten" });
  assert.deepEqual(splitTitle("Fred again.. - Delilah (pull me out of this) [Official Video]"),
    { artist: "Fred again..", song: "Delilah (pull me out of this)" });
  assert.deepEqual(splitTitle("adore u"), { artist: "Fred again..", song: "adore u" });
});

test("songKey groups versions", () => {
  assert.equal(songKey("Fred again.., Jozzy & Jim Legxacy - ten (Official Indian Lyric Visualiser)"),
    songKey("Fred again.. & Jozzy - ten (Official Video)"));
});

test("isMusic", () => {
  assert.ok(isMusic({ title: "Fred again.., Jozzy & Jim Legxacy - ten (Official Indian Lyric Visualiser)", duration: 190 }));
  assert.ok(!isMusic({ title: "Fred again.. - ten (Official Video)", duration: 45 }), "under 60 s");
  assert.ok(!isMusic({ title: "Fred again.. Boiler Room London", duration: 4300 }), "a set");
  assert.ok(!isMusic({ title: "USB002 tour film (Official Trailer)", duration: 120 }), "a trailer");
  assert.ok(!isMusic({ title: "Fred again.. interview with Zane Lowe", duration: 500 }), "an interview");
});

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseFeed, run } from "./new-music.mjs";

test("parseFeed reads the saved channel feed", () => {
  const items = parseFeed(readFileSync(new URL("./fixtures/channel-feed.xml", import.meta.url), "utf8"));
  assert.ok(items.length >= 1);
  for (const i of items) {
    assert.match(i.youtubeId, /^[\w-]{11}$/);
    assert.match(i.published, /^\d{4}-\d\d-\d\d$/);
    assert.ok(!/&amp;/.test(i.title), "entities decoded");
  }
  assert.ok(items.some((i) => i.youtubeId === "yWp0keR3l9Q" && i.title.includes("Jozzy & Jim Legxacy - ten")));
});

const CH = "UCXF6DMVLIVRr2OQAqyfEGeg";
const feedOf = (entries) => `<feed>${entries.map(([id, title, date]) =>
  `<entry><yt:videoId>${id}</yt:videoId><title>${title}</title><published>${date}T10:00:00+00:00</published></entry>`).join("")}</feed>`;
const watch = (len, date, ch = CH) => `x"lengthSeconds":"${len}"x"uploadDate":"${date}T01:00:00"x"channelId":"${ch}"x`;

function fakeFetch(pages, shorts = new Set()) {
  return async (url) => {
    const short = url.match(/\/shorts\/([\w-]{11})/);
    if (short) return shorts.has(short[1]) ? { status: 200, text: `{"videoId":"${short[1]}"}` } : { status: 303, text: "" };
    if (url.includes("feeds/videos.xml")) return { status: 200, text: pages.feed };
    const id = url.match(/v=([\w-]{11})/)?.[1];
    if (id && pages[id] !== undefined) return { status: 200, text: pages[id] };
    throw new Error(`unexpected ${url}`);
  };
}
const dir = (file) => {
  const d = mkdtempSync(join(tmpdir(), "nm-"));
  if (file) writeFileSync(join(d, "new-music.json"), JSON.stringify(file, null, 2) + "\n");
  return d;
};
const read = (d) => readFileSync(join(d, "new-music.json"), "utf8");

test("run adds new music, skips Shorts and other channels, and is idempotent", async () => {
  const d = dir({ checked: "2026-11-01", items: [] });
  const fetchText = fakeFetch({
    feed: feedOf([["aaaaaaaaaaa", "Fred again.. &amp; Jozzy - ten (Official Video)", "2026-11-18"],
      ["bbbbbbbbbbb", "ten #shorts", "2026-11-18"], ["ccccccccccc", "Someone else - ten", "2026-11-18"]]),
    aaaaaaaaaaa: watch(190, "2026-11-18"), ccccccccccc: watch(190, "2026-11-18", "UCxxxxxxxxxxxxxxxxxxxxxx"),
  }, new Set(["bbbbbbbbbbb"]));
  const added = await run({ fetchText, today: "2026-11-20", dataDir: d, known: new Set() });
  assert.deepEqual(added, ["Fred again.. & Jozzy - ten (Official Video)"]);
  const data = JSON.parse(read(d));
  assert.equal(data.items.length, 1);
  assert.deepEqual(data.items[0], { youtubeId: "aaaaaaaaaaa", title: "Fred again.. & Jozzy - ten (Official Video)",
    artist: "Fred again.. & Jozzy", song: "ten", duration: 190, published: "2026-11-18", addedAt: "2026-11-20" });
  const before = read(d);
  assert.deepEqual(await run({ fetchText, today: "2026-11-21", dataDir: d, known: new Set() }), []);
  assert.equal(read(d), before, "nothing new: file untouched");
});

test("run never writes after a failure", async () => {
  const d = dir({ checked: "2026-11-01", items: [] });
  const before = read(d);
  const feed = feedOf([["aaaaaaaaaaa", "Fred again.. - ten", "2026-11-18"]]);
  await assert.rejects(run({ fetchText: fakeFetch({ feed, aaaaaaaaaaa: "consent page" }), today: "2026-11-20", dataDir: d, known: new Set() }));
  await assert.rejects(run({ fetchText: async () => { throw new Error("offline"); }, today: "2026-11-20", dataDir: d, known: new Set() }));
  assert.equal(read(d), before);
});

test("first run takes music from the last 90 days of the Videos tab", async () => {
  const d = dir(null);
  const listVideos = async () => [
    { youtubeId: "ddddddddddd", title: "Fred again.. - new one", duration: 200 },
    { youtubeId: "eeeeeeeeeee", title: "Fred again.. - older one", duration: 200 },
    { youtubeId: "fffffffffff", title: "Fred again.. - too old", duration: 200 },
  ];
  const fetchText = fakeFetch({ ddddddddddd: watch(200, "2026-11-10"), eeeeeeeeeee: watch(200, "2026-08-27"), fffffffffff: watch(200, "2026-07-23") });
  const added = await run({ fetchText, today: "2026-11-20", dataDir: d, known: new Set(), listVideos });
  assert.deepEqual(added, ["Fred again.. - new one", "Fred again.. - older one"]);
  assert.ok(existsSync(join(d, "new-music.json")));
});

import { parseNewMusic, songGroups, pickVersion, newMusicPrograms, newMusicCatalogue, BLOCK_SIZE } from "../src/lib/new-music.ts";
import { LIVE_EPOCH } from "../src/lib/schedule.ts";

const item = (id, song, published, extra = {}) => ({ youtubeId: id, title: `Fred again.. - ${song}`, artist: "Fred again..", song,
  duration: 200, published, addedAt: "2026-11-20", ...extra });
const ten1 = item("tentententen".slice(0, 11), "ten", "2026-11-20", { title: "Fred again.., Jozzy & Jim Legxacy - ten (Official Indian Lyric Visualiser)", artist: "Fred again.., Jozzy & Jim Legxacy" });
const ten2 = item("ten2ten2ten", "Ten", "2026-11-01", { title: "Fred again.. & Jozzy - ten (Official Video)", artist: "Fred again.. & Jozzy", duration: 230 });

test("parseNewMusic keeps valid items and never throws", () => {
  assert.equal(parseNewMusic({ items: [ten1, { youtubeId: "x" }] }).length, 1);
  assert.deepEqual(parseNewMusic(null), []);
  assert.deepEqual(parseNewMusic({ items: "nope" }), []);
});

test("versions of one song form one group; groups run newest first", () => {
  const groups = songGroups([item("aaaaaaaaaaa", "older", "2026-10-01"), ten2, ten1]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].map((i) => i.youtubeId).sort(), [ten1.youtubeId, ten2.youtubeId].sort());
  assert.equal(groups[1][0].song, "older");
});

test("pickVersion is stable within a week and varies across weeks", () => {
  const group = [ten1, ten2];
  assert.equal(pickVersion(group, 5), pickVersion(group, 5));
  const seen = new Set(Array.from({ length: 21 }, (_, w) => pickVersion(group, w).youtubeId));
  assert.equal(seen.size, 2);
});

test("20 newest songs are the block; the rest graduate", () => {
  const items = Array.from({ length: 22 }, (_, i) =>
    item(`song${String(i).padStart(7, "0")}`, `song ${i}`, `2026-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`));
  const { fresh, graduated } = newMusicPrograms(items, LIVE_EPOCH + 100);
  assert.equal(BLOCK_SIZE, 20);
  assert.equal(fresh.length, 20);
  assert.equal(graduated.length, 2);
  assert.equal(fresh[0].entries[0].title, "song 21", "newest first");
  assert.equal(fresh[0].title, "New on the channel");
  assert.equal(graduated[0].title, "From the channel");
  const p = fresh[0];
  assert.equal(p.id, `new-${p.youtubeId}`);
  assert.equal(p.entries[0].art, `https://i.ytimg.com/vi/${p.youtubeId}/hqdefault.jpg`);
  assert.equal(p.entries[0].duration, p.duration);
});

test("newMusicCatalogue makes songs searchable", () => {
  const [c] = newMusicCatalogue([ten1]);
  assert.equal(c.kind, "song");
  assert.equal(c.song, "ten");
  assert.equal(c.youtubeId, ten1.youtubeId);
});

test("an upcoming premiere is skipped, not an error, and is picked up once it airs", async () => {
  const d = dir({ checked: "2026-11-01", items: [] });
  const feed = feedOf([["ggggggggggg", "Fred again.. - premiere", "2026-11-18"]]);
  assert.deepEqual(await run({ fetchText: fakeFetch({ feed, ggggggggggg: watch(0, "2026-11-18") }), today: "2026-11-20", dataDir: d, known: new Set() }), []);
  assert.deepEqual(await run({ fetchText: fakeFetch({ feed, ggggggggggg: watch(200, "2026-11-18") }), today: "2026-11-21", dataDir: d, known: new Set() }),
    ["Fred again.. - premiere"]);
});

test("channel uploads say where they came from, not a live room", () => {
  const { fresh } = newMusicPrograms([ten1], LIVE_EPOCH);
  assert.equal(fresh[0].entries[0].memory, "New on the official channel, posted 20 Nov 2026.");
  const items = Array.from({ length: 21 }, (_, i) => item(`song${String(i).padStart(7, "0")}`, `s${i}`, `2026-10-${String(i + 1).padStart(2, "0")}`));
  assert.equal(newMusicPrograms(items, LIVE_EPOCH).graduated[0].entries[0].memory, "From the official channel, posted 1 Oct 2026.");
});

test("a bad or empty feed fails the run instead of finding nothing", async () => {
  const d = dir({ checked: "2026-11-01", items: [] });
  const before = read(d);
  const opts = { today: "2026-11-20", dataDir: d, known: new Set() };
  await assert.rejects(run({ ...opts, fetchText: async () => ({ status: 200, text: "<html>consent</html>" }) }), /feed/);
  await assert.rejects(run({ ...opts, fetchText: async () => ({ status: 503, text: "" }) }), /feed/);
  await assert.rejects(run({ ...opts, dataDir: dir(null), fetchText: async () => ({ status: 200, text: "" }), listVideos: async () => [] }), /Videos tab/);
  assert.equal(read(d), before);
});

test("a bot-check page at /shorts is not taken for a Short", async () => {
  const d = dir({ checked: "2026-11-01", items: [] });
  const feed = feedOf([["hhhhhhhhhhh", "Fred again.. - real song", "2026-11-18"]]);
  const base = fakeFetch({ feed, hhhhhhhhhhh: watch(200, "2026-11-18") });
  const fetchText = async (url, init) => (url.includes("/shorts/") ? { status: 200, text: "<html>unusual traffic</html>" } : base(url, init));
  assert.deepEqual(await run({ fetchText, today: "2026-11-20", dataDir: d, known: new Set() }), ["Fred again.. - real song"]);
});

test("daily runs ignore old uploads still listed in the feed", async () => {
  const d = dir({ checked: "2026-11-19", items: [] });
  const feed = feedOf([["iiiiiiiiiii", "Fred again.. - new", "2026-11-19"], ["jjjjjjjjjjj", "Fred again.. - from july", "2026-07-31"]]);
  const fetchText = fakeFetch({ feed, iiiiiiiiiii: watch(200, "2026-11-19"), jjjjjjjjjjj: watch(200, "2026-07-31") });
  assert.deepEqual(await run({ fetchText, today: "2026-11-20", dataDir: d, known: new Set() }), ["Fred again.. - new"]);
});
