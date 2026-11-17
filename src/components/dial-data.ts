import type { Program, ProgramEntry } from "../lib/station.ts";
import type { CatalogueItem } from "../lib/catalogue.ts";
import type { CueInfo, TrackInfo } from "../lib/events.ts";
import { normTitle, resolveAlbumArt, resolveArtUrl, ytThumb } from "../lib/art.ts";
import { fmtOffset, type Album } from "./archive-rail.ts";

export type Choice = "order" | "shows" | "albums";
export interface Loaded { path: string; data: Program }
export interface Card {
  title: string;
  sub: string;
  badge: string;
  /** Album and song art is square; concert thumbnails are 16:9. The frame matches so nothing is cropped. */
  shape: "square" | "wide";
  art: () => Promise<string | null>;
  cue: CueInfo | null;
  onAir: (t: TrackInfo) => boolean;
}

export const EVERY_SHOW = "programs/usb002-every-show.json";
const LIVE_KINDS = new Set(["live", "set"]);
const year = (d?: string) => (d ? d.slice(0, 4) : "");
const cased = (s: string) => (s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s);
const none = () => Promise.resolve(null);
const given = (url: unknown) => (typeof url === "string" && url ? url : null);

function songArt(en: ProgramEntry): () => Promise<string | null> {
  const pre = given(en.art);
  return pre ? () => Promise.resolve(pre) : () => resolveArtUrl(en);
}

export function trackCards({ path, data }: Loaded): Card[] {
  return data.entries.map((en, index) => ({
    title: en.title ?? (en.type === "id" ? "Unreleased ID" : "Interlude"),
    sub: fmtOffset(en.offset),
    badge: en.type === "track" ? "Track" : en.type === "id" ? "ID" : "Interlude",
    shape: "square",
    art: en.type === "track" ? songArt(en) : none,
    cue: { program: path, offset: en.offset },
    onAir: (t) => t.programPath === path && t.index === index,
  }));
}

/** Rotation programmes, USB002's shows and catalogue performances, newest first. */
export function showCards(programs: Loaded[], catalogue: CatalogueItem[]): Card[] {
  const ids = new Set(programs.map((p) => p.data.youtubeId));
  const groups: { date: string; cards: Card[] }[] = programs.map(({ path, data }) => ({
    date: data.date ?? "",
    cards: path === EVERY_SHOW
      ? data.entries.map((en, index) => ({
          title: cased(en.title ?? "Show"),
          sub: `USB002 · ${year(data.date)}`,
          badge: "Show",
          shape: "wide" as const,
          art: () => Promise.resolve(ytThumb(data.youtubeId, (index % 3) + 1)),
          cue: { program: path, offset: en.offset },
          onAir: (t: TrackInfo) => t.programPath === path && t.index === index,
        }))
      : [{
          title: data.title,
          sub: [data.venue, year(data.date)].filter(Boolean).join(" · "),
          badge: "Set",
          shape: "wide" as const,
          art: () => Promise.resolve(ytThumb(data.youtubeId)),
          cue: { program: path, offset: 0 },
          onAir: (t: TrackInfo) => t.programPath === path,
        }],
  }));
  for (const video of catalogue) {
    if (!LIVE_KINDS.has(video.kind) || ids.has(video.youtubeId)) continue;
    ids.add(video.youtubeId);
    groups.push({ date: video.published ?? "", cards: [{
      title: video.title,
      sub: [year(video.published), video.channel].filter(Boolean).join(" · "),
      badge: video.kind === "set" ? "Set" : "Live",
      shape: "wide",
      art: () => Promise.resolve(ytThumb(video.youtubeId)),
      cue: { video, offset: 0 },
      onAir: (t: TrackInfo) => t.programPath === `video:${video.youtubeId}`,
    }] });
  }
  return groups.sort((a, b) => b.date.localeCompare(a.date)).flatMap((g) => g.cards);
}

export function albumEntry(title: string, programs: Loaded[]): { path: string; entry: ProgramEntry } | null {
  const want = normTitle(title);
  for (const { path, data } of programs) {
    const entry = data.entries.find((e) => e.album && normTitle(e.album) === want);
    if (entry) return { path, entry };
  }
  return null;
}

export function albumCards(albums: Album[], programs: Loaded[]): Card[] {
  return albums.map((a) => {
    const hit = albumEntry(a.title, programs);
    const want = normTitle(a.title);
    const pre = given(a.art);
    return {
      title: a.title.replace(/\s*\([^)]*\d{4}\)$/, ""),
      sub: hit ? a.subtitle : `${a.subtitle} · not on air yet`,
      badge: a.kind ? a.kind.charAt(0).toUpperCase() + a.kind.slice(1) : "Release",
      shape: "square",
      art: pre ? () => Promise.resolve(pre) : () => resolveAlbumArt(a.title),
      cue: hit ? { program: hit.path, offset: hit.entry.offset } : null,
      onAir: (t: TrackInfo) => !!t.entry.album && normTitle(t.entry.album) === want,
    };
  });
}
