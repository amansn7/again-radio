import { loadYT } from "../lib/yt.ts";
import { tuneIn, type Point } from "./tune-in.ts";
import { parseLink, resolveLink } from "../lib/share.ts";
import { loadProgram } from "../lib/station.ts";
import { entryAt } from "../lib/schedule.ts";
import { creditText, stampText, videoProgram } from "../lib/live.ts";
import { loadSlots, onAirNow, slotAfter, type Slot } from "../lib/rotation.ts";
import { SetShuffle } from "../lib/set-shuffle.ts";
import { videoFill } from "../lib/frame.ts";
import { bindKeys } from "./transport.ts";
import { Fader } from "./fader.ts";
import { bindSession, setSession, setSessionPlaying } from "./media-session.ts";
import type { Program } from "../lib/station.ts";
import type { YTPlayer } from "../lib/yt.ts";
import { RADIO_CUE, RADIO_LIVE, RADIO_STATE, RADIO_TIME, RADIO_TRACK } from "../lib/events.ts";
import type { CueInfo, StateInfo, TrackInfo } from "../lib/events.ts";

const DRIFT = 8;
const SETTLE_MS = 1500;
// Fades: long and unhurried when the station moves on by itself, short when the listener asks.
const FADE_AUTO_MS = 1800;
const FADE_USER_MS = 350;

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
  private shuffle = new SetShuffle();
  private bad = new Set<string>();
  private errors = 0;
  private fader = new Fader((v) => this.player?.setVolume?.(v), () => this.playing);
  private loaded = "";
  // Browsers block sound until a gesture, so the station starts muted and the first
  // click or key anywhere turns it up. An explicit mute/unmute cancels that.
  private wake = new AbortController();
  private muted = true;
  private tap: Point | undefined;
  private playing = false;
  private userPaused = false;
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
    // The tune-in button acts on its own click: a keydown handler that moved focus would let the
    // key's activation land on the next button instead.
    // Moving focus is not asking for sound: Tab and lone modifiers would otherwise remove the
    // tune-in button before a keyboard user can reach it.
    const NAV = new Set(["Tab", "Shift", "Control", "Alt", "Meta", "Escape"]);
    const mark = (e: Event) => {
      if (e instanceof MouseEvent && e.detail > 0) this.tap = { x: e.clientX, y: e.clientY };
    };
    const soundOn = (e: Event) => {
      if (e instanceof KeyboardEvent && NAV.has(e.key)) return;
      mark(e);
      if (!(e.target instanceof Element && e.target.closest("#rp-tune"))) this.startFromGesture();
    };
    window.addEventListener("click", soundOn, { signal: wakeSignal });
    window.addEventListener("keydown", soundOn, { signal: wakeSignal });
    this.querySelector("#rp-tune")?.addEventListener("click", (e) => {
      mark(e);
      this.startFromGesture();
    }, { signal: wakeSignal });
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
    this.fader.stop();
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
    return onAirNow(this.slots, this.bad, Date.now() / 1000);
  }

  private async init() {
    const [YT, slots] = await Promise.all([loadYT(), loadSlots()]);
    if (!slots.length) throw new Error("nothing to play");
    this.slots = slots;
    // A shared moment opens on that moment; anything unreadable just tunes to live.
    const link = parseLink(location.search);
    const linked = link && resolveLink(link, slots);
    let start: number;
    if (linked) {
      this.prog = linked.program;
      this.path = linked.path;
      this.offAir();
      this.shuffle.reset(linked.program.entries.length, entryAt(linked.program.entries, linked.offset)?.index ?? 0);
      start = linked.offset;
    } else {
      const at = this.liveNow();
      this.useSlot(at.index, at.cycle);
      start = at.offset;
    }
    if (link) history.replaceState(null, "", location.pathname);
    this.setAnchor(start);
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
        start, origin: window.location.origin,
      },
      events: {
        onReady: () => {
          if (!this.muted) this.player?.unMute?.();
          this.player?.setVolume?.(this.fader.volume);
          this.player?.playVideo();
          this.setLabels();
          this.emitState();
          this.emitTrack();
          this.ticker = setInterval(() => this.tick(), 250);
        },
        onStateChange: (e) => {
          const playing = e.data === 1 || e.data === 3;
          if (e.data === 1) {
            this.setHidden(".rp-tuning", true);
            // auto-captions cover the picture; the memory line is the caption here
            this.player?.unloadModule?.("captions");
            this.errors = 0;
            this.setHidden(".rp-error", true);
            delete this.dataset.novideo;
            this.fader.onPlaying();
          }
          if (playing !== this.playing) {
            this.playing = playing;
            this.emitState();
          }
          if (e.data === 0 && Date.now() - this.anchorAt > SETTLE_MS) this.advance();
          // Retry a browser-imposed pause while hidden; the browser may still suspend us.
          if (e.data === 2 && document.hidden && !this.userPaused) this.player?.playVideo();
        },
        // Not embeddable here, removed, or blocked: skip it rather than go silent.
        onError: () => {
          this.dataset.novideo = "";
          this.bad.add(this.prog.youtubeId);
          // A seek on the broken player never errors again, so the next load must be a real one.
          this.loaded = "";
          if (++this.errors >= 3) {
            this.setHidden(".rp-tuning", true);
            this.setHidden(".rp-error", false);
            return;
          }
          // Shuffle and off-air picks stay inside this broken video; live skips it.
          this.goLive(FADE_AUTO_MS);
        },
      },
    });

    on("#rp-play", () => this.toggle());
    on("#rp-sound", () => this.toggleMute());
    on("#rp-back", () => this.goLive());
    on("#rp-shuffle", () => this.setShuffle(!this.shuffle.on));
    document.addEventListener(RADIO_LIVE, () => this.goLive(), { signal });
    // Mobile browsers pause embeds in the background; come back to the live moment, like a radio.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.resumeIfDropped();
    }, { signal });
    window.addEventListener("pageshow", () => this.resumeIfDropped(), { signal });
    window.addEventListener("resize", () => void this.fit(), { signal, passive: true });
    document.addEventListener(RADIO_CUE, (e) => void this.cue((e as CustomEvent<CueInfo>).detail), { signal });
    const actions = {
      toggle: () => this.toggle(),
      mute: () => this.toggleMute(),
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
    const tune = this.querySelector<HTMLElement>("#rp-tune");
    if (tune) tuneIn(tune, this.querySelector("#rp-sound"), this.querySelector(".rp-screen"), this.tap);
    this.muted = muted;
    if (muted) this.player?.mute();
    else {
      this.player?.unMute();
      this.player?.setVolume?.(this.fader.volume);
    }
    this.emitState();
  }

  private toggleMute() {
    const actual = this.player?.isMuted?.();
    this.setMuted(typeof actual === "boolean" ? !actual : !this.muted);
  }

  private startFromGesture() {
    this.userPaused = false;
    if (this.muted) this.setMuted(false);
    this.player?.playVideo();
  }

  private toggle() {
    this.userPaused = this.playing;
    if (this.playing) this.player?.pauseVideo();
    else if (this.live) this.goLive();
    else this.player?.playVideo();
  }

  private resumeIfDropped() {
    if (document.visibilityState !== "visible" || this.userPaused || !this.player) return;
    const state = this.player.getPlayerState?.();
    if (state === 1 || state === 3) return;
    this.playing = false;
    this.emitState();
    if (this.live) this.goLive();
    else this.player?.playVideo();
  }

  // --- what plays

  private goLive(ms = FADE_USER_MS) {
    this.userPaused = false;
    this.live = true;
    this.shuffle.set(false, 0, -1);
    const at = this.liveNow();
    this.fader.run(ms, () => {
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
      this.fader.run(FADE_USER_MS, () => {
        this.prog = prog;
        this.path = path;
        this.offAir();
        this.shuffle.reset(prog.entries.length, entryAt(prog.entries, d.offset)?.index ?? 0);
        this.load(d.offset);
      });
    } catch {
      /* a bad cue must not take the station down */
    }
  }

  /** Off the shared broadcast: this set plays to its end, then the station takes over again. */
  private offAir() {
    this.live = false;
    this.onSlot = -1;
    this.end = this.prog.duration;
  }

  // Shuffle: the current set's tracks, current one first, nothing from other sets.
  private setShuffle(on: boolean) {
    const here = entryAt(this.prog.entries, this.position());
    if (on && (!here || this.prog.entries.length < 2)) return;
    this.shuffle.set(on, this.prog.entries.length, here?.index ?? -1);
    // Shuffling leaves the shared broadcast, but this set keeps playing where it is.
    if (on) this.offAir();
    this.emitState();
  }

  private playEntry(i: number, ms: number) {
    this.fader.run(ms, () => this.load(this.prog.entries[i].offset));
  }

  private step(dir: 1 | -1) {
    const info = entryAt(this.prog.entries, this.position());
    if (!info) return;
    if (this.shuffle.on) {
      if (dir > 0) return this.nextShuffled(FADE_USER_MS);
      const back = info.elapsed > 3 ? undefined : this.shuffle.back();
      return this.playEntry(back ?? this.shuffle.picking, FADE_USER_MS);
    }
    const to = dir < 0 && info.elapsed > 3 ? info.index : info.index + dir;
    if (to < 0) return;
    if (to >= this.prog.entries.length) return this.advance(FADE_USER_MS);
    this.offAir();
    this.playEntry(to, FADE_USER_MS);
  }

  private nextShuffled(ms: number) {
    const next = this.shuffle.next();
    if (next === undefined) return this.goLive(ms);
    this.playEntry(next, ms);
  }

  /** This stretch is over: the next track in the shuffle, else the next slot on air. */
  private advance(ms = FADE_AUTO_MS) {
    if (this.shuffle.on) return this.nextShuffled(ms);
    if (!this.live || this.onSlot < 0) return this.goLive(ms);
    let at = this.liveNow();
    // Ran out ahead of the wall clock (or this one is broken): take the next slot early.
    if (at.index === this.onSlot) at = slotAfter(this.slots, this.bad, this.onSlot, this.cycle);
    this.fader.run(ms, () => {
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
    if (Date.now() - this.anchorAt < SETTLE_MS || this.fader.busy) return;
    // ENDED inside the settle window is ignored as possibly stale; if it was real, the state still says so.
    if (this.player.getPlayerState?.() === 0) return this.advance();
    if (this.playing) {
      const lead = document.hidden ? 0 : FADE_AUTO_MS / 1000;
      if (this.shuffle.on) {
        const info = entryAt(this.prog.entries, exact);
        // Ticks can skip the fade window (hidden tab, slow device): crossing into the next entry counts too.
        if (info && (info.index !== this.shuffle.picking || exact >= info.entry.offset + info.entry.duration - lead)) {
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
      playing: this.playing, muted: this.muted, live: this.live, shuffle: this.shuffle.on,
    };
    Object.entries(detail).forEach(([k, v]) => (this.dataset[k] = String(v)));
    setSessionPlaying(this.playing);
    this.querySelector("#rp-play")?.setAttribute("aria-label", this.playing ? "Pause" : "Play");
    this.querySelector("#rp-sound")?.setAttribute("aria-label", this.muted ? "Unmute" : "Mute");
    const sh = this.querySelector<HTMLButtonElement>("#rp-shuffle");
    if (sh) {
      sh.setAttribute("aria-pressed", String(this.shuffle.on));
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
