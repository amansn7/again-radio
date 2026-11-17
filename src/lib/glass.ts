import { fieldURL, filterMarkup } from "./glass-map.ts";
import type { GlassAppearance, GlassMaterial } from "./glass-map.ts";

export type GlassEngine = "chromium" | "webkit" | "gecko";

const APPEARANCE: GlassAppearance = "dark";
const REFRACTION = 14;
const MAX_BEZEL = 32;
// ponytail: refraction over a playing video is paid per frame per surface; beyond this many, extra surfaces frost.
const MAX_REFRACTING = 4;
const RESIZE_DEBOUNCE_MS = 120;
const SVG_NS = "http://www.w3.org/2000/svg";

let engine: GlassEngine | null = null;

/** Chrome's UA contains "Safari/", so WebKit is detected by the absence of a Chromium token. */
export function detectEngine(): GlassEngine {
  if (engine) return engine;
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return (engine = "gecko");
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  const chromium = brands?.length
    ? brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/i.test(b.brand))
    : /(Chrome|Chromium|Edg|SamsungBrowser)\/\d+/.test(ua);
  return (engine = chromium ? "chromium" : "webkit");
}

let host: SVGSVGElement | null = null;
const filters = new Map<string, { el: SVGFilterElement; count: number }>();

function acquire(id: string, markup: () => string): boolean {
  const held = filters.get(id);
  if (held) {
    held.count++;
    return true;
  }
  const field = markup();
  if (!field) return false;
  if (!host) {
    host = document.createElementNS(SVG_NS, "svg");
    host.setAttribute("aria-hidden", "true");
    host.setAttribute("width", "0");
    host.setAttribute("height", "0");
    host.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none";
    document.body.appendChild(host);
  }
  const el = document.createElementNS(SVG_NS, "filter");
  el.id = id;
  el.setAttribute("color-interpolation-filters", "sRGB");
  el.innerHTML = field;
  host.appendChild(el);
  filters.set(id, { el, count: 1 });
  return true;
}

function release(id: string) {
  const held = filters.get(id);
  if (held && --held.count <= 0) {
    held.el.remove();
    filters.delete(id);
  }
}

interface Lens { filter: string; timer: number }
const lenses = new Map<HTMLElement, Lens>();

function measure(el: HTMLElement) {
  const lens = lenses.get(el);
  if (!lens) return;
  const w = el.offsetWidth, h = el.offsetHeight;
  if (!w || !h) return;
  const material: GlassMaterial = el.dataset.glass === "regular" ? "regular" : "clear";
  const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
  const id = `lg-${w}x${h}r${Math.round(r)}${material[0]}`;
  if (id === lens.filter) return;
  const markup = () => {
    const field = fieldURL(w, h, r, Math.min(MAX_BEZEL, w / 2, h / 2));
    return field && filterMarkup({ w, h, field, material, appearance: APPEARANCE, refraction: REFRACTION });
  };
  if (!acquire(id, markup)) return void (el.dataset.glassMode = "frost");
  if (lens.filter) release(lens.filter);
  lens.filter = id;
  el.style.setProperty("--glass-filter", `url(#${id}) blur(1px)`);
  el.dataset.glassMode = "refract";
}

const resized = new ResizeObserver((entries) => {
  for (const { target } of entries) {
    const lens = lenses.get(target as HTMLElement);
    if (!lens) continue;
    clearTimeout(lens.timer);
    lens.timer = window.setTimeout(() => measure(target as HTMLElement), RESIZE_DEBOUNCE_MS);
  }
});

function onPointer(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement;
  const box = el.getBoundingClientRect();
  el.style.setProperty("--gx", `${e.clientX - box.left}px`);
  el.style.setProperty("--gy", `${e.clientY - box.top}px`);
}

function onLeave(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement;
  el.style.removeProperty("--gx");
  el.style.removeProperty("--gy");
}

function upgrade(el: HTMLElement) {
  if (el.dataset.glassMode) return;
  el.addEventListener("pointermove", onPointer, { passive: true });
  el.addEventListener("pointerleave", onLeave, { passive: true });
  if (detectEngine() !== "chromium" || lenses.size >= MAX_REFRACTING) {
    el.dataset.glassMode = "frost";
    return;
  }
  lenses.set(el, { filter: "", timer: 0 });
  el.dataset.glassMode = "pending";
  resized.observe(el);
  measure(el);
}

function downgrade(el: HTMLElement) {
  const lens = lenses.get(el);
  if (lens) {
    clearTimeout(lens.timer);
    if (lens.filter) release(lens.filter);
    resized.unobserve(el);
    lenses.delete(el);
  }
  el.removeEventListener("pointermove", onPointer);
  el.removeEventListener("pointerleave", onLeave);
  el.style.removeProperty("--glass-filter");
  delete el.dataset.glassMode;
}

function scan(node: Node) {
  if (!(node instanceof HTMLElement)) return;
  if (node.hasAttribute("data-glass")) upgrade(node);
  node.querySelectorAll<HTMLElement>("[data-glass]").forEach(upgrade);
}

const flag = globalThis as { __againGlass?: boolean };
if (typeof document !== "undefined" && !flag.__againGlass) {
  flag.__againGlass = true;
  scan(document.documentElement);
  new MutationObserver((records) => {
    for (const rec of records) {
      if (rec.type === "attributes") {
        const el = rec.target as HTMLElement;
        downgrade(el);
        if (el.hasAttribute("data-glass")) upgrade(el);
        continue;
      }
      rec.addedNodes.forEach(scan);
      if (rec.removedNodes.length) for (const el of [...lenses.keys()]) if (!el.isConnected) downgrade(el);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-glass"] });
}
