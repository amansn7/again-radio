import { parseLink, resolveLink } from "../lib/share.ts";
import { loadProgram } from "../lib/station.ts";
import { entryAt } from "../lib/schedule.ts";
import { videoProgram } from "../lib/live.ts";
import { slotAfter } from "../lib/rotation.ts";
import { isLiveNow, liveStreamProgram, type LiveStreamEvent } from "../lib/live-stream.ts";
import type { CueInfo } from "../lib/events.ts";
import { emitState, emitTrack, fit, setLabels } from "./player-emit.ts";
import type { RadioPlayer } from "./player.ts";

export const SETTLE_MS = 1500;
// Fades: long and unhurried when the station moves on by itself, short when the listener asks.
export const FADE_AUTO_MS = 1800;
export const FADE_USER_MS = 350;

/** Opens on a shared moment, else live. Returns the start offset. */
export function tuneStart(p: RadioPlayer): number {
  // A shared moment opens on that moment; anything unreadable just tunes to live.
  const link = parseLink(location.search);
  const linked = link && resolveLink(link, p.slots);
  let start: number;
  if (linked) {
    p.prog = linked.program;
    p.path = linked.path;
    offAir(p);
    p.shuffle.reset(linked.program.entries.length, entryAt(linked.program.entries, linked.offset)?.index ?? 0);
    start = linked.offset;
  } else if (p.liveStream && isLiveNow(p.liveStream)) {
    useLiveStream(p, p.liveStream);
    start = 0;
  } else {
    const at = p.liveNow();
    useSlot(p, at.index, at.cycle);
    start = at.offset;
  }
  if (link) history.replaceState(null, "", location.pathname);
  return start;
}

export function useLiveStream(p: RadioPlayer, stream: LiveStreamEvent): void {
  p.isLiveBroadcast = true;
  p.prog = liveStreamProgram(stream);
  p.path = `live:${stream.youtubeId}`;
  p.onSlot = -1;
  p.end = 86400 * 7;
}

function useSlot(p: RadioPlayer, index: number, cycle: number) {
  const s = p.slots[index];
  p.onSlot = index;
  p.cycle = cycle;
  p.prog = s.program;
  p.path = s.path;
  p.end = s.start + s.length;
}

/** Off the shared broadcast: this set plays to its end, then the station takes over again. */
function offAir(p: RadioPlayer) {
  p.live = false;
  p.isLiveBroadcast = false;
  p.onSlot = -1;
  p.end = p.prog.duration;
}

export function goLive(p: RadioPlayer, ms = FADE_USER_MS) {
  p.userPaused = false;
  p.live = true;
  p.shuffle.set(false, 0, -1);
  if (p.liveStream && isLiveNow(p.liveStream)) {
    p.fader.run(ms, () => {
      useLiveStream(p, p.liveStream!);
      load(p, 0);
    });
    return;
  }
  p.isLiveBroadcast = false;
  const at = p.liveNow();
  p.fader.run(ms, () => {
    useSlot(p, at.index, at.cycle);
    load(p, at.offset);
  });
}

function load(p: RadioPlayer, offset: number) {
  p.jockey.stop();
  const same = p.loaded === p.prog.youtubeId;
  p.loaded = p.prog.youtubeId;
  p.setAnchor(offset);
  if (same) {
    p.player?.seekTo(offset, true);
    p.player?.playVideo();
  } else {
    p.player?.loadVideoById({ videoId: p.prog.youtubeId, startSeconds: offset });
    void fit(p);
  }
  if (p.muted) p.player?.mute?.();
  else p.player?.unMute?.();
  setLabels(p);
  emitState(p);
  emitTrack(p);
}

export async function cue(p: RadioPlayer, d: CueInfo) {
  try {
    const path = "video" in d ? `video:${d.video.youtubeId}` : d.program;
    const prog =
      "video" in d
        ? videoProgram(d.video)
        : (p.slots.find((s) => s.path === path)?.program ?? (await loadProgram(path)));
    p.userPaused = false;
    p.fader.run(FADE_USER_MS, () => {
      p.prog = prog;
      p.path = path;
      offAir(p);
      p.shuffle.reset(prog.entries.length, entryAt(prog.entries, d.offset)?.index ?? 0);
      load(p, d.offset);
    });
  } catch {
    /* a bad cue must not take the station down */
  }
}

// Shuffle: the current set's tracks, current one first, nothing from other sets.
export function setShuffle(p: RadioPlayer, on: boolean) {
  const here = entryAt(p.prog.entries, p.position());
  if (on && (!here || p.prog.entries.length < 2)) return;
  p.shuffle.set(on, p.prog.entries.length, here?.index ?? -1);
  // Shuffling leaves the shared broadcast, but this set keeps playing where it is.
  if (on) offAir(p);
  emitState(p);
}

function playEntry(p: RadioPlayer, i: number, ms: number) {
  p.fader.run(ms, () => load(p, p.prog.entries[i].offset));
}

export function step(p: RadioPlayer, dir: 1 | -1) {
  const info = entryAt(p.prog.entries, p.position());
  if (!info) return;
  if (p.shuffle.on) {
    if (dir > 0) return nextShuffled(p, FADE_USER_MS);
    const back = info.elapsed > 3 ? undefined : p.shuffle.back();
    return playEntry(p, back ?? p.shuffle.picking, FADE_USER_MS);
  }
  const to = dir < 0 && info.elapsed > 3 ? info.index : info.index + dir;
  if (to < 0) return;
  if (to >= p.prog.entries.length) return advance(p, FADE_USER_MS);
  offAir(p);
  playEntry(p, to, FADE_USER_MS);
}

export function nextShuffled(p: RadioPlayer, ms: number) {
  const next = p.shuffle.next();
  if (next === undefined) return goLive(p, ms);
  playEntry(p, next, ms);
}

/** This stretch is over: the next track in the shuffle, else the next slot on air. */
export function advance(p: RadioPlayer, ms = FADE_AUTO_MS) {
  if (p.shuffle.on) return nextShuffled(p, ms);
  if (!p.live || p.onSlot < 0) return goLive(p, ms);
  let at = p.liveNow();
  // Ran out ahead of the wall clock (or this one is broken): take the next slot early.
  if (at.index === p.onSlot) at = slotAfter(p.slots, p.bad, p.onSlot, p.cycle);
  p.fader.run(ms, () => {
    useSlot(p, at.index, at.cycle);
    load(p, at.offset);
  });
}
