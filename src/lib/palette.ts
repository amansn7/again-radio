import { resolveArtUrl } from "./art.ts";
import type { ProgramEntry } from "./station.ts";
import type { TrackInfo } from "./events.ts";
import { RADIO_TRACK } from "./events.ts";

type Colour = [number, number, number];
const ART_VARS = ["--art-1", "--art-2", "--art-3", "--art-accent"] as const;

const luma = (c: Colour) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const dist = (a: Colour, b: Colour) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function saturation(c: Colour): number {
  const mx = Math.max(...c);
  return mx === 0 ? 0 : (mx - Math.min(...c)) / mx;
}

function lift(c: Colour, target: number): Colour {
  const l = luma(c);
  if (l >= target || l < 1) return c;
  return c.map((v) => Math.min(255, Math.round((v * target) / l))) as Colour;
}

export function derivePalette(raw: Colour[]): Colour[] {
  const sorted = [...raw].sort((a, b) => luma(a) - luma(b));
  const art1 = sorted[Math.floor(sorted.length / 2)];
  const accent = raw.reduce((best, c) => (saturation(c) > saturation(best) ? c : best), art1);
  return [art1, sorted[Math.max(0, sorted.length - 2)], sorted[0], lift(accent, 120)];
}

async function sampleArt(entry: ProgramEntry): Promise<Colour[] | null> {
  if (entry.type === "id") return null;
  const url = await resolveArtUrl(entry);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const ctx = new OffscreenCanvas(24, 24).getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, 24, 24);
    bitmap.close();
    const data = ctx.getImageData(0, 0, 24, 24).data;
    const picked: Colour[] = [];
    for (let i = 0; i < data.length && picked.length < 6; i += 16) {
      const c: Colour = [data[i], data[i + 1], data[i + 2]];
      if (picked.every((p) => dist(p, c) > 40)) picked.push(c);
    }
    return picked.length ? picked : null;
  } catch {
    return null;
  }
}

// The registered --art-* properties transition in theme.css, so setting them crossfades.
export function startPalette(): void {
  let key = "";
  document.addEventListener(RADIO_TRACK, (e) => {
    const entry = (e as CustomEvent<TrackInfo>).detail.entry;
    const next = `${entry.title}@${entry.offset}`;
    if (next === key) return;
    key = next;
    sampleArt(entry).then((raw) => {
      if (key !== next) return;
      const style = document.documentElement.style;
      const p = raw ? derivePalette(raw) : null;
      ART_VARS.forEach((v, i) => (p ? style.setProperty(v, `rgb(${p[i].join(",")})`) : style.removeProperty(v)));
    });
  });
}
