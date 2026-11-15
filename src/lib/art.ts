import type { ProgramEntry } from "./station.ts";

export const RELEASE_GROUP_MBID = "bca46a0c-25c9-42ca-98c2-e64c8a5e337e";

const DEFAULT_ARTIST = "Fred again..";

export function coverArtUrl(): string {
  return `https://coverartarchive.org/release-group/${RELEASE_GROUP_MBID}/front-500`;
}

export function itunesUrl(term: string, entity: "album" | "song"): string {
  return `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=5`;
}

export function upgradeArtUrl(url: string): string {
  return url.replace("100x100bb", "600x600bb");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function firstArtwork(body: unknown): string | null {
  if (!isRecord(body) || !Array.isArray(body.results)) return null;
  const first = body.results[0];
  if (!isRecord(first)) return null;
  const art = first.artworkUrl100;
  return typeof art === "string" && art ? art : null;
}

export async function resolveArtUrl(entry: ProgramEntry): Promise<string | null> {
  const artist = entry.artist?.trim() || DEFAULT_ARTIST;
  const terms: { term: string; entity: "album" | "song" }[] = [];
  if (entry.title) terms.push({ term: `${artist} ${entry.title}`, entity: "song" });
  if (entry.album) terms.push({ term: `${artist} ${entry.album}`, entity: "album" });

  for (const { term, entity } of terms) {
    const art = await searchArt(term, entity);
    if (art) return art;
  }
  return null;
}

async function searchArt(term: string, entity: "album" | "song"): Promise<string | null> {
  try {
    const res = await fetch(itunesUrl(term, entity));
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const art = firstArtwork(body);
    return art ? upgradeArtUrl(art) : null;
  } catch {
    return null;
  }
}
