import type { HourBlock, ThemeName } from "./station.ts";

export type ThemeChoice = "auto" | ThemeName;

const STORAGE_KEY = "again-radio-theme";
const DEFAULT_BLOCK: HourBlock = { from: 0, to: 24, theme: "diary", label: "day" };

function normHour(hour: number): number {
  return ((Math.trunc(hour) % 24) + 24) % 24;
}

export function blockForHour(blocks: HourBlock[], hour: number): HourBlock {
  if (!blocks.length) return DEFAULT_BLOCK;
  const h = normHour(hour);
  for (const b of blocks) {
    const span = ((b.to - b.from + 24) % 24) || 24;
    for (let i = 0; i < span; i++) {
      if ((b.from + i) % 24 === h) return b;
    }
  }
  return blocks[0];
}

export function themeForHour(blocks: HourBlock[], hour: number): ThemeName {
  return blockForHour(blocks, hour).theme;
}

function fnv1a(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededAutoTheme(blocks: HourBlock[], hour: number, dateKey: string): ThemeName {
  const h = normHour(hour);
  const base = themeForHour(blocks, h);
  if (fnv1a(`${dateKey}:${h}`) % 3 !== 0) return base;
  return base === "diary" ? "sleek" : "diary";
}

export function readStoredChoice(storage: Storage | undefined): ThemeChoice {
  try {
    const v = storage?.getItem(STORAGE_KEY);
    return v === "auto" || v === "diary" || v === "sleek" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function writeStoredChoice(storage: Storage | undefined, choice: ThemeChoice): void {
  try {
    storage?.setItem(STORAGE_KEY, choice);
  } catch {
    // storage unavailable (private mode, SSR) — the choice just does not persist
  }
}
