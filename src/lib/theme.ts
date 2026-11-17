import type { HourBlock } from "./station.ts";

const DEFAULT_BLOCK: HourBlock = { from: 0, to: 24, label: "day" };

export function blockForHour(blocks: HourBlock[], hour: number): HourBlock {
  if (!blocks.length) return DEFAULT_BLOCK;
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  for (const b of blocks) {
    const span = ((b.to - b.from + 24) % 24) || 24;
    for (let i = 0; i < span; i++) {
      if ((b.from + i) % 24 === h) return b;
    }
  }
  return blocks[0];
}
