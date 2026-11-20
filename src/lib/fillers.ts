export interface FillerClip {
  id: string;
  text: string;
  synthesisText?: string;
  durationSeconds?: number;
  min?: number | null;
  max?: number | null;
}

export interface FillerPools<T extends FillerClip> {
  listeners: T[];
  facts: T[];
  ids: T[];
}

/**
 * The next between-songs line. Shout-outs, facts and station IDs take turns starting at `turn`;
 * only clips that `fit` before the vocals, never the line played last. A shout-out matches the
 * live listener count when known, else uses the count-free line.
 */
export function chooseFiller<T extends FillerClip>(
  pools: FillerPools<T>,
  turn: number,
  listeners: number | null,
  last: string,
  fits: (clip: T) => boolean,
  rand: () => number = Math.random,
): T | undefined {
  const shoutouts = pools.listeners.filter((l) =>
    l.min == null ? listeners === null : listeners !== null && listeners >= l.min && listeners <= (l.max ?? Infinity),
  );
  const kinds = [shoutouts, pools.facts, pools.ids];
  for (let i = 0; i < kinds.length; i++) {
    const pool = (kinds[(turn + i) % kinds.length] ?? []).filter((c) => c.id !== last && fits(c));
    if (pool.length) return pool[Math.floor(rand() * pool.length)];
  }
  return undefined;
}
