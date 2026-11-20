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
    if (short) return { status: shorts.has(short[1]) ? 200 : 303, text: "" };
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
