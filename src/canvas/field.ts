import { resolveArtUrl } from "../lib/art.ts";
import type { ProgramEntry } from "../lib/station.ts";
import { RADIO_TIME, RADIO_TRACK } from "../lib/events.ts";

interface TrackDetail {
  entry: ProgramEntry;
  programTitle: string;
  venue?: string;
  date?: string;
}

interface TimeDetail {
  current: number;
  duration: number;
}

type Colour = [number, number, number];

const BLOB_COUNT = 5;
const OFFSCREEN_SCALE = 1 / 6;
const MAX_DPR = 2;
const NIGHT: Colour = [10, 9, 12];
const FADE_MS = 2400;

function readThemePalette(): Colour[] {
  const s = getComputedStyle(document.documentElement);
  const vars = ["--accent", "--accent-2", "--bg-2", "--fg-dim", "--bg"];
  return vars.map((v) => cssVarToRgb(s.getPropertyValue(v).trim()));
}

function depth(c: Colour, amount = 0.5): Colour {
  return mix(c, NIGHT, amount);
}

function mix(a: Colour, b: Colour, t: number): Colour {
  return [
    Math.round(a[0] * (1 - t) + b[0] * t),
    Math.round(a[1] * (1 - t) + b[1] * t),
    Math.round(a[2] * (1 - t) + b[2] * t),
  ];
}

function cssVarToRgb(val: string): Colour {
  if (val.startsWith("#")) {
    const hex = val.slice(1);
    if (hex.length === 3) {
      return [parseInt(hex[0], 16) * 17, parseInt(hex[1], 16) * 17, parseInt(hex[2], 16) * 17];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }
  const m = val.match(/\d+/g);
  if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
  return [80, 80, 80];
}

function colourDist(a: Colour, b: Colour): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function extractPalette(data: Uint8ClampedArray): Colour[] {
  const picked: Colour[] = [];
  const step = 4;
  for (let i = 0; i < data.length; i += step * 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const c: Colour = [r, g, b];
    if (picked.every((p) => colourDist(p, c) > 40)) {
      picked.push(c);
      if (picked.length === BLOB_COUNT) break;
    }
  }
  return picked;
}

function sortByLuminance(palette: Colour[]): Colour[] {
  return [...palette].sort(
    (a, b) =>
      (0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]) -
      (0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2])
  );
}

async function paletteFromEntry(entry: ProgramEntry): Promise<Colour[] | null> {
  if (entry.type === "id") return null;
  const url = await resolveArtUrl(entry);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const off = new OffscreenCanvas(24, 24);
    const ctx = off.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, 24, 24);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, 24, 24);
    const p = extractPalette(data);
    return p.length >= 2 ? p : null;
  } catch {
    return null;
  }
}

function ensureFive(raw: Colour[], fallback: Colour[]): Colour[] {
  const p = [...raw];
  let fi = 0;
  while (p.length < BLOB_COUNT) p.push(fallback[fi++ % fallback.length]);
  return p.slice(0, BLOB_COUNT);
}

export function startField(canvas: HTMLCanvasElement): () => void {
  let palette: Colour[] = ensureFive([], readThemePalette());
  let prevPalette: Colour[] | null = null;
  let nextPalette: Colour[] | null = null;
  let fadeStart = 0;
  let currentEntry: ProgramEntry | null = null;
  let currentTime = 0;
  let rafId = 0;
  let offscreen: OffscreenCanvas | null = null;
  let offCtx: OffscreenCanvasRenderingContext2D | null = null;
  let running = true;
  const ctx2 = canvas.getContext("2d");

  const setPalette = (next: Colour[], now = performance.now()): void => {
    if (reducedMotion) {
      palette = next;
      prevPalette = null;
      nextPalette = null;
      return;
    }
    if (prevPalette && nextPalette) {
      palette = visiblePalette(now);
    }
    prevPalette = palette;
    nextPalette = next;
    fadeStart = now;
  };

  function visiblePalette(now: number): Colour[] {
    if (!prevPalette || !nextPalette) return palette;
    const k = Math.max(0, Math.min(1, (now - fadeStart) / FADE_MS));
    if (k >= 1) {
      palette = nextPalette;
      prevPalette = null;
      nextPalette = null;
      return palette;
    }
    const e = k * k * (3 - 2 * k);
    return nextPalette.map((c, i) => mix(prevPalette![i], c, e));
  }

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function buildOffscreen() {
    const dpr = Math.min(devicePixelRatio, MAX_DPR);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr * OFFSCREEN_SCALE));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr * OFFSCREEN_SCALE));
    offscreen = new OffscreenCanvas(w, h);
    offCtx = offscreen.getContext("2d")!;
  }

  const ro = new ResizeObserver(() => {
    canvas.width = Math.round(canvas.clientWidth * Math.min(devicePixelRatio, MAX_DPR));
    canvas.height = Math.round(canvas.clientHeight * Math.min(devicePixelRatio, MAX_DPR));
    buildOffscreen();
    if (reducedMotion) drawStatic();
  });
  ro.observe(canvas);

  canvas.width = Math.round(canvas.clientWidth * Math.min(devicePixelRatio, MAX_DPR));
  canvas.height = Math.round(canvas.clientHeight * Math.min(devicePixelRatio, MAX_DPR));
  buildOffscreen();

  function refreshTheme() {
    if (!currentEntry) setPalette(ensureFive([], readThemePalette()));
  }

  const themeObserver = new MutationObserver(refreshTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  function drawFrame(t: number) {
    if (!offscreen || !offCtx || !ctx2) return;
    const ow = offscreen.width, oh = offscreen.height;
    const sorted = sortByLuminance(visiblePalette(t));
    const base = depth(sorted[0], 0.55);

    offCtx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    offCtx.fillRect(0, 0, ow, oh);

    const breath = 0.5 + 0.5 * Math.sin((t / 11000) * Math.PI * 2);

    let beatPulse = 0;
    if (currentEntry?.bpm) {
      const secPerBeat = 60 / currentEntry.bpm;
      const elapsed = currentEntry.offset > 0 ? currentTime - currentEntry.offset : currentTime;
      const beatPhase = (elapsed / secPerBeat) % 1;
      beatPulse = Math.exp(-6 * beatPhase);
    }

    const glow = 0.07 + 0.06 * breath + beatPulse * 0.05;

    const periods = [21300, 28700, 25100, 31900, 23500];
    const phases = [0, 0.6, 1.2, 1.8, 2.5];

    offCtx.globalCompositeOperation = "lighter";

    for (let i = 0; i < BLOB_COUNT; i++) {
      const c = sorted[i] ?? sorted[0];
      const per = periods[i];
      const ph = phases[i];
      const cx = ow * (0.12 + 0.76 * (0.5 + 0.5 * Math.sin(t / per + ph)));
      const cy = oh * (0.15 + 0.7 * (0.5 + 0.5 * Math.cos(t / (per * 0.8) + ph)));
      const r = Math.min(ow, oh) * (0.6 + 0.15 * Math.sin(t / 13000 + i));

      const grad = offCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${glow.toFixed(3)})`);
      grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      offCtx.fillStyle = grad;
      offCtx.fillRect(0, 0, ow, oh);
    }

    offCtx.globalCompositeOperation = "source-over";

    ctx2.clearRect(0, 0, canvas.width, canvas.height);
    ctx2.imageSmoothingEnabled = true;
    ctx2.imageSmoothingQuality = "high";
    ctx2.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
  }

  function drawStatic() {
    drawFrame(0);
  }

  function loop(t: number) {
    if (!running) return;
    drawFrame(t);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (reducedMotion) {
      drawStatic();
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function handleVisibility() {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
    } else if (!reducedMotion) {
      rafId = requestAnimationFrame(loop);
    }
  }

  motionQuery.addEventListener("change", (e) => {
    reducedMotion = e.matches;
    if (reducedMotion) {
      cancelAnimationFrame(rafId);
      drawStatic();
    } else if (!document.hidden) {
      rafId = requestAnimationFrame(loop);
    }
  });

  document.addEventListener("visibilitychange", handleVisibility);

  document.addEventListener(RADIO_TRACK, ((e: Event) => {
    const ev = e as CustomEvent<TrackDetail>;
    currentEntry = ev.detail.entry;
    refreshTheme();
    paletteFromEntry(currentEntry).then((p) => {
      setPalette(ensureFive(p ?? [], readThemePalette()));
      if (reducedMotion) drawStatic();
    });
  }) as EventListener);

  document.addEventListener(RADIO_TIME, ((e: Event) => {
    const ev = e as CustomEvent<TimeDetail>;
    currentTime = ev.detail.current;
  }) as EventListener);

  start();

  return () => {
    running = false;
    cancelAnimationFrame(rafId);
    document.removeEventListener("visibilitychange", handleVisibility);
    ro.disconnect();
    themeObserver.disconnect();
    offscreen = null;
    offCtx = null;
  };
}
