type Rgb = [number, number, number];
interface Lch { l: number; c: number; h: number }

const W = 32;
const H = 18;
const ART_VARS = ["--art-accent", "--art-2", "--art-1", "--art-3"];
const LIGHT = [0.78, 0.72, 0.8, 0.7];
const cache = new Map<string, Promise<string[] | null>>();

const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function toLch([r, g, b]: Rgb): Lch {
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    c: Math.hypot(a, bb),
    h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  };
}

const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** Hue turned half a circle, chroma vivid but not neon, lightness lifted to glow on a dark stage. */
function complement(src: Lch, i: number): string {
  const c = Math.min(0.17, Math.max(0.12, src.c * 1.2));
  return `oklch(${LIGHT[i % 4]} ${c.toFixed(3)} ${((src.h + 180) % 360).toFixed(0)})`;
}

/** The page's own artwork palette, for when the video cannot be read. */
export function artColours(): Rgb[] {
  const cs = getComputedStyle(document.documentElement);
  return ART_VARS.map((v) => (cs.getPropertyValue(v).match(/[\d.]+/g) ?? ["120", "120", "160"]).slice(0, 3).map(Number) as Rgb);
}

export const artComplements = () => artColours().map((c, i) => complement(toLch(c), i));

/** Top four distinct vivid hues of the frame, weighted by chroma; missing ones come from the art palette. */
function dominant(data: Uint8ClampedArray): Lch[] {
  const bins = Array.from({ length: 12 }, () => ({ w: 0, l: 0, c: 0, x: 0, y: 0 }));
  for (let i = 0; i < data.length; i += 4) {
    const p = toLch([data[i], data[i + 1], data[i + 2]]);
    if (p.c < 0.04 || p.l < 0.2) continue;
    const bin = bins[Math.floor(p.h / 30) % 12];
    const w = p.c * p.l;
    bin.w += w;
    bin.l += p.l * w;
    bin.c += p.c * w;
    bin.x += Math.cos((p.h * Math.PI) / 180) * w;
    bin.y += Math.sin((p.h * Math.PI) / 180) * w;
  }
  const picked: Lch[] = [];
  for (const b of bins.filter((v) => v.w > 0).sort((a, z) => z.w - a.w)) {
    const h = ((Math.atan2(b.y, b.x) * 180) / Math.PI + 360) % 360;
    if (picked.every((p) => hueGap(p.h, h) > 40)) picked.push({ l: b.l / b.w, c: b.c / b.w, h });
    if (picked.length === 4) break;
  }
  return picked;
}

async function sample(youtubeId: string): Promise<string[] | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const ctx = new OffscreenCanvas(W, H).getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, W, H);
  const found = dominant(ctx.getImageData(0, 0, W, H).data);
  const art = artColours().map(toLch);
  const pick = (i: number): Lch => {
    const base = found[i % found.length];
    return found[i] ?? (base ? { ...base, h: base.h + [0, 70, 120, 240][i] } : art[i]);
  };
  return Array.from({ length: 4 }, (_, i) => complement(pick(i), i));
}

/** In-memory pixel reading only; resolves null on CORS or load failure. */
export function videoComplements(youtubeId: string): Promise<string[] | null> {
  let hit = cache.get(youtubeId);
  if (!hit) cache.set(youtubeId, (hit = sample(youtubeId)));
  return hit;
}
