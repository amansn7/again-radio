export function outroLeadSeconds(text: string, durationSeconds?: number): number {
  return (durationSeconds ?? text.length / 13) + 1.5;
}

const DEFAULT_POST_SECONDS = 12;

/** An intro only plays if it ends before the vocals; Rory never talks over the singer. */
export function introFits(
  elapsed: number,
  clip: { text: string; synthesisText?: string; durationSeconds?: number },
  postSeconds = DEFAULT_POST_SECONDS,
): boolean {
  // ~10 chars/s is Rory's slowest measured pace, so the estimate errs long; written pauses add on top.
  const pauses = [...(clip.synthesisText ?? "").matchAll(/time="([\d.]+)s"/g)].reduce((t, m) => t + Number(m[1]), 0);
  const seconds = clip.durationSeconds ?? clip.text.length / 10 + pauses;
  return elapsed >= 0 && elapsed + seconds + 0.5 <= postSeconds;
}
