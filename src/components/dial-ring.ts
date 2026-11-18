import { bindGestures } from "./dial-input.ts";

const WINDOW = 5;
const FLARE = 0.3;
const PREFETCH = 3;
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

export interface RingOpts {
  build: (i: number) => HTMLElement;
  activate: (i: number) => void;
  front: (i: number) => void;
  prefetch: (i: number) => void;
}

/** A ring of cards in CSS 3D. Only the cards within WINDOW of the front exist in the DOM. */
export class Ring {
  pos = 0;
  count = 0;
  suppress = false;
  private els = new Map<number, HTMLElement>();
  private touched = -Infinity;
  private shown = -1;
  private span = "";
  private w = 240;

  constructor(private stage: HTMLElement, private track: HTMLElement, private o: RingOpts) {
    bindGestures(stage, this);
    track.addEventListener("click", this.click);
    track.addEventListener("keydown", this.key);
    reduce.addEventListener("change", () => this.reset(this.count, this.front));
    addEventListener("resize", () => this.layout(false));
  }

  get flat(): boolean { return reduce.matches; }
  get front(): number { return Math.round(this.pos); }
  /** Pixels of drag that turn the ring by one card. */
  get pitch(): number { return this.w * 1.05; }
  /** The user turned the ring recently, so the station should not turn it for them. */
  get recent(): boolean { return performance.now() - this.touched < 8000; }

  touch(): void { this.touched = performance.now(); }

  resumeAuto(): void { this.touched = -Infinity; }

  reset(count: number, at = 0): void {
    this.track.replaceChildren();
    this.els.clear();
    this.count = count;
    this.shown = -1;
    this.span = "";
    this.stage.classList.toggle("is-flat", this.flat);
    this.pos = this.clamp(at);
    this.layout(false);
  }

  /** Follow a finger or wheel without easing. */
  scrub(pos: number): void {
    this.pos = this.clamp(pos);
    this.layout(false);
  }

  goto(i: number, focus = false): void {
    this.pos = this.clamp(Math.round(i));
    this.layout(true);
    if (focus) this.els.get(this.front)?.focus({ preventScroll: true });
  }

  each(fn: (el: HTMLElement, i: number) => void): void { this.els.forEach(fn); }

  private clamp(p: number): number { return Math.max(0, Math.min(this.count - 1, p)); }

  private layout(animate: boolean): void {
    this.track.classList.toggle("is-still", !animate);
    const lo = this.flat ? 0 : Math.max(0, Math.floor(this.pos) - WINDOW);
    const hi = this.flat ? this.count - 1 : Math.min(this.count - 1, Math.ceil(this.pos) + WINDOW);
    this.els.forEach((el, i) => { if (i < lo || i > hi) { el.remove(); this.els.delete(i); } });
    if (!this.flat && this.span !== `${lo}-${hi}`) {
      this.span = `${lo}-${hi}`;
      for (let k = 1; k <= PREFETCH; k++) {
        if (lo - k >= 0) this.o.prefetch(lo - k);
        if (hi + k < this.count) this.o.prefetch(hi + k);
      }
    }
    let prev: HTMLElement | null = null;
    for (let i = lo; i <= hi; i++) {
      let el = this.els.get(i);
      if (!el) {
        el = this.o.build(i);
        el.dataset.i = String(i);
        if (prev) prev.after(el); else this.track.prepend(el);
        this.els.set(i, el);
      }
      prev = el;
    }
    this.w = (this.els.values().next().value as HTMLElement | undefined)?.offsetWidth || this.w;
    const front = this.front;
    this.els.forEach((el, i) => {
      el.tabIndex = i === front ? 0 : -1;
      el.toggleAttribute("data-front", i === front);
      this.place(el, i);
    });
    if (this.flat) {
      const el = this.els.get(front);
      if (el) this.track.scrollTo({ left: el.offsetLeft - (this.track.clientWidth - el.offsetWidth) / 2 });
    }
    if (front !== this.shown) { this.shown = front; this.o.front(front); }
  }

  private place(el: HTMLElement, i: number): void {
    if (this.flat) { el.style.transform = el.style.opacity = ""; return; }
    const narrow = this.stage.clientWidth < 640;
    const step = narrow ? 30 : 22;
    const r = ((this.w / 2) / Math.tan((step * Math.PI) / 360)) * 1.12;
    const d = i - this.pos;
    const a = -d * step;
    // Concave: the viewer stands inside the ring, so side cards swing towards the lens and flare.
    el.style.transform = `translate3d(-50%, 0, ${r}px) rotateY(${a}deg) translateZ(${-r}px) rotateY(${-a * FLARE}deg)`;
    el.style.opacity = String(Math.max(0, 1 - Math.max(0, Math.abs(d) - 1) * 0.28));
  }

  private click = (e: MouseEvent): void => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
    if (!el || this.suppress) return;
    this.touch();
    const i = Number(el.dataset.i);
    if (this.flat && i !== this.front) { this.pos = i; this.layout(false); }
    if (i === this.front) this.o.activate(i);
    else this.goto(i, true);
  };

  private key = (e: KeyboardEvent): void => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? this.count - 1 : step ? this.front + step : null;
    if (to === null) return;
    e.preventDefault();
    this.touch();
    this.goto(to, true);
  };
}
