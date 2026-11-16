import { loadYT } from "../lib/yt.ts";
import { loadStation, loadProgram } from "../lib/station.ts";
import { entryAt, nextProgramIndex, programPath } from "../lib/schedule.ts";
import type { Program } from "../lib/station.ts";
import type { YTPlayer } from "../lib/yt.ts";
import { RADIO_CUE, RADIO_STATE, RADIO_TIME, RADIO_TRACK } from "../lib/events.ts";
import type { CueInfo, TrackInfo } from "../lib/events.ts";

class RadioPlayer extends HTMLElement {
  private player: YTPlayer | null = null;
  private program: Program | null = null;
  private rotationIndex = 0;
  private rotation: { program: string; weight: number }[] = [];
  private lastEntryIndex = -1;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private muted = true;
  private playing = false;

  connectedCallback() {
    this.init().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[radio-player]", msg);
      this.showError();
    });
  }

  disconnectedCallback() {
    if (this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.player?.destroy();
  }

  private showError() {
    const tuning = this.querySelector<HTMLElement>(".rp-tuning");
    const error = this.querySelector<HTMLElement>(".rp-error");
    if (tuning) tuning.hidden = true;
    if (error) error.hidden = false;
  }

  private async init() {
    const [YT, station] = await Promise.all([loadYT(), loadStation()]);

    this.rotation = station.rotation;
    this.rotationIndex = 0;
    this.program = await loadProgram(programPath(this.rotation, 0));

    const frameWrap = this.querySelector<HTMLElement>(".rp-frame-wrap");
    const tuning = this.querySelector<HTMLElement>(".rp-tuning");
    const ytEl = this.querySelector<HTMLElement>("#rp-yt");

    if (!ytEl || !frameWrap || !tuning) return;

    const prog = this.program;

    this.player = new YT.Player(ytEl, {
      videoId: prog.youtubeId,
      playerVars: {
        enablejsapi: 1,
        controls: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        autoplay: 1,
        mute: 1,
        cc_load_policy: 0,
        iv_load_policy: 3,
        disablekb: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          tuning.hidden = true;
          frameWrap.hidden = false;
          this.enableControls();
          this.updateProgramLabel();
          this.startTicker();
          this.emitFirstTrack();
        },
        onStateChange: (e) => {
          const playing = e.data === 1;
          const ended = e.data === 0;
          this.playing = playing;
          document.dispatchEvent(
            new CustomEvent(RADIO_STATE, { detail: { playing } })
          );
          this.updatePlayBtn(playing);
          if (ended) this.advanceRotation();
        },
        onError: () => this.showError(),
      },
    });

    this.setupTransport();

    document.addEventListener(RADIO_CUE, (e) => {
      const detail = (e as CustomEvent<CueInfo>).detail;
      void this.cueProgram(detail.program, detail.offset);
    });
  }

  private setupTransport() {
    const playBtn = this.querySelector<HTMLButtonElement>("#rp-play");
    const soundBtn = this.querySelector<HTMLButtonElement>("#rp-sound");

    playBtn?.addEventListener("click", () => {
      if (!this.player) return;
      const playing = this.isPlaying();
      if (playing) {
        this.player.pauseVideo();
      } else {
        this.player.playVideo();
      }
    });

    soundBtn?.addEventListener("click", () => {
      if (!this.player) return;
      this.muted = !this.muted;
      if (this.muted) {
        this.player.mute();
      } else {
        this.player.unMute();
      }
      this.updateSoundBtn();
    });
  }

  private enableControls() {
    const playBtn = this.querySelector<HTMLButtonElement>("#rp-play");
    const soundBtn = this.querySelector<HTMLButtonElement>("#rp-sound");
    if (playBtn) playBtn.disabled = false;
    if (soundBtn) soundBtn.disabled = false;
  }

  private isPlaying(): boolean {
    return this.playing;
  }

  private updatePlayBtn(playing: boolean) {
    const playBtn = this.querySelector<HTMLButtonElement>("#rp-play");
    if (!playBtn) return;
    playBtn.textContent = playing ? "PAUSE" : "PLAY";
    playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  private updateSoundBtn() {
    const soundBtn = this.querySelector<HTMLButtonElement>("#rp-sound");
    if (!soundBtn) return;
    soundBtn.textContent = this.muted ? "SOUND OFF" : "SOUND ON";
    soundBtn.setAttribute(
      "aria-label",
      this.muted ? "Turn sound on" : "Turn sound off"
    );
    soundBtn.setAttribute("aria-pressed", this.muted ? "false" : "true");
  }

  private updateProgramLabel() {
    const prog = this.program;
    if (!prog) return;
    const label = this.querySelector<HTMLElement>("#rp-prog-label");
    if (!label) return;
    const parts = [`NOW · ${prog.title}`];
    label.textContent = parts.join("");
    const iframe = this.querySelector<HTMLIFrameElement>("iframe");
    if (iframe) {
      iframe.title = `Fred again.. — ${prog.title}`;
      iframe.setAttribute("aria-label", `Video: Fred again.. – ${prog.title}`);
    }
  }

  private emitFirstTrack() {
    this.emitTrackAt(0);
  }

  private emitTrackAt(seconds: number) {
    const prog = this.program;
    if (!prog || !prog.entries.length) return;
    const info = entryAt(prog.entries, seconds);
    if (!info) return;
    this.lastEntryIndex = info.index;
    const detail: TrackInfo = {
      programId: prog.id,
      programTitle: prog.title,
      venue: prog.venue,
      date: prog.date,
      entry: info.entry,
      index: info.index,
      elapsed: info.elapsed,
      progress: info.progress,
    };
    document.dispatchEvent(new CustomEvent(RADIO_TRACK, { detail }));
  }

  private async cueProgram(path: string, offset: number) {
    try {
      const program = await loadProgram(path);
      this.program = program;
      this.rotationIndex = -1;
      this.lastEntryIndex = -1;
      this.player?.loadVideoById({ videoId: program.youtubeId, startSeconds: offset });
      if (this.muted) this.player?.mute();
      else this.player?.unMute();
      this.updateProgramLabel();
      this.emitTrackAt(offset);
    } catch {
      // a bad cue should never take the station down
    }
  }

  private startTicker() {
    this.ticker = setInterval(() => {
      if (!this.player || !this.program) return;
      const current = Math.floor(this.player.getCurrentTime());
      const duration = this.program.duration;
      document.dispatchEvent(
        new CustomEvent(RADIO_TIME, { detail: { current, duration } })
      );
      const info = entryAt(this.program.entries, current);
      if (!info) return;
      if (info.index !== this.lastEntryIndex) {
        this.lastEntryIndex = info.index;
        const detail: TrackInfo = {
          programId: this.program.id,
          programTitle: this.program.title,
          venue: this.program.venue,
          date: this.program.date,
          entry: info.entry,
          index: info.index,
          elapsed: info.elapsed,
          progress: info.progress,
        };
        document.dispatchEvent(new CustomEvent(RADIO_TRACK, { detail }));
      }
    }, 250);
  }

  private async advanceRotation() {
    const next = nextProgramIndex(this.rotation, this.rotationIndex);
    this.rotationIndex = next;
    try {
      this.program = await loadProgram(programPath(this.rotation, next));
    } catch {
      return;
    }
    this.lastEntryIndex = -1;
    this.player?.loadVideoById({ videoId: this.program.youtubeId, startSeconds: 0 });
    if (this.muted) this.player?.mute();
    else this.player?.unMute();
    this.updateProgramLabel();
    this.emitFirstTrack();
  }
}

if (!customElements.get("radio-player")) customElements.define("radio-player", RadioPlayer);
