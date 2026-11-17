import { loadYT } from "../lib/yt.ts";
import { loadProgram } from "../lib/station.ts";
import { entryAt } from "../lib/schedule.ts";
import { creditText, stampText, videoProgram } from "../lib/live.ts";
import { cycleOrder, liveSlot, loadSlots, shuffled, type Slot } from "../lib/rotation.ts";
import { videoFill } from "../lib/frame.ts";
import { bindKeys } from "./transport.ts";
import { bindSession, setSession, setSessionPlaying } from "./media-session.ts";
import type { Program } from "../lib/station.ts";
import type { YTPlayer } from "../lib/yt.ts";
import { RADIO_CUE, RADIO_LIVE, RADIO_STATE, RADIO_TIME, RADIO_TRACK } from "../lib/events.ts";
import type { CueInfo, StateInfo, TrackInfo } from "../lib/events.ts";

const DRIFT = 8;
const SETTLE_MS = 1500;
// A pause this soon after the page hides is the browser/embed suspending us, not the listener.
const HIDE_GRACE_MS = 2000;
// Fades: long and unhurried when the station moves on by itself, short when the listener asks.
const FADE_AUTO_MS = 1800;
const FADE_USER_MS = 350;
const FADE_IN_MS = 1200;

class RadioPlayer extends HTMLElement {
  private player: YTPlayer | null = null;
  private slots: Slot[] = [];
  private onSlot = -1;
  private cycle = 0;
  private prog!: Program;
  private path = "";
  /** Video seconds where this stretch hands over to the next. */
  private end = 0;
  private live = true;
  private shuffle = false;
  private queue: number[] = [];
  private played: number[] = [];
  /** The entry the shuffle put on; leaving it by any route means the next pick is due. */
  private picking = -1;
  private bad = new Set<string>();
  private errors = 0;
  private fading = false;
  private change: (() => void) | null = null;
  private loaded = "";
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private volume = 100;
  private wantFadeIn = false;
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
    if (this.fadeTimer !== null) clearInterval(this.fadeTimer);
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

  /** The shared broadcast right now, skipping anything that would not play here. */
  private liveNow() {
    const at = liveSlot(this.slots.map((s) => s.length), Date.now() / 1000);
    const slot = this.slots[at.index];
    if (this.bad.has(slot.program.youtubeId)) return this.nextSlot(at.index, at.cycle);
    return { index: at.index, cycle: at.cycle, offset: slot.start + Math.floor(at.offset) };
  }

  /** The next playable slot in broadcast order, from its start. */
  private nextSlot(index: number, cycle: number) {
    for (let k = 0; k < this.slots.length * 2; k++) {
      const order = cycleOrder(this.slots.length, cycle);
      const i = order.indexOf(index);
      if (i === order.length - 1) {
        cycle++;
        index = cycleOrder(this.slots.length, cycle)[0];
      } else index = order[i + 1];
      if (!this.bad.has(this.slots[index].program.youtubeId)) break;
    }
    return { index, cycle, offset: this.slots[index].start };
  }

  private async init() {
    const [YT, slots] = await Promise.all([loadYT(), loadSlots()]);
    if (!slots.length) throw new Error("nothing to play");
    this.slots = slots;
    const at = this.liveNow();
    this.useSlot(at.index, at.cycle);
    this.setAnchor(at.offset);
    this.loaded = this.prog.youtubeId;
    void this.fit();
    const signal = this.ac.signal;
    const on = (sel: string, fn: () => void) =>
      this.querySelector(sel)?.addEventListener("click", fn, { signal });

    this.player = new YT.Player(this.querySelector<HTMLElement>("#rp-yt")!, {
      videoId: this.prog.youtubeId,
      playerVars: {
        enablejsapi: 1, controls: 0, modestbranding: 1, rel: 0, playsinline: 1,
        autoplay: 1, mute: 1, cc_load_policy: 0, iv_load_policy: 3, disablekb: 1,
        start: at.offset, origin: window.location.origin,
      },
      events: {
        onReady: () => {
          if (!this.muted) this.player?.unMute?.();
          this.player?.setVolume?.(this.volume);
          this.setHidden(".rp-tuning", true);
          this.setLabels();
          this.emitState();
          this.emitTrack();
          this.ticker = setInterval(() => this.tick(), 250);
        },
        onStateChange: (e) => {
          const playing = e.data === 1 || e.data === 3;
          if (e.data === 1) {
            // auto-captions cover the picture; the memory line is the caption here
            this.player?.unloadModule?.("captions");
            this.errors = 0;
            this.setHidden(".rp-error", true);
            if (this.wantFadeIn) this.fadeIn();
          }
          if (playing !== this.playing) {
            this.playing = playing;
            this.emitState();
          }
          if (e.data === 0 && Date.now() - this.anchorAt > SETTLE_MS) this.advance();
          // Keep the radio on in a background tab where the browser allows it.
          if (e.data === 2 && document.hidden && !this.userPaused && Date.now() - this.hiddenAt < HIDE_GRACE_MS) {
            this.player?.playVideo();
          }
        },
        // Not embeddable here, removed, or blocked: skip it rather than go silent.
        onError: () => {
          this.bad.add(this.prog.youtubeId);
          if (++this.errors >= 3) {
            this.setHidden(".rp-tuning", true);
            this.setHidden(".rp-error", false);
            return;
          }
          this.advance();
        },
      },
    });

    on("#rp-play", () => this.toggle());
    on("#rp-sound", () => this.setMuted(!this.muted));
    on("#rp-back", () => this.goLive());
    on("#rp-shuffle", () => this.setShuffle(!this.shuffle));
    document.addEventListener(RADIO_LIVE, () => this.goLive(), { signal });
    // Mobile browsers pause embeds in the background; come back to the live moment, like a radio.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.hiddenAt = Date.now();
      this.resumeIfDropped();
    }, { signal });
    window.addEventListener("pageshow", () => this.resumeIfDropped(), { signal });
    window.addEventListener("resize", () => void this.fit(), { signal, passive: true });
    document.addEventListener(RADIO_CUE, (e) => void this.cue((e as CustomEvent<CueInfo>).detail), { signal });
    const actions = {
      toggle: () => this.toggle(),
      mute: () => this.setMuted(!this.muted),
      prev: () => this.step(-1),
      next: () => this.step(1),
      live: () => this.goLive(),
    };
    bindKeys(actions, signal);
    bindSession({
      play: () => !this.playing && this.toggle(),
      pause: () => this.playing && this.toggle(),
      next: actions.next,
      prev: actions.prev,
    });
  }

  private useSlot(index: number, cycle: number) {
    const s = this.slots[index];
    this.onSlot = index;
    this.cycle = cycle;
    this.prog = s.program;
    this.path = s.path;
    this.end = s.start + s.length;
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

  // --- fades: YouTube's own volume, so nothing is proxied and nothing is kept awake.

  private ramp(to: number, ms: number, done?: () => void) {
    if (this.fadeTimer !== null) clearInterval(this.fadeTimer);
    const from = this.volume;
    const t0 = Date.now();
    // A hidden tab throttles timers to ~1s; a fade there would only stutter.
    if (document.hidden) ms = 0;
    const step = () => {
      const k = ms ? Math.min((Date.now() - t0) / ms, 1) : 1;
      this.volume = Math.round(from + (to - from) * k * k * (3 - 2 * k));
      this.player?.setVolume?.(this.volume);
      if (k < 1) return;
      if (this.fadeTimer !== null) clearInterval(this.fadeTimer);
      this.fadeTimer = null;
      done?.();
    };
    if (ms) this.fadeTimer = setInterval(step, 40);
    step();
  }

  /** Fade out, change what is playing, fade back in once the new moment is actually playing. */
  private transition(ms: number, change: () => void) {
    // A newer request during a fade replaces the older one; the fade itself carries on.
    this.change = change;
    if (this.fading) return;
    this.fading = true;
    this.ramp(0, this.playing ? ms : 0, () => {
      this.fading = false;
      this.wantFadeIn = true;
      const run = this.change;
      this.change = null;
      run?.();
      // If YouTube never reports PLAYING (already playing through a seek), come up anyway.
      setTimeout(() => this.wantFadeIn && this.fadeIn(), 1500);
    });
  }

  private fadeIn() {
    this.wantFadeIn = false;
    this.ramp(100, FADE_IN_MS);
  }

  // --- what plays

  private goLive(ms = FADE_USER_MS) {
    this.userPaused = false;
    this.live = true;
    this.shuffle = false;
    const at = this.liveNow();
    this.transition(ms, () => {
      this.useSlot(at.index, at.cycle);
      this.load(at.offset);
    });
  }

  private load(offset: number) {
    const same = this.loaded === this.prog.youtubeId;
    this.loaded = this.prog.youtubeId;
    this.setAnchor(offset);
    if (same) {
      this.player?.seekTo(offset, true);
      this.player?.playVideo();
    } else {
      this.player?.loadVideoById({ videoId: this.prog.youtubeId, startSeconds: offset });
      void this.fit();
    }
    if (this.muted) this.player?.mute?.();
    else this.player?.unMute?.();
    this.setLabels();
    this.emitState();
    this.emitTrack();
  }

  /** Scale the embed so the picture, not YouTube's black bars, covers the screen. */
  private async fit() {
    const id = this.prog.youtubeId;
    const f = await videoFill(id);
    if (id !== this.prog.youtubeId) return;
    const s = this.querySelector<HTMLElement>(".rp-screen")!.style;
    s.setProperty("--rp-fx", String(f.x));
    s.setProperty("--rp-fy", String(f.y));
    s.setProperty("--rp-a", String((16 * f.x) / (9 * f.y)));
  }

  private async cue(d: CueInfo) {
    try {
      const path = "video" in d ? `video:${d.video.youtubeId}` : d.program;
      const prog =
        "video" in d
          ? videoProgram(d.video)
          : (this.slots.find((s) => s.path === path)?.program ?? (await loadProgram(path)));
      this.userPaused = false;
      this.transition(FADE_USER_MS, () => {
        this.live = false;
        this.onSlot = -1;
        this.prog = prog;
        this.path = path;
        this.end = prog.duration;
        this.picking = entryAt(prog.entries, d.offset)?.index ?? 0;
        this.queue = this.shuffle ? this.shuffleFrom(this.picking) : [];
        this.played = [];
        this.load(d.offset);
      });
    } catch {
      /* a bad cue must not take the station down */
    }
  }

  // --- shuffle: the current set's tracks, current one first, nothing from other sets.

  private shuffleFrom(current: number): number[] {
    const rest = this.prog.entries.map((_, i) => i).filter((i) => i !== current);
    return shuffled(rest);
  }

  private setShuffle(on: boolean) {
    const here = entryAt(this.prog.entries, this.position());
    if (on && (!here || this.prog.entries.length < 2)) return;
    this.shuffle = on;
    this.played = [];
    this.queue = on ? this.shuffleFrom(here!.index) : [];
    this.picking = on ? here!.index : -1;
    if (on && this.live) {
      // Shuffling leaves the shared broadcast, but this set keeps playing where it is.
      this.live = false;
      this.end = this.prog.duration;
      this.onSlot = -1;
    }
    this.emitState();
  }

  private playEntry(i: number, ms: number) {
    this.picking = i;
    this.transition(ms, () => this.load(this.prog.entries[i].offset));
  }

  private step(dir: 1 | -1) {
    const info = entryAt(this.prog.entries, this.position());
    if (!info) return;
    if (this.shuffle) {
      if (dir > 0) return this.nextShuffled(FADE_USER_MS);
      if (info.elapsed > 3 || !this.played.length) return this.playEntry(info.index, FADE_USER_MS);
      this.queue.unshift(this.picking);
      return this.playEntry(this.played.pop()!, FADE_USER_MS);
    }
    const to = dir < 0 && info.elapsed > 3 ? info.index : info.index + dir;
    if (to < 0) return;
    if (to >= this.prog.entries.length) return this.advance(FADE_USER_MS);
    this.live = false;
    this.end = this.prog.duration;
    this.onSlot = -1;
    this.playEntry(to, FADE_USER_MS);
  }

  private nextShuffled(ms: number) {
    const next = this.queue.shift();
    if (next === undefined) return this.goLive(ms);
    if (this.picking >= 0) this.played.push(this.picking);
    this.playEntry(next, ms);
  }

  /** This stretch is over: the next track in the shuffle, else the next slot on air. */
  private advance(ms = FADE_AUTO_MS) {
    if (this.shuffle) return this.nextShuffled(ms);
    if (!this.live || this.onSlot < 0) return this.goLive(ms);
    let at = this.liveNow();
    // Ran out ahead of the wall clock (or this one is broken): take the next slot early.
    if (at.index === this.onSlot) at = this.nextSlot(this.onSlot, this.cycle);
    this.transition(ms, () => {
      this.useSlot(at.index, at.cycle);
      this.load(at.offset);
    });
  }

  private tick() {
    if (!this.player) return;
    const exact = this.position();
    const current = Math.floor(exact);
    if (!document.hidden) {
      document.dispatchEvent(
        new CustomEvent(RADIO_TIME, { detail: { current, exact, duration: this.prog.duration } }),
      );
    }
    if (Date.now() - this.anchorAt < SETTLE_MS || this.fading || this.wantFadeIn) return;
    if (this.playing) {
      const lead = document.hidden ? 0 : FADE_AUTO_MS / 1000;
      if (this.shuffle) {
        const info = entryAt(this.prog.entries, exact);
        // Ticks can skip the fade window (hidden tab, slow device): crossing into the next entry counts too.
        if (info && (info.index !== this.picking || exact >= info.entry.offset + info.entry.duration - lead)) {
          return this.nextShuffled(FADE_AUTO_MS);
        }
      } else if (exact >= this.end - lead) return this.advance();
      if (this.live && !document.hidden) {
        const at = this.liveNow();
        if (at.index === this.onSlot && Math.abs(current - at.offset) > DRIFT) return this.goLive();
      }
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
    setSession(this.prog, info.entry);
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
      playing: this.playing, muted: this.muted, live: this.live, shuffle: this.shuffle,
    };
    Object.entries(detail).forEach(([k, v]) => (this.dataset[k] = String(v)));
    setSessionPlaying(this.playing);
    this.querySelector("#rp-play")?.setAttribute("aria-label", this.playing ? "Pause" : "Play");
    this.querySelector("#rp-sound")?.setAttribute("aria-label", this.muted ? "Unmute" : "Mute");
    const sh = this.querySelector<HTMLButtonElement>("#rp-shuffle");
    if (sh) {
      sh.setAttribute("aria-pressed", String(this.shuffle));
      sh.disabled = this.prog.entries.length < 2;
    }
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
