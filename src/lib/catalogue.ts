import { fetchJson } from "./station.ts";

export type CatalogueKind = "song" | "video" | "live" | "set" | "film" | "other";

export interface CatalogueItem {
  youtubeId: string;
  title: string;
  song?: string;
  /** Poster-style name for the hero when the video has no tracklist, e.g. "The Lot Radio". */
  place?: string;
  kind: CatalogueKind;
  duration: number;
  published?: string;
  album?: string;
  channel: string;
}

const KINDS: CatalogueKind[] = ["song", "video", "live", "set", "film", "other"];

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function parseItem(v: unknown): CatalogueItem | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const youtubeId = str(r.youtubeId);
  const title = str(r.title);
  const channel = str(r.channel);
  const kind = KINDS.find((k) => k === r.kind);
  const duration = typeof r.duration === "number" && r.duration >= 0 ? Math.round(r.duration) : null;
  if (!youtubeId || !/^[\w-]{11}$/.test(youtubeId) || !title || !channel || !kind || duration === null) {
    return null;
  }
  const item: CatalogueItem = { youtubeId, title, kind, duration, channel };
  const song = str(r.song);
  if (song) item.song = song;
  const place = str(r.place);
  if (place) item.place = place;
  const published = str(r.published);
  if (published) item.published = published;
  const album = str(r.album);
  if (album) item.album = album;
  return item;
}

export function parseCatalogue(raw: unknown): CatalogueItem[] {
  if (typeof raw !== "object" || raw === null) return [];
  const items = (raw as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  return items.map(parseItem).filter((i): i is CatalogueItem => i !== null);
}

export async function loadCatalogue(): Promise<CatalogueItem[]> {
  try {
    return parseCatalogue(await fetchJson("/data/catalogue.json"));
  } catch {
    return [];
  }
}
