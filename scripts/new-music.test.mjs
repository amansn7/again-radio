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
