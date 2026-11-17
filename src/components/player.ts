import { loadYT } from "../lib/yt.ts";
import { loadStation, loadProgram } from "../lib/station.ts";
import { entryAt, livePosition } from "../lib/schedule.ts";
import { creditText, stampText, videoProgram } from "../lib/live.ts";
import { bindKeys } from "./transport.ts";
import type { Program } from "../lib/station.ts";
import type { YTPlayer } from "../lib/yt.ts";
import { RADIO_CUE, RADIO_LIVE, RADIO_STATE, RADIO_TIME, RADIO_TRACK } from "../lib/events.ts";
import type { CueInfo, StateInfo, TrackInfo } from "../lib/events.ts";

const DRIFT = 8;
const SETTLE_MS = 1500;
// A pause this soon after the page hides is the browser/embed suspending us, not the listener.
const HIDE_GRACE_MS = 2000;

class RadioPlayer extends HTMLElement {
  private player: YTPlayer | null = null;
  private rotation: { path: string; program: Program }[] = [];
  private prog!: Program;
  private path = "";
  private live = true;
  // Browsers block sound until a gesture, so the station starts muted and the first
  // click or key anywhere turns it up. An explicit mute/unmute cancels that.
  private wake = new AbortController();
  private muted = true;
  private playing = false;
  private userPaused = false;
  private hiddenAt = 0;
  private lastFocus: HTMLElement | null = null;
  private lastKey = "";
  private anchor = 0;
  private anchorAt = 0;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private ac = new AbortController();

  connectedCallback() {
    this.ac = new AbortController();
    // Listen before YouTube loads: the first tap usually lands while it is still loading.
    const wakeSignal = AbortSignal.any([this.ac.signal, this.wake.signal]);
    const soundOn = () => this.muted && this.setMuted(false);
    window.addEventListener("click", soundOn, { signal: wakeSignal });
    window.addEventListener("keydown", soundOn, { signal: wakeSignal });
    // Focus moving into the embed blurs the window; take it straight back to where the user was.
    document.addEventListener("focusin", (e) => {
      if (!(e.target instanceof HTMLIFrameElement)) this.lastFocus = e.target as HTMLElement;
    }, { signal: this.ac.signal });
    window.addEventListener("blur", () => setTimeout(() => this.releaseFocus()), { signal: this.ac.signal });
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
    this.player?.destroy();
  }

  // The embed grabs focus as it loads, which swallows the page's keyboard shortcuts.
  private releaseFocus() {
    const a = document.activeElement;
    if (!(a instanceof HTMLIFrameElement) || !this.contains(a)) return;
    a.blur();
    if (this.lastFocus?.isConnected) this.lastFocus.focus({ preventScroll: true });
  }

  private setHidden(sel: string, hidden: boolean) {
    const el = this.querySelector<HTMLElement>(sel);
    if (el) el.hidden = hidden;
  }

  private liveNow() {
    const durations = this.rotation.map((r) => r.program.duration);
    const { index, offset } = livePosition(durations, Date.now() / 1000);
    return { ...this.rotation[index], index, offset: Math.floor(offset) };
  }

  private async init() {
    const [YT, station] = await Promise.all([loadYT(), loadStation()]);
    const programs = await Promise.all(station.rotation.map((r) => loadProgram(r.program)));
    this.rotation = programs.map((program, i) => ({ path: station.rotation[i].program, program }));
    const at = this.liveNow();
    this.prog = at.program;
    this.path = at.path;
    this.setAnchor(at.offset);
    const signal = this.ac.signal;
    const on = (sel: string, fn: () => void) =>
      this.querySelector(sel)?.addEventListener("click", fn, { signal });

    this.player = new YT.Player(this.querySelector<HTMLElement>("#rp-yt")!, {
      videoId: at.program.youtubeId,
      playerVars: {
        enablejsapi: 1, controls: 0, modestbranding: 1, rel: 0, playsinline: 1,
        autoplay: 1, mute: 1, cc_load_policy: 0, iv_load_policy: 3, disablekb: 1,
        start: at.offset, origin: window.location.origin,
      },
      events: {
        onReady: () => {
          if (!this.muted) this.player?.unMute?.();
          this.setHidden(".rp-tuning", true);
          this.setLabels();
          this.emitState();
          this.emitTrack();
          this.ticker = setInterval(() => this.tick(), 250);
        },
        onStateChange: (e) => {
          const playing = e.data === 1 || e.data === 3;
          // auto-captions cover the picture; the memory line is the caption here
          if (e.data === 1) this.player?.unloadModule?.("captions");
          if (playing !== this.playing) {
            this.playing = playing;
            this.emitState();
          }
          if (e.data === 0 && Date.now() - this.anchorAt > SETTLE_MS) this.ended();
          // Keep the radio on in a background tab where the browser allows it.
          if (e.data === 2 && document.hidden && !this.userPaused && Date.now() - this.hiddenAt < HIDE_GRACE_MS) {
            this.player?.playVideo();
          }
        },
        onError: () => {
          this.setHidden(".rp-tuning", true);
          this.setHidden(".rp-error", false);
        },
      },
    });

    on("#rp-play", () => this.toggle());
    on("#rp-sound", () => this.setMuted(!this.muted));
    on("#rp-back", () => this.goLive());
    document.addEventListener(RADIO_LIVE, () => this.goLive(), { signal });
    // Mobile browsers pause embeds in the background; come back to the live moment, like a radio.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.hiddenAt = Date.now();
      this.resumeIfDropped();
    }, { signal });
    window.addEventListener("pageshow", () => this.resumeIfDropped(), { signal });
    document.addEventListener(RADIO_CUE, (e) => void this.cue((e as CustomEvent<CueInfo>).detail), { signal });
    bindKeys(
      {
        toggle: () => this.toggle(),
        mute: () => this.setMuted(!this.muted),
        prev: () => this.step(-1),
        next: () => this.step(1),
        live: () => this.goLive(),
      },
      signal,
    );
  }

  private setAnchor(offset: number) {
    this.anchor = offset;
    this.anchorAt = Date.now();
  }

  private position(): number {
    const settling = Date.now() - this.anchorAt < SETTLE_MS;
    if (settling) return this.anchor + (this.playing ? (Date.now() - this.anchorAt) / 1000 : 0);
    return this.player?.getCurrentTime() ?? 0;
  }

  private setMuted(muted: boolean) {
    this.wake.abort();
    this.querySelector(".rp-hint")?.remove();
    this.muted = muted;
    if (muted) this.player?.mute?.();
    else this.player?.unMute?.();
    this.emitState();
  }

  private toggle() {
    this.userPaused = this.playing;
    if (this.playing) this.player?.pauseVideo();
    else if (this.live) this.goLive();
    else this.player?.playVideo();
  }

  private resumeIfDropped() {
    if (document.visibilityState !== "visible" || this.userPaused || this.playing) return;
    if (this.live) this.goLive();
    else this.player?.playVideo();
  }

  private goLive() {
    this.userPaused = false;
    const at = this.liveNow();
    this.live = true;
    this.load(at.path, at.program, at.offset);
  }

  private load(path: string, prog: Program, offset: number) {
    const same = this.prog.youtubeId === prog.youtubeId;
    this.prog = prog;
    this.path = path;
    this.setAnchor(offset);
    if (same) {
      this.player?.seekTo(offset, true);
      this.player?.playVideo();
    } else {
      this.player?.loadVideoById({ videoId: prog.youtubeId, startSeconds: offset });
    }
    if (this.muted) this.player?.mute?.();
    else this.player?.unMute?.();
    this.setLabels();
    this.emitState();
    this.emitTrack();
  }

  private async cue(d: CueInfo) {
    try {
      const path = "video" in d ? `video:${d.video.youtubeId}` : d.program;
      const prog =
        "video" in d
          ? videoProgram(d.video)
          : (this.rotation.find((r) => r.path === path)?.program ?? (await loadProgram(path)));
      this.live = false;
      this.load(path, prog, d.offset);
    } catch {
      /* a bad cue must not take the station down */
    }
  }

  private step(dir: 1 | -1) {
    const info = entryAt(this.prog.entries, this.position());
    if (!info) return;
    const to = dir < 0 && info.elapsed > 3 ? info.index : info.index + dir;
    const entry = this.prog.entries[Math.max(to, 0)];
    if (!entry || to >= this.prog.entries.length) return;
    this.live = false;
    this.load(this.path, this.prog, entry.offset);
  }

  private ended() {
    const i = this.rotation.findIndex((r) => r.path === this.path);
    if (!this.live || i < 0) return this.goLive();
    const next = this.rotation[(i + 1) % this.rotation.length];
    this.load(next.path, next.program, 0);
  }

  private tick() {
    if (!this.player) return;
    const exact = this.position();
    const current = Math.floor(exact);
    document.dispatchEvent(
      new CustomEvent(RADIO_TIME, { detail: { current, exact, duration: this.prog.duration } }),
    );
    if (Date.now() - this.anchorAt < SETTLE_MS) return;
    if (this.live && this.playing && document.visibilityState === "visible") {
      const at = this.liveNow();
      if (current >= this.prog.duration) return this.ended();
      if (at.path === this.path && Math.abs(current - at.offset) > DRIFT) return this.goLive();
    }
    this.emitTrack();
  }

  private emitTrack() {
    const t = Math.floor(this.position());
    const info = entryAt(this.prog.entries, t);
    if (!info) return;
    const key = `${this.path}#${info.index}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const detail: TrackInfo = {
      programId: this.prog.id,
      programPath: this.path,
      youtubeId: this.prog.youtubeId,
      programTitle: this.prog.title,
      programDuration: this.prog.duration,
      venue: this.prog.venue,
      date: this.prog.date,
      entries: this.prog.entries,
      entry: info.entry,
      index: info.index,
      elapsed: info.elapsed,
      progress: info.progress,
    };
    document.dispatchEvent(new CustomEvent(RADIO_TRACK, { detail }));
  }

  private emitState() {
    const detail: StateInfo = {
      playing: this.playing, muted: this.muted, live: this.live,
    };
    Object.entries(detail).forEach(([k, v]) => (this.dataset[k] = String(v)));
    const play = this.querySelector("#rp-play");
    play?.setAttribute("aria-label", this.playing ? "Pause" : "Play");
    this.querySelector("#rp-sound")?.setAttribute("aria-label", this.muted ? "Unmute" : "Mute");
    document.dispatchEvent(new CustomEvent(RADIO_STATE, { detail }));
  }

  private setLabels() {
    const credit = this.querySelector(".rp-credit");
    if (credit) credit.textContent = creditText(this.prog);
    const stamp = this.querySelector<HTMLElement>(".rp-stamp");
    if (stamp) stamp.textContent = stampText(this.prog.date);
    const iframe = this.querySelector("iframe");
    if (iframe) iframe.title = `Fred again.. ${this.prog.title}`;
  }
}

if (!customElements.get("radio-player")) customElements.define("radio-player", RadioPlayer);
