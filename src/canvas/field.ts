import { resolveArtUrl } from "../lib/art.ts";
import type { ProgramEntry } from "../lib/station.ts";
import type { TrackInfo, TimeInfo } from "../lib/events.ts";
import { RADIO_TIME, RADIO_TRACK } from "../lib/events.ts";

type Colour = [number, number, number];

const MAX_DPR = 1.5;
const FADE_MS = 2400;
const BASE_THREADS_1440 = 72;
const BASE_THREADS_PHONE = 40;
const PHONE_W = 768;
const PTS = 64;
const SLOW_FRAME_MS = 20;
const SLOW_FRAME_LIMIT = 30;

const MOTES = Array.from({ length: 44 }, (_, i) => ({
  x: hashN(i, 1),
  y: hashN(i, 2),
  r: 0.6 + hashN(i, 3) * 1.6,
  speed: 0.000006 + hashN(i, 4) * 0.000012,
  phase: hashN(i, 5) * Math.PI * 2,
}));

/* ── tiny 2D value noise (no deps) ─────────────────────────── */

function hashN(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263 + 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), -1262868901);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function noise2d(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smoothstep(x - ix), fy = smoothstep(y - iy);
  const a = hashN(ix, iy), b = hashN(ix + 1, iy);
  const c = hashN(ix, iy + 1), d = hashN(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(x: number, y: number): number {
  return noise2d(x, y) * 0.6 + noise2d(x * 2.1, y * 2.1) * 0.3 + noise2d(x * 4.3, y * 4.3) * 0.1;
}

/* ── colour helpers ────────────────────────────────────────── */

function mix(a: Colour, b: Colour, t: number): Colour {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function saturation(c: Colour): number {
  const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
  if (mx === 0) return 0;
  return (mx - mn) / mx;
}

function liftLightness(c: Colour, target: number): Colour {
  const lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  if (lum >= target || lum < 1) return c;
  const f = target / lum;
  return [Math.min(255, Math.round(c[0] * f)), Math.min(255, Math.round(c[1] * f)), Math.min(255, Math.round(c[2] * f))];
}

function colourDist(a: Colour, b: Colour): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function cssVarToRgb(val: string): Colour {
  if (val.startsWith("#")) {
    const h = val.slice(1);
    if (h.length === 3) return [parseInt(h[0], 16) * 17, parseInt(h[1], 16) * 17, parseInt(h[2], 16) * 17];
    if (h.length === 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = val.match(/\d+/g);
  if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
  return [52, 64, 92];
}

function readArtDefaults(): { art1: Colour; art2: Colour; art3: Colour; accent: Colour } {
  const s = getComputedStyle(document.documentElement);
  return {
    art1: cssVarToRgb(s.getPropertyValue("--art-1").trim()),
    art2: cssVarToRgb(s.getPropertyValue("--art-2").trim()),
    art3: cssVarToRgb(s.getPropertyValue("--art-3").trim()),
    accent: cssVarToRgb(s.getPropertyValue("--art-accent").trim()),
  };
}

function rgb(c: Colour): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/* ── palette extraction ────────────────────────────────────── */

function extractDistinct(data: Uint8ClampedArray, count: number): Colour[] {
  const picked: Colour[] = [];
  for (let i = 0; i < data.length; i += 16) {
    const c: Colour = [data[i], data[i + 1], data[i + 2]];
    if (picked.every((p) => colourDist(p, c) > 40)) {
      picked.push(c);
      if (picked.length >= count) break;
    }
  }
  return picked;
}

function derivePalette(raw: Colour[]): { art1: Colour; art2: Colour; art3: Colour; accent: Colour } {
  const sorted = [...raw].sort(
    (a, b) => (0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]) - (0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2]),
  );
  const art1 = sorted[Math.floor(sorted.length / 2)] ?? sorted[0];
  const art2 = sorted[Math.max(0, sorted.length - 2)] ?? art1;
  const art3 = sorted[0] ?? art1;
  let accent = art1;
  let best = 0;
  for (const c of raw) {
    const s = saturation(c);
    if (s > best) { best = s; accent = c; }
  }
  accent = liftLightness(accent, 120);
  return { art1, art2, art3, accent };
}

function publishArt(p: { art1: Colour; art2: Colour; art3: Colour; accent: Colour }): void {
  const el = document.documentElement.style;
  el.setProperty("--art-1", rgb(p.art1));
  el.setProperty("--art-2", rgb(p.art2));
  el.setProperty("--art-3", rgb(p.art3));
  el.setProperty("--art-accent", rgb(p.accent));
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
    return extractDistinct(ctx.getImageData(0, 0, 24, 24).data, 6);
  } catch {
    return null;
  }
}

/* ── thread geometry ───────────────────────────────────────── */

interface ThreadGeom {
  ys: Float32Array;
}

function buildThreads(count: number, w: number, h: number, t: number, breath: number, waveX: number): ThreadGeom[] {
  const threads: ThreadGeom[] = [];
  const spacing = h / (count + 1);
  const noiseT = t * 0.00006;
  // Folds come from one shared field sampled at each thread's height, so neighbours move
  // together and bunch up like cloth; a small per-thread term keeps them from looking ruled.
  const fold = h * (0.045 + 0.035 * breath);
  const fine = spacing * 0.6;
  const unit = 1 / Math.max(w, h);
  for (let i = 0; i < count; i++) {
    const baseY = spacing * (i + 1);
    const ys = new Float32Array(PTS);
    for (let j = 0; j < PTS; j++) {
      const x = (j / (PTS - 1)) * w;
      const big = fbm(x * unit * 2.2 + noiseT, baseY * unit * 3.1 + noiseT * 0.7) - 0.5;
      const small = noise2d(x * unit * 9 - noiseT * 3, i * 0.9 + noiseT) - 0.5;
      let waveDelta = 0;
      if (waveX > -1) {
        const dist = (x - waveX * w) / w;
        waveDelta = Math.exp(-dist * dist * 40) * h * 0.03 * Math.sin(dist * 18);
      }
      ys[j] = baseY + big * fold * 2 + small * fine + waveDelta;
    }
    threads.push({ ys });
  }
  return threads;
}

/* ── main ──────────────────────────────────────────────────── */

export function startField(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  let artPalette = readArtDefaults();
  let prevArt: typeof artPalette | null = null;
  let nextArt: typeof artPalette | null = null;
  let fadeStart = 0;
  let currentEntry: ProgramEntry | null = null;
  let currentTime = 0;
  let rafId = 0;
  let running = true;
  let threadCount = 0;
  let slowFrames = 0;
  let waveProgress = -1;
  let waveStartT = 0;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function currentTheme(): "diary" | "sleek" {
    return (document.documentElement.dataset.theme as "diary" | "sleek") || "diary";
  }

  function computeThreadCount(): number {
    const base = canvas.clientWidth < PHONE_W ? BASE_THREADS_PHONE : BASE_THREADS_1440;
    return Math.max(12, Math.round(base * (canvas.clientHeight / 900)));
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio, MAX_DPR);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    threadCount = computeThreadCount();
    if (reducedMotion) drawStatic();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  /* palette crossfade */
  function visibleArt(now: number): typeof artPalette {
    if (!prevArt || !nextArt) return artPalette;
    const k = Math.min(1, Math.max(0, (now - fadeStart) / FADE_MS));
    if (k >= 1) {
      artPalette = nextArt;
      prevArt = null;
      nextArt = null;
      return artPalette;
    }
    const e = k * k * (3 - 2 * k);
    return {
      art1: mix(prevArt.art1, nextArt.art1, e),
      art2: mix(prevArt.art2, nextArt.art2, e),
      art3: mix(prevArt.art3, nextArt.art3, e),
      accent: mix(prevArt.accent, nextArt.accent, e),
    };
  }

  function setPalette(next: typeof artPalette, now = performance.now()) {
    if (reducedMotion) {
      artPalette = next;
      prevArt = null;
      nextArt = null;
      publishArt(next);
      return;
    }
    if (prevArt && nextArt) artPalette = visibleArt(now);
    prevArt = artPalette;
    nextArt = next;
    fadeStart = now;
  }

  /* breath: swells over one phrase */
  function breathPhase(t: number): number {
    const bpm = currentEntry?.bpm;
    const cycleSec = bpm ? (16 * 60) / bpm : 9;
    const cycleMs = cycleSec * 1000;
    const phase = (t % cycleMs) / cycleMs;
    return 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  }

  /* beat ripple: fraction 0-1 within current beat */
  function beatPulse(t: number): number {
    if (!currentEntry?.bpm) return 0;
    const msPerBeat = 60000 / currentEntry.bpm;
    const elapsed = currentEntry.offset > 0 ? (currentTime - currentEntry.offset) * 1000 : currentTime * 1000;
    const beatT = elapsed % msPerBeat;
    if (beatT < 0) return 0;
    const phase = beatT / msPerBeat;
    return Math.exp(-8 * phase) * 0.12;
  }

  /* track-change wave: normalised x position -1=inactive, 0..1+ = progress */
  function waveX(t: number): number {
    if (waveProgress < 0) return -1;
    const elapsed = t - waveStartT;
    const dur = 1600;
    if (elapsed > dur + 600) { waveProgress = -1; return -1; }
    return 0.33 + (elapsed / dur) * 0.67;
  }

  function drawFrame(t: number) {
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    if (w === 0 || h === 0) return;

    const art = visibleArt(t);
    publishArt(art);

    const theme = currentTheme();
    const breath = breathPhase(t);
    const beat = beatPulse(t);
    const wx = waveX(t);

    ctx.clearRect(0, 0, w, h);

    const threads = buildThreads(threadCount, w, h, t, breath, wx);
    const colours = [art.art1, art.art2, art.art3, art.accent];

    if (theme === "diary") {
      const fg = cssVarToRgb(getComputedStyle(document.documentElement).getPropertyValue("--fg").trim());
      ctx.globalCompositeOperation = "source-over";
      for (let i = 0; i < threads.length; i++) {
        const frac = i / (threads.length - 1);
        const base = colours[Math.min(Math.floor(frac * colours.length), colours.length - 1)];
        const ink = mix(base, fg, 0.65);
        const alpha = 0.07 + 0.1 * frac + beat;
        const lw = 0.7 + 0.4 * frac;
        drawThread(ctx, threads[i], w, lw, `rgba(${ink[0]},${ink[1]},${ink[2]},${alpha.toFixed(3)})`);
      }
    } else {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < threads.length; i++) {
        const frac = i / (threads.length - 1);
        const base = colours[Math.min(Math.floor(frac * colours.length), colours.length - 1)];
        const lifted = liftLightness(base, 140);
        const alpha = 0.06 + 0.06 * frac + beat * 0.5;
        drawThread(ctx, threads[i], w, 2.0 + 0.6 * frac, `rgba(${lifted[0]},${lifted[1]},${lifted[2]},${(alpha * 0.35).toFixed(3)})`);
        drawThread(ctx, threads[i], w, 0.8 + 0.6 * frac, `rgba(${lifted[0]},${lifted[1]},${lifted[2]},${alpha.toFixed(3)})`);
      }
      // haze motes: dust caught in the stage lights, rising slowly
      const glow = liftLightness(art.accent, 190);
      const dpr = Math.min(devicePixelRatio, MAX_DPR);
      for (const m of MOTES) {
        const y = (((m.y - t * m.speed) % 1) + 1) % 1;
        const x = m.x + Math.sin(t * 0.00025 + m.phase) * 0.012;
        const a = (0.18 + 0.22 * Math.sin(t * 0.0009 + m.phase * 3)) * (0.55 + 0.45 * breath) + beat;
        ctx.fillStyle = `rgba(${glow[0]},${glow[1]},${glow[2]},${Math.max(0, a).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x * w, y * h, m.r * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    /* fade out bottom 30% */
    const fadeY = h * 0.7;
    const grad = ctx.createLinearGradient(0, fadeY, 0, h);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,1)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = grad;
    ctx.fillRect(0, fadeY, w, h - fadeY);
    ctx.globalCompositeOperation = "source-over";
  }

  function drawThread(c: CanvasRenderingContext2D, t: ThreadGeom, w: number, lw: number, style: string) {
    c.beginPath();
    const step = w / (PTS - 1);
    c.moveTo(0, t.ys[0]);
    for (let j = 1; j < PTS; j++) {
      const x0 = (j - 1) * step, x1 = j * step;
      const cpx = (x0 + x1) / 2;
      c.quadraticCurveTo(x0, t.ys[j - 1], cpx, (t.ys[j - 1] + t.ys[j]) / 2);
    }
    c.lineTo(w, t.ys[PTS - 1]);
    c.strokeStyle = style;
    c.lineWidth = lw;
    c.stroke();
  }

  function drawStatic() {
    drawFrame(0);
  }

  function loop(t: number) {
    if (!running) return;
    const start = performance.now();
    drawFrame(t);
    const elapsed = performance.now() - start;
    if (elapsed > SLOW_FRAME_MS) {
      slowFrames++;
      if (slowFrames >= SLOW_FRAME_LIMIT) {
        threadCount = Math.max(12, Math.floor(threadCount / 2));
        slowFrames = 0;
      }
    } else {
      slowFrames = Math.max(0, slowFrames - 1);
    }
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (reducedMotion) { drawStatic(); return; }
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

  const themeObserver = new MutationObserver(() => {
    if (!currentEntry) setPalette(readArtDefaults());
    if (reducedMotion) drawStatic();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  document.addEventListener(RADIO_TRACK, ((e: Event) => {
    const ev = e as CustomEvent<TrackInfo>;
    const newEntry = ev.detail.entry;
    const changed = !currentEntry || currentEntry.title !== newEntry.title || currentEntry.offset !== newEntry.offset;
    currentEntry = newEntry;
    if (changed) {
      waveStartT = performance.now();
      waveProgress = 0;
    }
    paletteFromEntry(currentEntry).then((raw) => {
      const p = raw ? derivePalette(raw) : readArtDefaults();
      setPalette(p);
      if (reducedMotion) drawStatic();
    });
  }) as EventListener);

  document.addEventListener(RADIO_TIME, ((e: Event) => {
    const ev = e as CustomEvent<TimeInfo>;
    currentTime = ev.detail.current;
  }) as EventListener);

  start();

  return () => {
    running = false;
    cancelAnimationFrame(rafId);
    document.removeEventListener("visibilitychange", handleVisibility);
    ro.disconnect();
    themeObserver.disconnect();
  };
}
