import { isLiveNow, liveStreamProgram, watchLiveStream, type LiveStreamEvent } from "../lib/live-stream.ts";
import { RADIO_LIVE_STREAM, RADIO_TOAST } from "../lib/events.ts";
import { emitState, emitTrack, fit, setLabels } from "./player-emit.ts";
import { goLive, FADE_AUTO_MS } from "./player-nav.ts";
import type { RadioPlayer } from "./player.ts";

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(root: HTMLElement, message: string): void {
  const toast = root.querySelector<HTMLElement>(".rp-toast") ?? document.querySelector<HTMLElement>(".rp-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
    toastTimer = undefined;
  }, 3500);
}

export function startLiveBroadcast(p: RadioPlayer, stream: LiveStreamEvent, fade = true): void {
  if (!stream.youtubeId) return;
  p.isLiveBroadcast = true;
  p.userPaused = false;
  p.live = true;
  p.shuffle.set(false, 0, -1);
  const prog = liveStreamProgram(stream);

  const apply = () => {
    p.prog = prog;
    p.path = `live:${stream.youtubeId}`;
    p.onSlot = -1;
    p.end = 86400 * 7;
    p.loaded = stream.youtubeId!;
    p.setAnchor(0);
    p.player?.loadVideoById({ videoId: stream.youtubeId!, startSeconds: 0 });
    p.player?.playVideo();
    if (p.muted) p.player?.mute?.();
    else p.player?.unMute?.();
    setLabels(p);
    emitState(p);
    emitTrack(p);
    void fit(p);
    showToast(p, `🔴 Fred again.. is now live: ${stream.title ?? "Live Stream"}`);
  };

  if (fade) {
    p.fader.run(FADE_AUTO_MS, apply);
  } else {
    apply();
  }
}

export function endLiveBroadcast(p: RadioPlayer): void {
  if (!p.isLiveBroadcast) return;
  p.isLiveBroadcast = false;
  showToast(p, "Live broadcast ended · Returning to Again Radio");
  goLive(p);
}

export function bindLiveBroadcast(p: RadioPlayer, signal: AbortSignal): void {
  const stopWatch = watchLiveStream((stream) => {
    p.liveStream = stream;
    if (p.live && !p.isLiveBroadcast && isLiveNow(stream)) {
      startLiveBroadcast(p, stream, true);
    } else if (p.isLiveBroadcast && stream.status === "offline") {
      endLiveBroadcast(p);
    }
  });

  signal.addEventListener("abort", () => stopWatch());

  document.addEventListener(
    RADIO_LIVE_STREAM,
    (e) => {
      const stream = (e as CustomEvent<LiveStreamEvent>).detail;
      p.liveStream = stream;
      if (p.live && !p.isLiveBroadcast && isLiveNow(stream)) {
        startLiveBroadcast(p, stream, true);
      }
    },
    { signal },
  );

  document.addEventListener(
    RADIO_TOAST,
    (e) => {
      const msg = (e as CustomEvent<{ message: string }>).detail.message;
      if (msg) showToast(p, msg);
    },
    { signal },
  );
}
