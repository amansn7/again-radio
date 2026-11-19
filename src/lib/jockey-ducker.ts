// Smooth S-curve volume ducking for YouTube player audio during Jockey voiceovers.
const STEP_MS = 25;

export class JockeyDucker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private _isDucked = false;
  private settle: (() => void) | null = null;

  get isDucked(): boolean {
    return this._isDucked;
  }

  cancel(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const settle = this.settle;
    this.settle = null;
    settle?.();
  }

  /** Ramps volume down from current to target (e.g. 100 -> 22) */
  duck(
    setVolume: (v: number) => void,
    from = 100,
    to = 22,
    durationMs = 250
  ): Promise<void> {
    this._isDucked = true;
    return this.ramp(setVolume, from, to, durationMs);
  }

  /** Swells volume back up to standard (e.g. 22 -> 100) */
  unduck(
    setVolume: (v: number) => void,
    from = 22,
    to = 100,
    durationMs = 400
  ): Promise<void> {
    this._isDucked = false;
    return this.ramp(setVolume, from, to, durationMs);
  }

  private ramp(
    setVolume: (v: number) => void,
    from: number,
    to: number,
    durationMs: number
  ): Promise<void> {
    this.cancel();
    return new Promise((resolve) => {
      const t0 = Date.now();
      if (durationMs <= 0 || document.hidden) {
        setVolume(to);
        resolve();
        return;
      }

      this.settle = resolve;
      const step = () => {
        const k = Math.min((Date.now() - t0) / durationMs, 1);
        // Smooth cubic ease-in-out curve
        const curve =
          k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        const vol = Math.round(from + (to - from) * curve);
        setVolume(vol);

        if (k >= 1) {
          this.cancel();
          resolve();
        }
      };

      this.timer = setInterval(step, STEP_MS);
      step();
    });
  }
}
