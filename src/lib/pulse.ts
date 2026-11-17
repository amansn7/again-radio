import { RADIO_STATE, RADIO_TIME, RADIO_TRACK } from "./events.ts";
import type { StateInfo, TimeInfo, TrackInfo } from "./events.ts";
import type { ProgramEntry } from "./station.ts";

// The audio lives in a cross-origin YouTube iframe, so it cannot be analysed (and must not be
// proxied). Motion is driven by the playback clock on the track's beat grid instead.
const FALLBACK_BPM = 124;
const RESYNC_S = 0.08;

export interface Beat {
  kick: number; // 1 on the beat, decaying
  hat: number; // 1 on the off-beat, decaying faster
  swell: number; // 0..1 over a 16-beat phrase
  env: number; // fades in at the start of a track and out at its end
}

const REST: Beat = { kick: 0, hat: 0, swell: 0.5, env: 0 };

/** Envelopes `since` seconds into an entry; the grid starts at the entry's offset. */
export function beatAt(since: number, bpm: number, duration: number): Beat {
  if (bpm <= 0 || since < 0) return REST;
  const beats = (since * bpm) / 60;
  const phase = beats - Math.floor(beats);
  return {
    kick: Math.exp(-phase * 7),
    hat: Math.exp(-((phase + 0.5) % 1) * 12),
    swell: 0.5 + 0.5 * Math.sin((beats / 16) * Math.PI * 2),
    env: Math.max(0, Math.min(1, since / 6, (duration - since) / 4)),
  };
}

let entry: ProgramEntry | null = null;
let exact = 0;
let at = 0;
let playing = false;
let raf = 0;
let still: MediaQueryList | null = null;
const subs = new Set<(b: Beat) => void>();

const now = () => (playing ? exact + (performance.now() - at) / 1000 : exact);
const anchor = (t: number) => {
  exact = t;
  at = performance.now();
};

function frame() {
  raf = 0;
  if (document.hidden || still?.matches || !subs.size) return;
  const e = entry;
  const b = e && playing ? beatAt(now() - e.offset, e.type === "interlude" ? 0 : (e.bpm ?? FALLBACK_BPM), e.duration) : REST;
  subs.forEach((fn) => fn(b));
  raf = requestAnimationFrame(frame);
}

const start = () => {
  if (!raf) raf = requestAnimationFrame(frame);
};

function wire() {
  still = matchMedia("(prefers-reduced-motion: reduce)");
  still.addEventListener("change", start);
  document.addEventListener("visibilitychange", start);
  document.addEventListener(RADIO_TRACK, (e) => (entry = (e as CustomEvent<TrackInfo>).detail.entry));
  document.addEventListener(RADIO_TIME, (e) => {
    const t = (e as CustomEvent<TimeInfo>).detail.exact;
    if (Math.abs(now() - t) > RESYNC_S) anchor(t);
  });
  document.addEventListener(RADIO_STATE, (e) => {
    const t = now();
    playing = (e as CustomEvent<StateInfo>).detail.playing;
    anchor(t);
  });
}

/** Called every frame while the tab is visible and motion is allowed. */
export function onPulse(fn: (b: Beat) => void): void {
  if (!still) wire();
  subs.add(fn);
  start();
}
