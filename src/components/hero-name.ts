import { onPulse } from "../lib/pulse.ts";

const THROW_MS = 1700;

export function letters(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  let i = 0;
  text.split(/\s+/).filter(Boolean).forEach((word, n) => {
    if (n) frag.append(" ");
    const w = document.createElement("span");
    w.className = "w";
    for (const ch of Array.from(word)) {
      const l = document.createElement("span");
      l.className = "l";
      l.style.setProperty("--i", String(i++));
      l.textContent = ch;
      w.append(l);
    }
    frag.append(w);
  });
  return frag;
}

/**
 * Lights the name like a wall at a show: one stage light drifts across it with the
 * 16-beat phrase, the letters under it lift a hair on the kick, and on a new track the
 * light is thrown across once as the letters arrive. The light is one sheet across the
 * whole name, so each letter is told where it sits inside it.
 */
export class NameLight {
  private sx = 0.5;
  private shownSx = -1;
  private kick = -1;
  private thrownAt = -Infinity;

  constructor(private name: HTMLElement) {
    new ResizeObserver(() => this.measure()).observe(name);
    void document.fonts?.ready.then(() => this.measure());
    onPulse(({ kick, swell, env }) => this.frame(kick * env, swell));
  }

  /** Call after new letters are in the document. */
  arrive(): void {
    this.measure();
    this.thrownAt = performance.now();
  }

  measure(): void {
    const nw = this.name.clientWidth;
    const nh = this.name.clientHeight;
    if (!nw) return;
    this.name.style.setProperty("--nw", `${nw}px`);
    this.name.style.setProperty("--nh", `${nh}px`);
    this.name.querySelectorAll<HTMLElement>(".l").forEach((l) => {
      const s = l.style;
      s.setProperty("--x", `${l.offsetLeft}px`);
      s.setProperty("--y", `${l.offsetTop}px`);
      s.setProperty("--cx", ((l.offsetLeft + l.offsetWidth / 2) / nw).toFixed(3));
    });
  }

  private frame(kick: number, swell: number): void {
    const t = (performance.now() - this.thrownAt) / THROW_MS;
    const phrase = -0.05 + 1.1 * swell;
    if (t < 1) this.sx = -0.25 + 1.4 * (1 - (1 - t) ** 3);
    else this.sx += (phrase - this.sx) * 0.03;
    const sx = Math.round(this.sx * 400) / 400;
    if (sx !== this.shownSx) this.name.style.setProperty("--sx", String((this.shownSx = sx)));
    const k = Math.round(kick * 40) / 40;
    if (k !== this.kick) this.name.style.setProperty("--kick", String((this.kick = k)));
  }
}
