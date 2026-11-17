/** Share of the 16:9 frame the picture actually fills, after black bars baked into the upload. */
export interface Fill {
  x: number;
  y: number;
}

const FULL: Fill = { x: 1, y: 1 };
const W = 160;
const H = 90;
const cache = new Map<string, Promise<Fill>>();

// Bars are pure black; a dark stage is not. Allow JPEG noise only.
const DARK = 14;

function barWidth(px: Uint8ClampedArray, len: number, at: (i: number, j: number) => number, span: number): number {
  let n = 0;
  for (; n < len / 4; n++) {
    let bright = 0;
    for (let j = 0; j < span; j++) {
      const p = at(n, j);
      if (Math.max(px[p], px[p + 1], px[p + 2]) > DARK) bright++;
    }
    if (bright > span * 0.02) break;
  }
  return n;
}

export function measureFill(px: Uint8ClampedArray, w: number, h: number): Fill {
  const left = barWidth(px, w, (i, j) => (j * w + i) * 4, h);
  const right = barWidth(px, w, (i, j) => (j * w + (w - 1 - i)) * 4, h);
  const top = barWidth(px, h, (i, j) => (i * w + j) * 4, w);
  const bottom = barWidth(px, h, (i, j) => ((h - 1 - i) * w + j) * 4, w);
  // Only symmetric bars are letterboxing; a black edge on one side is part of the picture.
  const sym = (a: number, b: number, len: number) => (a > len * 0.03 && Math.abs(a - b) <= 2 ? (len - a - b) / len : 1);
  return { x: sym(left, right, w), y: sym(top, bottom, h) };
}

export function videoFill(youtubeId: string): Promise<Fill> {
  let p = cache.get(youtubeId);
  if (p) return p;
  p = new Promise<Fill>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const c = new OffscreenCanvas(W, H);
        const g = c.getContext("2d", { willReadFrequently: true })!;
        g.drawImage(img, 0, 0, W, H);
        resolve(measureFill(g.getImageData(0, 0, W, H).data, W, H));
      } catch {
        resolve(FULL);
      }
    };
    img.onerror = () => resolve(FULL);
    img.src = `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`;
  });
  cache.set(youtubeId, p);
  return p;
}
