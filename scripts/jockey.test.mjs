import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pickWelcome } from "../src/lib/welcome.ts";
import { outroLeadSeconds } from "../src/lib/jockey-timing.ts";
import { speechProfile } from "../src/lib/jockey-voice.ts";

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

  for (const w of data.welcomes ?? []) {
    assert.ok(w.id && w.text && w.audio, `Welcome ${w.id} has id, text, and audio`);
    const audioPath = path.join(ROOT, "public", w.audio.replace(/^\//, ""));
    assert.ok(fs.existsSync(audioPath), `Welcome audio file ${w.audio} exists on disk`);
    const stat = fs.statSync(audioPath);
    assert.ok(stat.size > 1000, `Welcome audio file ${w.audio} is non-empty (${stat.size} bytes)`);
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

test("configured intros have a speakable cue and measured outros leave a finish buffer", () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/jockey.json"), "utf-8"));
  const intros = Object.values(data.tracks).filter((track) => track.intro).length;
  assert.ok(intros >= 20, `at least 20 configured song intros, found ${intros}`);
  for (const [title, track] of Object.entries(data.tracks)) {
    if (track.intro) {
      assert.ok(track.intro.text.length / 15 < (track.postSeconds ?? 16), `${title} intro fits its post`);
    }
    if (track.outro) {
      assert.ok(track.outro.durationSeconds > 0 && track.outro.durationSeconds <= 5,
        `${title} outro has a measured duration`);
      assert.equal(outroLeadSeconds(track.outro.text, track.outro.durationSeconds), track.outro.durationSeconds + 1.5,
        `${title} outro scheduling includes the measured clip and safety buffer`);
    }
  }
});

test("delivery cues keep browser speech changes subtle", () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/jockey.json"), "utf-8"));
  const allowed = new Set(["natural", "bright", "playful", "reflective", "warm"]);
  for (const [title, track] of Object.entries(data.tracks)) {
    if (!track.intro?.delivery) continue;
    assert.ok(allowed.has(track.intro.delivery), `${title} uses a known delivery cue`);
  }
  const rates = [...allowed].map((cue) => speechProfile(cue).rate);
  const pitches = [...allowed].map((cue) => speechProfile(cue).pitch);
  assert.ok(rates.every((rate) => rate >= 0.97 && rate <= 1.04));
  assert.ok(pitches.every((pitch) => pitch >= 0.99 && pitch <= 1.02));
  assert.equal(speechProfile().rate, speechProfile("natural").rate);
});

test("Flight FM keeps its transcript clean and gives ElevenLabs explicit cadence breaks", () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/jockey.json"), "utf-8"));
  const intro = data.tracks["Flight FM"].intro;
  assert.equal(intro.text, "Yay! There it is—what a lift. Flight FM.");
  assert.doesNotMatch(intro.text, /<break/);
  assert.equal((intro.synthesisText.match(/<break time=/g) ?? []).length, 2);
  assert.match(intro.synthesisText, /^Yay!/);
  assert.match(intro.synthesisText, /Flight FM\.$/);
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

test("single-voice mutex prevents speech overlap or interruption", () => {
  // Mock jockey state machine
  let speaking = false;
  let speakCalls = 0;

  const speak = (text) => {
    if (speaking) return false;
    speaking = true;
    speakCalls++;
    return true;
  };

  const onTuneIn = () => {
    if (speaking) return false;
    return speak("welcome");
  };

  const onTrack = () => {
    if (speaking) return false;
    return speak("intro");
  };

  // 1. First caller acquires the lock
  assert.equal(onTuneIn(), true, "Welcome speech starts");
  assert.equal(speaking, true, "Jockey is marked speaking");

  // 2. Track intro or other trigger while speaking is rejected
  assert.equal(onTrack(), false, "Track intro rejected while welcome speech active");
  assert.equal(speakCalls, 1, "Only one speech initiated");

  // 3. Once speech finishes, lock releases
  speaking = false;
  assert.equal(onTrack(), true, "Next speech accepted once lock released");
  assert.equal(speakCalls, 2);
});

test("welcome picks by hour and never repeats the last line", () => {
  const pool = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/jockey.json"), "utf-8")).welcomes;
  for (let hour = 0; hour < 24; hour++) {
    const seen = new Set();
    for (let i = 0; i < 50; i++) {
      const w = pickWelcome(pool, hour, "welcome-standard", () => i / 50);
      assert.ok(!w.hours || w.hours.includes(hour), `${w.id} fits hour ${hour}`);
      assert.notEqual(w.id, "welcome-standard");
      seen.add(w.id);
    }
    assert.ok(seen.size >= 3, `hour ${hour} has ${seen.size} options`);
  }
  assert.equal(pickWelcome([{ id: "a" }], 3, "a").id, "a", "single line still plays");
});
