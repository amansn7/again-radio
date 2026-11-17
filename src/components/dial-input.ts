import type { Ring } from "./dial-ring.ts";

interface Drag { x: number; pos: number; lastX: number; lastT: number; v: number; live: boolean; id: number }

/** Drag with inertia, and horizontal wheel or trackpad. Vertical scrolling stays with the page. */
export function bindGestures(stage: HTMLElement, ring: Ring): void {
  let drag: Drag | null = null;
  let wheelT = 0;
  let wheelFrom = 0;

  stage.addEventListener("pointerdown", (e) => {
    if (ring.flat || e.button !== 0) return;
    ring.touch();
    drag = { x: e.clientX, pos: ring.pos, lastX: e.clientX, lastT: e.timeStamp, v: 0, live: false, id: e.pointerId };
  });

  stage.addEventListener("pointermove", (e) => {
    const g = drag;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    if (!g.live) {
      if (Math.abs(dx) < 6) return;
      g.live = true;
      stage.setPointerCapture(e.pointerId);
    }
    const dt = e.timeStamp - g.lastT;
    if (dt > 0) g.v = 0.8 * ((e.clientX - g.lastX) / dt) + 0.2 * g.v;
    g.lastX = e.clientX;
    g.lastT = e.timeStamp;
    ring.scrub(g.pos - dx / ring.pitch);
  });

  const up = (): void => {
    const g = drag;
    drag = null;
    if (!g?.live) return;
    ring.suppress = true;
    setTimeout(() => (ring.suppress = false));
    ring.goto(ring.pos - (g.v * 240) / ring.pitch);
  };
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);

  stage.addEventListener("wheel", (e) => {
    if (ring.flat || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    ring.touch();
    if (!wheelT) wheelFrom = ring.pos;
    ring.scrub(ring.pos + e.deltaX / ring.pitch);
    clearTimeout(wheelT);
    // A single mouse-wheel notch is smaller than a card; it should still turn one.
    wheelT = window.setTimeout(() => {
      wheelT = 0;
      const d = ring.pos - wheelFrom;
      ring.goto(Math.abs(d) > 0.1 && Math.round(ring.pos) === Math.round(wheelFrom) ? wheelFrom + Math.sign(d) : ring.pos);
    }, 140);
  }, { passive: false });
}
