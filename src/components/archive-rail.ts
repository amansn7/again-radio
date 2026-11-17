export interface Album {
  year: number;
  title: string;
  subtitle: string;
  kind: string;
  /** Precomputed by scripts/resolve-art.mjs; the runtime lookup is the fallback. */
  art?: string;
}

export interface AlbumsData {
  albums: Album[];
}

function isAlbum(v: unknown): v is Album {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.year === "number" && typeof r.title === "string" && typeof r.subtitle === "string";
}

export function parseAlbumsData(raw: unknown): AlbumsData {
  if (typeof raw !== "object" || raw === null) return { albums: [] };
  const r = raw as Record<string, unknown>;
  const albums = Array.isArray(r.albums) ? r.albums.filter(isAlbum) : [];
  return { albums };
}

export function fmtOffset(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
