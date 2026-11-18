import { entryAt } from "../lib/schedule.ts";
import { creditText, stampText } from "../lib/live.ts";
import { videoFill } from "../lib/frame.ts";
import { setSession, setSessionPlaying } from "./media-session.ts";
import { RADIO_STATE, RADIO_TRACK } from "../lib/events.ts";
import type { StateInfo, TrackInfo } from "../lib/events.ts";
import type { RadioPlayer } from "./player.ts";

export function emitTrack(p: RadioPlayer) {
  const t = Math.floor(p.position());
  const info = entryAt(p.prog.entries, t);
  if (!info) return;
  const key = `${p.path}#${info.index}`;
  if (key === p.lastKey) return;
  p.lastKey = key;
  setSession(p.prog, info.entry);
  const detail: TrackInfo = {
    programId: p.prog.id,
    programPath: p.path,
    youtubeId: p.prog.youtubeId,
    programTitle: p.prog.title,
    programDuration: p.prog.duration,
    venue: p.prog.venue,
    date: p.prog.date,
    entries: p.prog.entries,
    entry: info.entry,
    index: info.index,
    elapsed: info.elapsed,
    progress: info.progress,
  };
  document.dispatchEvent(new CustomEvent(RADIO_TRACK, { detail }));
}

export function emitState(p: RadioPlayer) {
  const detail: StateInfo = {
    playing: p.playing, muted: p.muted, live: p.live, shuffle: p.shuffle.on,
  };
  Object.entries(detail).forEach(([k, v]) => (p.dataset[k] = String(v)));
  setSessionPlaying(p.playing);
  p.querySelector("#rp-play")?.setAttribute("aria-label", p.playing ? "Pause" : "Play");
  p.querySelector("#rp-sound")?.setAttribute("aria-label", p.muted ? "Unmute" : "Mute");
  const sh = p.querySelector<HTMLButtonElement>("#rp-shuffle");
  if (sh) {
    sh.setAttribute("aria-pressed", String(p.shuffle.on));
    sh.disabled = p.prog.entries.length < 2;
  }
  document.dispatchEvent(new CustomEvent(RADIO_STATE, { detail }));
}

export function setLabels(p: RadioPlayer) {
  const credit = p.querySelector(".rp-credit");
  if (credit) credit.textContent = creditText(p.prog);
  const stamp = p.querySelector<HTMLElement>(".rp-stamp");
  if (stamp) stamp.textContent = stampText(p.prog.date);
  const iframe = p.querySelector("iframe");
  if (iframe) iframe.title = `Fred again.. ${p.prog.title}`;
}

/** Scale the embed so the picture, not YouTube's black bars, covers the screen. */
export async function fit(p: RadioPlayer) {
  const id = p.prog.youtubeId;
  const f = await videoFill(id);
  if (id !== p.prog.youtubeId) return;
  const s = p.querySelector<HTMLElement>(".rp-screen")!.style;
  s.setProperty("--rp-fx", String(f.x));
  s.setProperty("--rp-fy", String(f.y));
  s.setProperty("--rp-a", String((16 * f.x) / (9 * f.y)));
}
