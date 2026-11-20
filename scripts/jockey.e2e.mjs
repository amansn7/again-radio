#!/usr/bin/env node
// End-to-end check for Rory in a real browser: ducking, never muting, no overlaps, no stuck states.
//   npm run build && npm run preview   (in another shell)
//   node scripts/jockey.e2e.mjs http://localhost:4321          (YouTube played by the test)
//   node scripts/jockey.e2e.mjs https://again-radio.pages.dev  (real YouTube playback)
import { chromium } from "playwright-core";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const url = process.argv[2] ?? "http://localhost:4321";
// YouTube refuses to play for automated browsers on localhost; on the real domain it plays for real.
const REAL = !/localhost|127\.0\.0\.1/.test(url);
const cache = join(process.env.HOME ?? "", "Library/Caches/ms-playwright");
const exe = readdirSync(cache)
  .filter((d) => d.startsWith("chromium_headless_shell-"))
  .sort()
  .reverse()
  .map((d) => join(cache, d, "chrome-headless-shell-mac-x64", "chrome-headless-shell"))
  .find((p) => existsSync(p));

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failures.push(msg);
};

await page.addInitScript(() => {
  const log = (window.__rj = { events: [], samples: [], played: [] });
  const live = new Set();
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    if (this instanceof HTMLAudioElement && !this.muted) {
      live.add(this);
      log.played.push(this.src.split("/").pop());
      const off = () => live.delete(this);
      this.addEventListener("pause", off, { once: true });
      this.addEventListener("ended", off, { once: true });
    }
    return play.apply(this, args);
  };
  const t0 = performance.now();
  const yt = () => document.querySelector("radio-player")?.player?.getPlayerState?.();
  const held = () => document.querySelector("radio-player")?.awaitingPlay;
  // The YouTube state at the instant Rory starts: 1 means the listener can already hear the track.
  document.addEventListener("radio:jockey:speak", (e) => log.events.push(["speak", performance.now() - t0, e.detail.text, yt(), held()]));
  document.addEventListener("radio:jockey:end", () => log.events.push(["end", performance.now() - t0]));
  document.addEventListener("radio:track", (e) => log.events.push(["track", performance.now() - t0, e.detail.entry.title, yt(), held()]));
  setInterval(() => {
    const p = document.querySelector("radio-player");
    if (!p?.jockey) return;
    log.samples.push({
      t: performance.now() - t0,
      vol: p.fader.volume,
      changing: p.fader.busy,
      muted: p.muted,
      speaking: p.jockey.speaking,
      ytVol: p.player?.getVolume?.(),
      ytMuted: p.player?.isMuted?.(),
      voices: [...live].filter((a) => !a.paused).length + (speechSynthesis.speaking ? 1 : 0),
    });
  }, 50);
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("#rp-tune", { state: "visible", timeout: 15_000 });
await page.waitForFunction(() => document.querySelector("radio-player")?.jockey);
// Headless Chromium cannot play YouTube (it asks automated browsers to sign in), so the test plays
// YouTube's part: window.__yt is the player state the station reads (1 = playing, 3 = buffering).
if (!REAL) await page.evaluate(() => {
  window.__yt = 1;
  const p = document.querySelector("radio-player");
  p.player.getPlayerState = () => window.__yt;
  p.player.getCurrentTime = () => p.anchor + (window.__yt === 1 ? (Date.now() - p.anchorAt) / 1000 : 0);
});
console.log(REAL ? "mode: real YouTube playback" : "mode: YouTube played by the test");
await page.click("#rp-tune");

const rj = () => page.evaluate(() => window.__rj);
const waitFor = (fn, ms = 20_000) => page.waitForFunction(fn, null, { timeout: ms, polling: 50 }).then(() => true, () => false);
const mark = () => page.evaluate(() => window.__rj.samples.length);

// 1. Welcome on tune-in: ducks, never mutes, swells back to full.
check(await waitFor(() => window.__rj.events.some((e) => e[0] === "speak")), "welcome starts after tune-in");
check(await waitFor(() => document.querySelector("radio-player").jockey.speaking === false && window.__rj.events.some((e) => e[0] === "end"), 30_000), "welcome finishes");
await page.waitForTimeout(600);
let log = await rj();
const during = log.samples.filter((s) => s.speaking);
check(during.length > 0 && Math.min(...during.slice(Math.floor(during.length / 3)).map((s) => s.vol)) <= 30, "music ducked under Rory, not muted");
let silentFrom = null, longestSilence = 0;
for (const x of during) {
  if (x.vol === 0 && !x.changing) longestSilence = Math.max(longestSilence, x.t - (silentFrom ??= x.t));
  else silentFrom = null;
}
check(longestSilence < 300, `music never sits silent under Rory outside a crossfade (longest ${Math.round(longestSilence)}ms)`);
check(log.samples.at(-1).vol === 100, `music back to full after Rory (${log.samples.at(-1).vol})`);
const tunedAt = log.events.find((e) => e[0] === "speak")[1];
check(log.samples.filter((s) => s.t > tunedAt).every((s) => !s.muted), "YouTube never muted by the jockey");
check(during.some((s) => s.voices === 1), "Rory's voice actually plays");
check(log.played.some((f) => f.endsWith(".mp3")), `welcome is the ElevenLabs MP3, not browser speech (${log.played.join(", ")})`);
check(log.samples.every((s) => s.voices <= 1), "never two voices at once");
if (REAL) {
  // YouTube reports volume and mute through its iframe ~150ms late; judge once the duck has landed.
  const voiced = log.samples.filter((s) => s.voices === 1 && s.t > tunedAt + 500).map((s) => s.ytVol);
  check(voiced.length > 20 && Math.max(...voiced) <= 30 && Math.min(...voiced) > 0, `YouTube's own volume is lowered, not silenced, while Rory's voice plays (${Math.min(...voiced)}–${Math.max(...voiced)})`);
  check(log.samples.at(-1).ytVol >= 95, `YouTube's own volume back to full (${log.samples.at(-1).ytVol})`);
  check(log.samples.filter((s) => s.t > tunedAt + 500).every((s) => s.ytMuted === false), "YouTube player never muted after tune-in");
}

const speak = (text, audio) =>
  page.evaluate(([t, a]) => void document.querySelector("radio-player").jockey.speak(t, a), [text, audio]);
const CLIP = "/audio/jockey/welcome.mp3";

// 2. An automatic change (video ended → advance → crossfade → load) does not cut Rory off; music ends at full.
await speak("auto change test", CLIP);
await waitFor(() => document.querySelector("radio-player").jockey.speaking);
let from = await mark();
let tracksBefore = (await rj()).events.filter((e) => e[0] === "track").length;
if (REAL) {
  await page.evaluate(() => { const y = document.querySelector("radio-player").player; y.seekTo(y.getDuration() - 1, true); }); // play out the video
} else {
  await page.evaluate(() => (window.__yt = 0)); // the player tick sees ENDED and advances, as at the end of a set
}
check(await waitFor(() => document.querySelector("radio-player").awaitingPlay, 12_000), "station advanced on its own");
if (!REAL) await page.evaluate(() => (window.__yt = 1)); // the next video starts playing
const advanced = await waitFor(`window.__rj.events.filter((e) => e[0] === "track").length > ${tracksBefore}`, 15_000);
check(advanced, "next track announced once it plays");
log = await rj();
check(log.samples.slice(from).every((s) => s.speaking), "automatic change lets Rory keep talking");
check(await waitFor(() => !document.querySelector("radio-player").jockey.speaking, 20_000), "clip ends on its own");
check(await waitFor(() => !document.querySelector("radio-player").fader.busy && document.querySelector("radio-player").fader.volume === 100, 6000), "music full after automatic change + clip");

// 3. A listener's skip cuts Rory cleanly: no stuck duck, no leftover voice.
await speak("skip test", CLIP);
await waitFor(() => document.querySelector("radio-player").jockey.speaking);
await page.waitForTimeout(500);
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press("ArrowRight");
check(await waitFor(() => !document.querySelector("radio-player").jockey.speaking, 1500), "skip key stops Rory at once");
await page.waitForTimeout(200);
log = await rj();
check(log.samples.at(-1).voices === 0, "skip leaves no voice playing");
// The next track may get its own intro once audible; either way the music ends at full.
await waitFor(() => !document.querySelector("radio-player").jockey.speaking && !document.querySelector("radio-player").fader.busy && document.querySelector("radio-player").fader.volume === 100, 20_000);
check(await page.evaluate(() => document.querySelector("radio-player").fader.volume) === 100, "music full after skip");

// 4. A stale clip's cleanup never unlocks the next clip.
await speak("stale A", CLIP);
await page.waitForTimeout(400);
await page.evaluate(() => document.querySelector("radio-player").jockey.stop());
await speak("fresh B", CLIP);
await page.waitForTimeout(1500);
check(await page.evaluate(() => document.querySelector("radio-player").jockey.speaking), "newer clip keeps the lock after an old clip is stopped");
from = await mark();
await waitFor(() => !document.querySelector("radio-player").jockey.speaking, 20_000);
log = await rj();
check(log.samples.slice(from).every((s) => s.voices <= 1), "no overlap between stopped and new clip");

// 5. Mute mid-clip stops Rory and restores volume; unmute does not replay the welcome.
await speak("mute test", CLIP);
await waitFor(() => document.querySelector("radio-player").jockey.speaking);
await page.click("#rp-sound");
await page.waitForTimeout(300);
log = await rj();
check(!log.samples.at(-1).speaking && log.samples.at(-1).voices === 0, "mute silences Rory at once");
const speaksBefore = log.events.filter((e) => e[0] === "speak").length;
await page.click("#rp-sound");
await page.waitForTimeout(1500);
log = await rj();
check(log.events.filter((e) => e[0] === "speak").length === speaksBefore, "unmute does not replay the welcome");
check(log.samples.at(-1).vol === 100, `music full after mute/unmute (${log.samples.at(-1).vol})`);

// 5b. A search jump: no track announced and Rory silent until the new video is audible.
await waitFor(() => !document.querySelector("radio-player").jockey.speaking, 20_000);
let n0 = (await rj()).events.length;
await page.evaluate(() => {
  if (window.__yt) window.__yt = 3;
  document.dispatchEvent(new CustomEvent("radio:cue", { detail: { program: "programs/boiler-room-london.json", offset: 382 } }));
});
if (!REAL) {
  await page.waitForTimeout(3500);
  log = await rj();
  check(log.events.slice(n0).every((e) => e[0] !== "speak"), "Rory stays silent while the video is buffering");
  check(log.events.slice(n0).every((e) => !(e[0] === "track" && /Danielle/.test(e[2]))), "the new track is not announced before it plays");
  await page.evaluate(() => (window.__yt = 1));
}
check(await waitFor(`window.__rj.events.slice(${n0}).some((e) => e[0] === "track" && /Danielle/.test(e[2]))`, 15_000), "track announced once playback starts");
// Entering a new set, the set's own handover takes the place of the track intro.
check(await waitFor(`window.__rj.events.slice(${n0}).some((e) => e[0] === "speak" && /Danielle|Boiler/.test(e[2]))`, 8000), "Rory speaks once it is audible");
log = await rj();
check(log.events.slice(n0).filter((e) => e[0] !== "end").every((e) => e[3] === 1 && !e[4]), `every announcement after the jump happened with YouTube playing (${JSON.stringify(log.events.slice(n0).map((e) => [e[0], e[3]]))})`);
await waitFor(() => !document.querySelector("radio-player").jockey.speaking, 20_000);

// 6. A real jump into a set: Rory speaks the set transition or the track intro, music lands at full
//    (the old silent-station bug).
let n = (await rj()).events.length;
await page.evaluate(() => document.dispatchEvent(new CustomEvent("radio:cue", { detail: { program: "programs/boiler-room-london.json", offset: 142 } })));
check(await waitFor(`window.__rj.events.slice(${n}).some((e) => e[0] === "speak" && /Kammy|Boiler/i.test(e[2]))`, 8000), "jump into a set plays its transition or intro");
check(await waitFor(() => !document.querySelector("radio-player").jockey.speaking, 20_000), "it finishes");
await page.waitForTimeout(1500);
log = await rj();
check(log.samples.at(-1).vol === 100, `music full after jump + speech (${log.samples.at(-1).vol})`);

// 7. Mid-song thought fires from live playback time (fed as the player's tick would).
n = (await rj()).events.length;
await page.evaluate(() => {
  const j = document.querySelector("radio-player").jockey;
  j.lastSpokeTime = 0;
  const entry = { title: "Kammy (like i do)", offset: 142, duration: 240 };
  void j.onTime({ current: 142 + 68.5, exact: 142 + 68.5, duration: 4305 }, { programId: "boiler-room-london", entry, elapsed: 0, progress: 0 });
});
check(await waitFor(`window.__rj.events.slice(${n}).some((e) => e[0] === "speak")`, 3000), "mid-song thought fires at its offset");
await waitFor(() => !document.querySelector("radio-player").jockey.speaking, 20_000);
await page.waitForTimeout(800);
log = await rj();
check(log.samples.at(-1).vol === 100, `music full after thought (${log.samples.at(-1).vol})`);
check(log.samples.every((s) => s.voices <= 1), "never two voices across the whole run");

// 8. A stalled MP3 is abandoned: one voice at a time, the music comes back, nothing starts late.
await page.route("**/stall.mp3", () => {}); // never answers
await waitFor(() => !document.querySelector("radio-player").jockey.speaking, 20_000);
from = await mark();
await speak("stall test", "/audio/jockey/stall.mp3");
check(await waitFor(() => !document.querySelector("radio-player").jockey.speaking, 20_000), "stalled clip is given up, not left hanging");
check(await waitFor(() => document.querySelector("radio-player").fader.volume === 100, 3000), "music full after a stalled clip");
await page.waitForTimeout(1000);
log = await rj();
check(log.samples.slice(from).every((s) => s.voices <= 1), "stalled clip never overlaps the fallback voice");

// Across the whole run, nothing Rory chose to say started before YouTube was audibly playing.
log = await rj();
const scheduled = log.events.filter((e) => e[0] === "speak" && !/test|stale|fresh/.test(e[2]));
check(scheduled.length >= 3 && scheduled.every((e) => e[3] === 1 && !e[4]), `Rory only ever starts over audible music (${scheduled.length} lines, states ${[...new Set(scheduled.map((e) => e[3]))]})`);

// 9. Tapping the orb makes it dance (disco ball); it never asks Rory to talk.
await waitFor(() => !document.querySelector("radio-player").jockey.speaking, 20_000);
n = (await rj()).events.length;
await page.evaluate(() => document.querySelector(".mc-orb-btn").click());
check(await waitFor(() => document.querySelector(".disco-stage"), 4000), "orb tap starts the disco ball");
await page.waitForTimeout(800);
check((await rj()).events.slice(n).every((e) => e[0] !== "speak"), "orb tap does not make Rory speak");

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nall jockey e2e checks passed");
