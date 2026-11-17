import { onPulse } from "../lib/pulse.ts";
import { createDisco, type Colours } from "./disco-gl.ts";

const RISE = 0.95;
const HOLD = 2.6;
const FALL = 1.0;
const FADE = 0.18;
const END = RISE + HOLD + FALL;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const inOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const smooth = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

let stage: { canvas: HTMLCanvasElement; gl: NonNullable<ReturnType<typeof createDisco>> } | null | undefined;
let busy = false;

function rgb(css: string, ctx: CanvasRenderingContext2D): [number, number, number] {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#88a";
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

function getStage() {
  if (stage !== undefined) return stage;
  const canvas = document.createElement("canvas");
  canvas.className = "disco-stage";
  canvas.setAttribute("aria-hidden", "true");
  canvas.addEventListener("webglcontextlost", () => (stage = undefined));
  try {
    const gl = createDisco(canvas);
    stage = gl && { canvas, gl };
  } catch (err) {
    console.warn("disco: WebGL unavailable", err);
    stage = null;
  }
  return stage;
}

function randomFacing(): [number, number, number] {
  const a = Math.random() * Math.PI * 2;
  const k = Math.random() * 0.8;
  return [Math.cos(a) * k, Math.sin(a) * k, Math.sqrt(1 - k * k)];
}

/** Lifts the orb to the middle of the screen, turns it into a mirror ball, then puts it back. */
export function disco(orb: HTMLElement) {
  if (busy || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const s = getStage();
  if (!s) return;
  busy = true;
  const { canvas, gl } = s;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;

  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const cs = getComputedStyle(orb);
  gl.colours([1, 2, 3, 4].map((i) => rgb(cs.getPropertyValue(`--orb-c${i}`).trim(), ctx)) as Colours);

  let kick = 0;
  const stop = onPulse((b) => (kick = b.kick * b.env));
  const t0 = performance.now();
  let last = t0;
  // Every show is its own: tile pattern, start angle, spin direction and tilt are rolled per tap.
  const seed = Math.random();
  const spin = Math.random() < 0.5 ? -1 : 1;
  const tilt = 0.2 + Math.random() * 0.3;
  let rot = Math.random() * Math.PI * 2;
  let burstT = RISE;
  let burstAt = randomFacing();
  let ball = { x: 0, y: 0, r: 1 };
  const touch = (e: PointerEvent) => {
    const dx = (e.clientX - ball.x) / ball.r;
    const dy = (e.clientY - ball.y) / ball.r;
    const d2 = dx * dx + dy * dy;
    burstAt = d2 < 1 ? [dx, dy, Math.sqrt(1 - d2)] : randomFacing();
    burstT = (performance.now() - t0) / 1000;
  };
  addEventListener("pointerdown", touch, { passive: true });

  canvas.style.opacity = "0";
  document.body.append(canvas);

  const frame = (now: number) => {
    const t = (now - t0) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const pIn = clamp(t / RISE);
    const pOut = clamp((t - RISE - HOLD) / FALL);
    const travel = inOut(pIn) * (1 - inOut(pOut));
    // Grows with the travel, then settles past full size like it was caught on a wire.
    const size = pOut > 0 ? 1 - inOut(pOut) : inOut(pIn) + 0.06 * Math.sin(Math.PI * smooth(0.55, 1, pIn));
    const spots = smooth(RISE - 0.2, RISE + 0.4, t) * (1 - smooth(RISE + HOLD - 0.35, RISE + HOLD + 0.15, t));
    rot += dt * spin * (0.5 + 1.7 * spots);

    const r = orb.getBoundingClientRect();
    const big = Math.min(innerWidth, innerHeight) * 0.2;
    const sway = Math.sin(t * 1.9) * big * 0.025 * spots;
    const arc = Math.sin(Math.PI * travel) * big * 0.35;
    const cx = r.left + r.width / 2 + (innerWidth / 2 - r.left - r.width / 2) * travel + sway;
    const cy = r.top + r.height / 2 + (innerHeight / 2 - r.top - r.height / 2) * travel - arc;

    const radius = r.width / 2 + (big - r.width / 2) * size;
    ball = { x: cx, y: cy, r: radius };
    gl.draw(
      {
        cx: cx * dpr,
        cy: cy * dpr,
        r: radius * dpr * (1 + kick * 0.02 * spots),
        rot,
        tilt,
        seed,
        burst: t >= burstT ? t - burstT : 99,
        burstAt,
        t,
        facet: smooth(0.3, 1, pIn) * (1 - smooth(0, 0.65, pOut)),
        kick,
        spots,
        glow: 0.6 + 0.4 * spots,
        dim: 0.6 * travel,
      },
      dpr,
    );
    // Crossfade with the CSS orb on the same clock as the motion.
    const fade = Math.min(clamp(t / FADE), 1 - clamp((t - END) / FADE));
    canvas.style.opacity = String(fade);
    orb.style.opacity = String(1 - fade);

    if (t < END + FADE) return void requestAnimationFrame(frame);
    stop();
    removeEventListener("pointerdown", touch);
    canvas.remove();
    orb.style.removeProperty("opacity");
    busy = false;
  };
  requestAnimationFrame(frame);
}
