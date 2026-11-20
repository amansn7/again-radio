/** The things Rory does, each one the listener can switch off. */
export const RORY_KINDS = ["welcome", "intros", "outros", "thoughts", "fillers"] as const;
export type RoryKind = (typeof RORY_KINDS)[number];

const KEY = "again-radio:jockey-kinds";
/** Before kinds existed Rory was one switch. */
const LEGACY_KEY = "again-radio:jockey";

/** Stored kinds, or every kind for a new listener. Unknown names are dropped. */
export function parseKinds(stored: string | null, legacy: string | null): Set<RoryKind> {
  if (stored !== null) {
    try {
      const list: unknown = JSON.parse(stored);
      if (Array.isArray(list)) return new Set(RORY_KINDS.filter((k) => list.includes(k)));
    } catch {}
  }
  return new Set(legacy === "false" ? [] : RORY_KINDS);
}

export function loadKinds(): Set<RoryKind> {
  try {
    return parseKinds(localStorage.getItem(KEY), localStorage.getItem(LEGACY_KEY));
  } catch {
    return new Set(RORY_KINDS);
  }
}

export function saveKinds(kinds: Set<RoryKind>): void {
  try { localStorage.setItem(KEY, JSON.stringify([...kinds])); } catch {}
}
