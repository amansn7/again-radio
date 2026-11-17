import type { Program, ProgramEntry } from "../lib/station.ts";

// Lock screen and system media keys. Browsers route these to whichever frame owns the media,
// so where the embed's own session wins this is a harmless no-op.
const ms = typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null;

export function bindSession(a: { play(): void; pause(): void; next(): void; prev(): void }) {
  if (!ms) return;
  const set = (k: MediaSessionAction, fn: () => void) => {
    try {
      ms.setActionHandler(k, fn);
    } catch {
      /* action not supported here */
    }
  };
  set("play", a.play);
  set("pause", a.pause);
  set("stop", a.pause);
  set("nexttrack", a.next);
  set("previoustrack", a.prev);
}

export function setSession(p: Program, e: ProgramEntry) {
  if (!ms || typeof MediaMetadata === "undefined") return;
  const thumb = `https://i.ytimg.com/vi/${p.youtubeId}/hqdefault.jpg`;
  ms.metadata = new MediaMetadata({
    title: e.title ?? (e.type === "id" ? "Unreleased ID" : p.title),
    artist: e.artist ?? "Fred again..",
    album: p.title,
    artwork: [
      ...(e.art ? [{ src: e.art.replace(/\/\d+x\d+bb\./, "/512x512bb."), sizes: "512x512" }] : []),
      { src: thumb, sizes: "480x360", type: "image/jpeg" },
    ],
  });
}

export function setSessionPlaying(playing: boolean) {
  if (ms) ms.playbackState = playing ? "playing" : "paused";
}
