import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

test("jockey data schema and audio files exist", () => {
  const dataPath = path.join(ROOT, "public/data/jockey.json");
  assert.ok(fs.existsSync(dataPath), "jockey.json exists");

  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  assert.equal(data.station.jockey, "Rory", "Jockey name is Rory");
  assert.equal(data.station.gender, "female", "Jockey gender is female");
  assert.ok(data.station.duckVolume > 0 && data.station.duckVolume < 100, "Duck volume is between 0 and 100");

  for (const s of data.sweepers) {
    assert.ok(s.id && s.text, `Sweeper ${s.id} has id and text`);
    if (s.audio) {
      const audioPath = path.join(ROOT, "public", s.audio.replace(/^\//, ""));
      assert.ok(fs.existsSync(audioPath), `Audio file ${s.audio} exists on disk`);
      const stat = fs.statSync(audioPath);
      assert.ok(stat.size > 1000, `Audio file ${s.audio} is non-empty (${stat.size} bytes)`);
    }
  }

  for (const [title, track] of Object.entries(data.tracks)) {
    if (track.intro?.audio) {
      const audioPath = path.join(ROOT, "public", track.intro.audio.replace(/^\//, ""));
      assert.ok(fs.existsSync(audioPath), `Intro audio for ${title} exists`);
    }
    if (track.thought?.audio) {
      const audioPath = path.join(ROOT, "public", track.thought.audio.replace(/^\//, ""));
      assert.ok(fs.existsSync(audioPath), `Thought audio for ${title} exists`);
      const stat = fs.statSync(audioPath);
      assert.ok(stat.size > 1000, `Thought audio for ${title} is non-empty (${stat.size} bytes)`);
    }
    if (track.outro?.audio) {
      const audioPath = path.join(ROOT, "public", track.outro.audio.replace(/^\//, ""));
      assert.ok(fs.existsSync(audioPath), `Outro audio for ${title} exists`);
    }
  }

  for (const l of data.listeners ?? []) {
    assert.ok(l.id && l.text, `Listener clip ${l.id} has id and text`);
    if (l.audio) {
      const audioPath = path.join(ROOT, "public", l.audio.replace(/^\//, ""));
      assert.ok(fs.existsSync(audioPath), `Listener audio ${l.audio} exists`);
      const stat = fs.statSync(audioPath);
      assert.ok(stat.size > 1000, `Listener audio ${l.audio} is non-empty (${stat.size} bytes)`);
    }
  }

  for (const fact of data.facts) {
    assert.ok(fact.id && fact.text && fact.source, `Fact ${fact.id} has id, text, source`);
    assert.match(fact.source, /^https:\/\//, `Fact ${fact.id} source is https`);
    if (fact.audio) {
      const audioPath = path.join(ROOT, "public", fact.audio.replace(/^\//, ""));
      assert.ok(fs.existsSync(audioPath), `Fact audio ${fact.audio} exists`);
    }
  }
});

test("jockey ducking cubic ease-in-out math", () => {
  // Verify cubic ease curve bounds and values
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  assert.equal(ease(0.5), 0.5);
  assert.ok(ease(0.2) < 0.2, "ease-in is slower at start");
  assert.ok(ease(0.8) > 0.8, "ease-out is faster at end");

  // Ramping from 100 to 22:
  const from = 100;
  const to = 22;
  for (let k = 0; k <= 1; k += 0.1) {
    const vol = Math.round(from + (to - from) * ease(k));
    assert.ok(vol >= 22 && vol <= 100, `Volume ${vol} is within [22, 100]`);
  }
});

test("hitting the post: intro speeches wrap before vocals", () => {
  const dataPath = path.join(ROOT, "public/data/jockey.json");
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

  for (const [title, track] of Object.entries(data.tracks)) {
    if (track.postSeconds && track.intro) {
      // Average speaking rate: ~3 words per second (15 characters per second)
      const estimatedDurationSec = track.intro.text.length / 15;
      assert.ok(
        estimatedDurationSec < track.postSeconds,
        `Track ${title} intro duration (~${estimatedDurationSec.toFixed(1)}s) wraps before post (${track.postSeconds}s)`
      );
    }
  }
});

test("listener shoutouts and mid-song thoughts stay within 2000 credit bucket", () => {
  const dataPath = path.join(ROOT, "public/data/jockey.json");
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

  let bucketChars = 0;
  for (const l of data.listeners ?? []) {
    bucketChars += l.text.length;
  }
  for (const track of Object.values(data.tracks)) {
    if (track.thought) {
      bucketChars += track.thought.text.length;
    }
  }

  assert.ok(
    bucketChars <= 2000,
    `Dynamic listener & thought bucket characters (${bucketChars}) is within 2000 credits`
  );
  assert.ok(bucketChars >= 1500, `Dynamic bucket is well utilized (${bucketChars} chars)`);
});
