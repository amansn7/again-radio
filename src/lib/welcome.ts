export interface Welcome {
  id: string;
  hours?: number[];
}

/** Untimed lines plus any whose hours include now, never the last one played. */
export function pickWelcome<T extends Welcome>(
  pool: T[],
  hour: number,
  lastId: string,
  rand: () => number = Math.random,
): T | undefined {
  const fits = pool.filter((w) => !w.hours || w.hours.includes(hour));
  const fresh = fits.filter((w) => w.id !== lastId);
  const from = fresh.length ? fresh : fits;
  return from[Math.floor(rand() * from.length)];
}
