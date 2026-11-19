import type { ProgramEntry } from "./station.ts";

export const RELEASE_GROUP_MBID = "bca46a0c-25c9-42ca-98c2-e64c8a5e337e";
const ARTIST_MBID = RELEASE_GROUP_MBID;

const DEFAULT_ARTIST = "Fred again..";

export function coverArtUrl(): string {
  return `https://coverartarchive.org/release-group/${RELEASE_GROUP_MBID}/front-500`;
}

export function itunesUrl(term: string, entity: "album" | "song"): string {
  return `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=15`;
}

export function upgradeArtUrl(url: string): string {
  return url.replace("100x100bb", "600x600bb");
}

/** 320x180, true 16:9 with no letterbox; mq1-3 are frames from a quarter, half and three quarters in. */
export function ytThumb(id: string, frame = 0): string {
  return `https://i.ytimg.com/vi/${id}/${frame ? `mq${frame}` : "mqdefault"}.jpg`;
}

/** Card-sized variants: 300px iTunes, 250px Cover Art Archive, 320px YouTube. */
export function cardSize(url: string): string {
  return url
    .replace(/\/\d+x\d+bb\./, "/300x300bb.")
    .replace(/\/front-\d+$/, "/front-250")
    .replace(/\/(hq|sd|maxres)default\.jpg$/, "/mqdefault.jpg");
}

/** "Actual Life 3 (January 1 - …)" and "Actual Life 3 - EP" both become "actual life 3". */
export function normTitle(s: string): string {
  return s.toLowerCase().replace(/\s*\([^)]*\)/g, "").replace(/\s+-\s+(ep|single)$/, "").replace(/\s+/g, " ").trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// The storefront often ranks unrelated singles first, so prefer a result whose name matches.
function pickArtwork(body: unknown, want: string, field: "trackName" | "collectionName"): string | null {
  if (!isRecord(body) || !Array.isArray(body.results)) return null;
  const rows = body.results.filter(isRecord);
  const name = (r: Record<string, unknown>) => normTitle(String(r[field] ?? ""));
  const w = normTitle(want);
  const hit = w ? rows.find((r) => name(r) === w) ?? rows.find((r) => name(r).startsWith(w)) : rows[0];
  const art = hit?.artworkUrl100;
  return typeof art === "string" && art ? upgradeArtUrl(art) : null;
}

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// MusicBrainz allows one request a second; a burst of cards would otherwise get 503s.
let mbTurn: Promise<unknown> = Promise.resolve();
function mbJson(url: string): Promise<unknown> {
  const p = mbTurn.then(() => getJson(url));
  mbTurn = p.then(() => new Promise((r) => setTimeout(r, 1100)));
  return p;
}

const memo = new Map<string, Promise<string | null>>();
function once(key: string, run: () => Promise<string | null>): Promise<string | null> {
  let p = memo.get(key);
  if (!p) memo.set(key, (p = run()));
  return p;
}

export function resolveArtUrl(entry: ProgramEntry, youtubeId?: string): Promise<string | null> {
  if (entry.art) return Promise.resolve(entry.art);
  if (entry.type === "id" || entry.type === "interlude") return Promise.resolve(null);
  const artist = entry.artist?.trim() || DEFAULT_ARTIST;
  return once(`song|${artist}|${entry.title}|${entry.album}|${youtubeId ?? ""}`, async () => {
    if (entry.title) {
      const a = pickArtwork(await getJson(itunesUrl(`${artist} ${entry.title}`, "song")), entry.title, "trackName");
      if (a) return a;
    }
    if (entry.album) {
      const a = pickArtwork(await getJson(itunesUrl(`${artist} ${entry.album}`, "album")), entry.album, "collectionName");
      if (a) return a;
    }
    const general = pickArtwork(await getJson(itunesUrl(artist, "album")), "", "trackName");
    if (general) return general;
    return youtubeId ? ytThumb(youtubeId) : null;
  });
}

/** iTunes first (songs carry their release's art), then MusicBrainz -> Cover Art Archive. */
export function resolveAlbumArt(title: string): Promise<string | null> {
  return once(`album|${title}`, async () => {
    const it = pickArtwork(await getJson(itunesUrl(`Fred again ${normTitle(title)}`, "song")), title, "collectionName");
    if (it) return it;
    const q = `releasegroup:"${normTitle(title).replace(/"/g, "")}" AND arid:${ARTIST_MBID}`;
    const mb = await mbJson(`https://musicbrainz.org/ws/2/release-group?fmt=json&limit=1&query=${encodeURIComponent(q)}`);
    const groups = isRecord(mb) && Array.isArray(mb["release-groups"]) ? mb["release-groups"] : [];
    const id = isRecord(groups[0]) ? groups[0].id : null;
    return typeof id === "string" ? `https://coverartarchive.org/release-group/${id}/front-500` : null;
  });
}
