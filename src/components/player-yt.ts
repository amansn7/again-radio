import { entryAt } from "../lib/schedule.ts";
import { RADIO_TIME } from "../lib/events.ts";
import type { YTPlayer } from "../lib/yt.ts";
import { emitState, emitTrack, setLabels } from "./player-emit.ts";
import { advance, goLive, nextShuffled, FADE_AUTO_MS, SETTLE_MS } from "./player-nav.ts";
import type { RadioPlayer } from "./player.ts";

const DRIFT = 8;

export function createPlayer(YT: Window["YT"], p: RadioPlayer, start: number): YTPlayer {
  return new YT.Player(p.querySelector<HTMLElement>("#rp-yt")!, {
    videoId: p.prog.youtubeId,
    playerVars: {
      enablejsapi: 1, controls: 0, modestbranding: 1, rel: 0, playsinline: 1,
      autoplay: 1, mute: 1, cc_load_policy: 0, iv_load_policy: 3, disablekb: 1,
      start, origin: window.location.origin,
    },
    events: {
      onReady: () => {
        if (!p.muted) p.player?.unMute?.();
        p.player?.setVolume?.(p.fader.volume);
        p.player?.playVideo();
        setLabels(p);
        emitState(p);
        emitTrack(p);
        p.ticker = setInterval(() => tick(p), 250);
      },
      onStateChange: (e) => {
        const playing = e.data === 1 || e.data === 3;
        if (e.data === 1) {
          p.setHidden(".rp-tuning", true);
          // auto-captions cover the picture; the memory line is the caption here
          p.player?.unloadModule?.("captions");
          p.errors = 0;
          p.setHidden(".rp-error", true);
          delete p.dataset.novideo;
          p.fader.onPlaying();
        }
        if (playing !== p.playing) {
          p.playing = playing;
          emitState(p);
        }
        if (e.data === 0 && Date.now() - p.anchorAt > SETTLE_MS) advance(p);
        // Retry a browser-imposed pause while hidden; the browser may still suspend us.
        if (e.data === 2 && document.hidden && !p.userPaused) p.player?.playVideo();
      },
      // Not embeddable here, removed, or blocked: skip it rather than go silent.
      onError: () => {
        p.dataset.novideo = "";
        p.bad.add(p.prog.youtubeId);
        // A seek on the broken player never errors again, so the next load must be a real one.
        p.loaded = "";
        if (++p.errors >= 3) {
          p.setHidden(".rp-tuning", true);
          p.setHidden(".rp-error", false);
          return;
        }
        // Shuffle and off-air picks stay inside this broken video; live skips it.
        goLive(p, FADE_AUTO_MS);
      },
    },
  });
}

function tick(p: RadioPlayer) {
  if (!p.player) return;
  const exact = p.position();
  const current = Math.floor(exact);
  if (!document.hidden) {
    document.dispatchEvent(
      new CustomEvent(RADIO_TIME, { detail: { current, exact, duration: p.prog.duration } }),
    );
  }
  if (Date.now() - p.anchorAt < SETTLE_MS || p.fader.busy) return;
  // ENDED inside the settle window is ignored as possibly stale; if it was real, the state still says so.
  if (p.player.getPlayerState?.() === 0) return advance(p);
  if (p.playing) {
    const lead = document.hidden ? 0 : FADE_AUTO_MS / 1000;
    if (p.shuffle.on) {
      const info = entryAt(p.prog.entries, exact);
      // Ticks can skip the fade window (hidden tab, slow device): crossing into the next entry counts too.
      if (info && (info.index !== p.shuffle.picking || exact >= info.entry.offset + info.entry.duration - lead)) {
        return nextShuffled(p, FADE_AUTO_MS);
      }
    } else if (exact >= p.end - lead) return advance(p);
    if (p.live && !document.hidden) {
      const at = p.liveNow();
      if (at.index === p.onSlot && Math.abs(current - at.offset) > DRIFT) return goLive(p);
    }
  }
  emitTrack(p);
}
