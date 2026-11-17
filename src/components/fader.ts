// Fades on YouTube's own volume, so nothing is proxied and nothing is kept awake.
const STEP_MS = 40;
const IN_MS = 1200;
// If YouTube never reports PLAYING (a seek inside a video already playing), come up anyway.
const IN_FALLBACK_MS = 1500;

export class Fader {
  volume = 100;
  private fading = false;
  private wantIn = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private change: (() => void) | null = null;

  constructor(private apply: (v: number) => void, private playing: () => boolean) {}

  /** Mid-fade or waiting to come back up: not the moment to make another decision. */
  get busy(): boolean {
    return this.fading || this.wantIn;
  }

  /** Fade out, run `change`, fade back in once the new moment plays. A newer change replaces a pending one. */
  run(ms: number, change: () => void) {
    this.change = change;
    if (this.fading) return;
    this.fading = true;
    this.ramp(0, this.playing() ? ms : 0, () => {
      this.fading = false;
      this.wantIn = true;
      const run = this.change;
      this.change = null;
      run?.();
      setTimeout(() => this.wantIn && this.fadeIn(), IN_FALLBACK_MS);
    });
  }

  /** Call when playback (re)starts. */
  onPlaying() {
    if (this.wantIn) this.fadeIn();
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private fadeIn() {
    this.wantIn = false;
    this.ramp(100, IN_MS);
  }

  private ramp(to: number, ms: number, done?: () => void) {
    this.stop();
    const from = this.volume;
    const t0 = Date.now();
    // A hidden tab throttles timers to ~1s; a fade there would only stutter.
    if (document.hidden) ms = 0;
    const step = () => {
      const k = ms ? Math.min((Date.now() - t0) / ms, 1) : 1;
      this.volume = Math.round(from + (to - from) * k * k * (3 - 2 * k));
      this.apply(this.volume);
      if (k < 1) return;
      this.stop();
      done?.();
    };
    if (ms) this.timer = setInterval(step, STEP_MS);
    step();
  }
}
