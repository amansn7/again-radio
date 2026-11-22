import { derivePalette } from "../lib/palette.ts";
import { cardSize } from "../lib/art.ts";
import type { TrackInfo } from "../lib/events.ts";
import { esc } from "./archive-rail.ts";
import type { Card } from "./dial-data.ts";

const tints = new Map<string, string>();
const warmed = new Map<string, Promise<void>>();
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

function bindCardTilt(el: HTMLElement): void {
  if (reduce.matches) return;
  let rect: DOMRect | null = null;

  const onEnter = (): void => {
    rect = el.getBoundingClientRect();
    el.classList.add("is-tilting");
  };

  const onMove = (e: MouseEvent): void => {
    if (!rect) rect = el.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const tiltY = (px - 0.5) * 14;
    const tiltX = (0.5 - py) * 14;

    el.style.setProperty("--tilt-x", `${tiltX.toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${tiltY.toFixed(2)}deg`);
    el.style.setProperty("--glare-x", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--glare-y", `${(py * 100).toFixed(1)}%`);
  };

  const onLeave = (): void => {
    rect = null;
    el.classList.remove("is-tilting");
    el.style.removeProperty("--tilt-x");
    el.style.removeProperty("--tilt-y");
    el.style.removeProperty("--glare-x");
    el.style.removeProperty("--glare-y");
  };

  el.addEventListener("mouseenter", onEnter);
  el.addEventListener("mousemove", onMove);
  el.addEventListener("mouseleave", onLeave);
}

/** The rim and glow take the art's most saturated colour; a tainted canvas keeps --accent. */
function tint(img: HTMLImageElement): string {
  let c = tints.get(img.src);
  if (c !== undefined) return c;
  c = "";
  try {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 12;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, 12, 12);
    const d = ctx.getImageData(0, 0, 12, 12).data;
    const raw: [number, number, number][] = [];
    for (let i = 0; i < d.length; i += 4) raw.push([d[i], d[i + 1], d[i + 2]]);
    c = `rgb(${derivePalette(raw)[3].join(" ")})`;
  } catch {
    c = "";
  }
  tints.set(img.src, c);
  return c;
}

function image(url: string, high = false): HTMLImageElement {
  const img = new Image();
  img.alt = "";
  img.decoding = "async";
  img.crossOrigin = "anonymous";
  if (high) img.fetchPriority = "high";
  img.src = url;
  return img;
}

/** Fetch and decode art for a card that is about to turn into view, and learn its colour. */
export function warm(c: Card): void {
  void c.art().then((raw) => {
    if (!raw) return;
    const url = cardSize(raw);
    if (warmed.has(url)) return;
    const img = image(url);
    warmed.set(url, img.decode().then(() => void tint(img), () => {}));
  });
}

function loadArt(el: HTMLElement, url: string, high: boolean): void {
  const known = tints.get(url);
  if (known) el.style.setProperty("--rim", known);
  const img = image(url, high);
  const show = () => {
    el.querySelector(".dl-art")?.replaceChildren(img);
    el.classList.add("has-art");
    const c = tint(img);
    if (c) el.style.setProperty("--rim", c);
  };
  if (img.complete && img.naturalWidth) return show();
  img.onload = show;
  img.onerror = () => {
    const plain = new Image();
    plain.alt = "";
    plain.onload = () => {
      el.querySelector(".dl-art")?.replaceChildren(plain);
      el.classList.add("has-art");
    };
    plain.src = url;
  };
}

export function cardEl(c: Card, air: TrackInfo | null, front: boolean): HTMLElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "dl-card";
  b.dataset.shape = c.shape;
  bindCardTilt(b);
  if (!c.cue) b.setAttribute("aria-disabled", "true");
  if (air && c.onAir(air)) b.setAttribute("aria-current", "true");
  b.innerHTML =
    `<span class="dl-face"><span class="dl-art"></span><span class="dl-body">` +
    `<span class="dl-tags"><span class="dl-badge">${esc(c.badge)}</span>` +
    `<span class="dl-live"><span class="live-dot"></span>On air</span></span>` +
    `<span class="dl-title">${esc(c.title)}</span><span class="dl-sub num">${esc(c.sub)}</span></span></span>`;
  void c.art().then((url) => {
    if (url) loadArt(b, cardSize(url), front);
  });
  return b;
}
