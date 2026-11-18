import type { Ring } from "./dial-ring.ts";

const MS_PER_CARD = 4200;
const FADE_MS = 450;

export interface Drift {
  /** Whether this view drifts at all (Shows and Albums do; the running order follows the air). */
  enable(on: boolean): void;
  /** The listener's pause; returns the new paused state. */
  toggle(): boolean;
}

/**
 * Turns the ring on its own, slowly and continuously, and loops by fading back to the first card.
 * It stands still whenever someone is looking closely (hover, focus, a recent drag), when the ring
 * is off screen or the tab hidden, and always under reduced motion (the ring is flat then).
 */
export function drift(ring: Ring, stage: HTMLElement, track: HTMLElement): Drift {
  let enabled = false;
  let paused = false;
  let hover = false;
  let inView = false;
  let raf = 0;
  let last = 0;
  let since = 0;
  let wrapping = false;

  const focused = () => stage.contains(document.activeElement);
  const live = () => enabled && !paused && inView && !document.hidden && !ring.flat && ring.count > 1;
  const still = () => hover || focused() || ring.recent || wrapping;

  const frame = (t: number) => {
    raf = 0;
    if (!live()) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(t - last, 50);
    last = t;
    if (still()) { since = t; return; }
    if (ring.pos < ring.count - 1) return ring.scrub(Math.min(ring.count - 1, ring.pos + dt / MS_PER_CARD));
    wrapping = true;
    track.style.opacity = "0";
    setTimeout(() => {
      ring.scrub(0);
      track.style.opacity = "";
      setTimeout(() => { wrapping = false; }, FADE_MS);
    }, FADE_MS);
  };

  const start = () => {
    if (raf || !live()) return;
    last = since = performance.now();
    raf = requestAnimationFrame(frame);
  };

  stage.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hover = true; });
  stage.addEventListener("pointerleave", () => { hover = false; });
  document.addEventListener("visibilitychange", start);
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", start);
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; start(); }).observe(stage);

  return {
    enable(on) { enabled = on; start(); },
    toggle() { paused = !paused; start(); return paused; },
  };
}
