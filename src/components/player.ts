import { loadYT } from "../lib/yt.ts";
import { tuneIn, type Point } from "./tune-in.ts";
import { loadSlots, onAirNow, type Slot } from "../lib/rotation.ts";
import { SetShuffle } from "../lib/set-shuffle.ts";
import { bindKeys } from "./transport.ts";
import { Fader } from "./fader.ts";
import { bindSession } from "./media-session.ts";
import type { Program } from "../lib/station.ts";
import type { YTPlayer } from "../lib/yt.ts";
import {
  RADIO_CUE,
  RADIO_LIVE,
  RADIO_TRACK,
  RADIO_TIME,
  lastTrack,
  type TrackInfo,
  type TimeInfo
} from "../lib/events.ts";
import type { CueInfo } from "../lib/events.ts";
import { bindWake, rescueFocus } from "./player-wake.ts";
import { emitState, fit } from "./player-emit.ts";
import { cue, goLive, setShuffle, step, tuneStart, SETTLE_MS } from "./player-nav.ts";
import { createPlayer } from "./player-yt.ts";
import { fetchLiveStream, type LiveStreamEvent } from "../lib/live-stream.ts";
import { bindLiveBroadcast } from "./player-live.ts";
import { RadioJockey } from "../lib/jockey.ts";
import { watchListeners } from "./listeners.ts";

// State lives here; player-nav (what plays), player-yt (embed + clock), player-emit (events,
// labels) and player-wake (gesture, focus) act on it.
export class RadioPlayer extends HTMLElement {
  player: YTPlayer | null = null;
  slots: Slot[] = [];
  onSlot = -1;
  cycle = 0;
  prog!: Program;
  path = "";
  /** Video seconds where this stretch hands over to the next. */
  end = 0;
  live = true;
  liveStream: LiveStreamEvent | null = null;
  isLiveBroadcast = false;
  shuffle = new SetShuffle();
  bad = new Set<string>();
  errors = 0;
  fader = new Fader((v) => this.player?.setVolume?.(v), () => this.playing);
  jockey = new RadioJockey(
    (pct) => this.fader.duck(pct),
    () => this.muted
  );
  loaded = "";
  // Browsers block sound until a gesture, so the station starts muted and the first
  // click or key anywhere turns it up. An explicit mute/unmute cancels that.
  private wake = new AbortController();
  muted = true;
  private tap: Point | undefined;
  playing = false;
  userPaused = false;
  lastKey = "";
  private anchor = 0;
  anchorAt = 0;
  ticker: ReturnType<typeof setInterval> | null = null;
  private ac = new AbortController();

  connectedCallback() {
    this.ac = new AbortController();
    // Listen before YouTube loads: the first tap usually lands while it is still loading.
    const wakeSignal = AbortSignal.any([this.ac.signal, this.wake.signal]);
    bindWake(this, wakeSignal, (t) => (this.tap = t), () => this.startFromGesture());
    rescueFocus(this, this.ac.signal);
    this.init().catch((err: unknown) => {
      console.error("[radio-player]", err instanceof Error ? err.message : String(err));
      this.setHidden(".rp-tuning", true);
      this.setHidden(".rp-error", false);
    });
  }

  disconnectedCallback() {
    this.ac.abort();
    this.wake = new AbortController();
    if (this.ticker !== null) clearInterval(this.ticker);
    this.jockey.stop();
    this.fader.stop();
    this.player?.destroy();
  }

  setHidden(sel: string, hidden: boolean) {
    const el = this.querySelector<HTMLElement>(sel);
    if (el) el.hidden = hidden;
  }

  liveNow() {
    return onAirNow(this.slots, this.bad, Date.now() / 1000);
  }

  private async init() {
    const [YT, slots, liveStream] = await Promise.all([
      loadYT(),
      loadSlots(),
      fetchLiveStream().catch(() => null),
    ]);
    if (!slots.length) throw new Error("nothing to play");
    this.slots = slots;
    this.liveStream = liveStream;
    const start = tuneStart(this);
    this.setAnchor(start);
    this.loaded = this.prog.youtubeId;
    void fit(this);
    const signal = this.ac.signal;
    bindLiveBroadcast(this, signal);
    const on = (sel: string, fn: () => void) =>
      this.querySelector(sel)?.addEventListener("click", fn, { signal });

    this.player = createPlayer(YT, this, start);

    on("#rp-play", () => this.toggle());
    on("#rp-sound", () => this.toggleMute());
    on("#rp-back", () => goLive(this));
    on("#rp-shuffle", () => setShuffle(this, !this.shuffle.on));

    document.addEventListener(RADIO_TRACK, (e) => {
      const info = (e as CustomEvent<TrackInfo>).detail;
      void this.jockey.onTrack(info);
    }, { signal });

    document.addEventListener(RADIO_TIME, (e) => {
      const timeInfo = (e as CustomEvent<TimeInfo>).detail;
      if (lastTrack) void this.jockey.onTime(timeInfo, lastTrack);
    }, { signal });

    const stopListeners = watchListeners((n) => {
      this.jockey.setListenerCount(n);
    });
    signal.addEventListener("abort", () => stopListeners());

    document.addEventListener(RADIO_LIVE, () => goLive(this), { signal });
    document.addEventListener("radio:jockey:ask", () => {
      if (lastTrack) void this.jockey.askCurrent(lastTrack);
    }, { signal });
    document.addEventListener("radio:jockey:toggle", () => this.jockey.toggle(), { signal });
    // Mobile browsers pause embeds in the background; come back to the live moment, like a radio.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.resumeIfDropped();
    }, { signal });
    window.addEventListener("pageshow", () => this.resumeIfDropped(), { signal });
    window.addEventListener("resize", () => void fit(this), { signal, passive: true });
    document.addEventListener(RADIO_CUE, (e) => void cue(this, (e as CustomEvent<CueInfo>).detail), { signal });
    const actions = {
      toggle: () => this.toggle(),
      mute: () => this.toggleMute(),
      prev: () => step(this, -1),
      next: () => step(this, 1),
      live: () => goLive(this),
    };
    bindKeys(actions, signal);
    bindSession({
      play: () => !this.playing && this.toggle(),
      pause: () => this.playing && this.toggle(),
      next: actions.next,
      prev: actions.prev,
    });
  }

  setAnchor(offset: number) {
    this.anchor = offset;
    this.anchorAt = Date.now();
  }

  position(): number {
    const settling = Date.now() - this.anchorAt < SETTLE_MS;
    if (settling) return this.anchor + (this.playing ? (Date.now() - this.anchorAt) / 1000 : 0);
    return this.player?.getCurrentTime() ?? 0;
  }

  private setMuted(muted: boolean) {
    this.wake.abort();
    const tune = this.querySelector<HTMLElement>("#rp-tune");
    if (tune) tuneIn(tune, this.querySelector("#rp-sound"), this.querySelector(".rp-screen"), this.tap);
    this.muted = muted;
    if (muted) {
      this.jockey.stop();
      this.player?.mute?.();
    } else {
      this.player?.unMute?.();
      this.player?.setVolume?.(this.fader.volume);
      void this.jockey.onTuneIn();
    }
    emitState(this);
  }

  private toggleMute() {
    const actual = this.player?.isMuted?.();
    this.setMuted(typeof actual === "boolean" ? !actual : !this.muted);
  }

  private startFromGesture() {
    this.userPaused = false;
    if (this.muted) this.setMuted(false);
    this.player?.playVideo?.();
  }

  private toggle() {
    this.userPaused = this.playing;
    if (this.playing) {
      this.jockey.stop();
      this.player?.pauseVideo?.();
    }
    else if (this.live) goLive(this);
    else this.player?.playVideo?.();
  }

  private resumeIfDropped() {
    if (document.visibilityState !== "visible" || this.userPaused || !this.player) return;
    const state = this.player.getPlayerState?.();
    if (state === 1 || state === 3) return;
    this.playing = false;
    emitState(this);
    if (this.live) goLive(this);
    else this.player?.playVideo?.();
  }
}

if (!customElements.get("radio-player")) customElements.define("radio-player", RadioPlayer);
