import type { CatalogueItem } from "./catalogue.ts";
import type { Program } from "./station.ts";

export function videoProgram(v: CatalogueItem): Program {
  const published = v.published?.slice(0, 10);
  const program: Program = {
    id: `video-${v.youtubeId}`,
    title: v.title,
    venue: v.channel,
    youtubeId: v.youtubeId,
    duration: v.duration,
    entries: [{ offset: 0, duration: v.duration, type: "track", title: v.song ?? v.title }],
  };
  if (published && /^\d{4}-\d\d-\d\d$/.test(published)) program.date = published;
  return program;
}

/** `'22 7 29`, the camera imprint. */
export function stampText(date: string | undefined): string {
  const m = date?.match(/^(\d{4})-(\d\d)-(\d\d)$/);
  return m ? `'${m[1].slice(2)} ${+m[2]} ${+m[3]}` : "";
}

/** `Boiler Room: London, 29 Jul 2022` */
export function creditText(p: Program): string {
  if (!p.date) return p.title;
  const d = new Date(`${p.date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${p.title}, ${d}`;
}
