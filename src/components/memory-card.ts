import { RADIO_TIME, RADIO_TRACK } from "../lib/events.ts";
import type { TimeInfo, TrackInfo } from "../lib/events.ts";
import { memoryFor } from "../lib/memories.ts";
import { onPulse } from "../lib/pulse.ts";
import type { Beat } from "../lib/pulse.ts";
import type { ProgramEntry } from "../lib/station.ts";

const BARS = 48;

function heights(seed: string): number[] {
  let s = 0;
  for (const c of seed) s = (Math.imul(31, s) + c.charCodeAt(0)) | 0;
  return Array.from({ length: BARS }, (_, i) => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 374761393) | 0;
    const r = (s >>> 0) / 4294967296;
    return 0.22 + 0.78 * r * (0.5 + 0.5 * Math.sin((i / (BARS - 1)) * Math.PI));
  });
}

function lineFor(info: TrackInfo): { text: string; generated: boolean } {
  const { entry } = info;
  if (entry.type === "interlude") return { text: "The station, between songs.", generated: true };
  if (entry.type === "id") {
    return { text: "A track with no title yet. If you know what it is, you know more than the archive does.", generated: true };
  }
  const m = memoryFor(entry, { programTitle: info.programTitle, venue: info.venue, date: info.date });
  return { text: m.text, generated: m.generated };
}

class MemoryCardElement extends HTMLElement {
  private wave!: HTMLElement;
  private text!: HTMLElement;
  private bars: HTMLElement[] = [];
  private shape: number[] = [];
  private level: number[] = [];
  private entry: ProgramEntry | null = null;
  private lit = 0;

  connectedCallback() {
    this.wave = this.querySelector<HTMLElement>(".mc-wave")!;
    this.text = this.querySelector<HTMLElement>(".mc-text")!;
    document.addEventListener(RADIO_TRACK, (e) => this.onTrack((e as CustomEvent<TrackInfo>).detail));
    document.addEventListener(RADIO_TIME, (e) => this.onTime((e as CustomEvent<TimeInfo>).detail));
    onPulse((b) => this.onBeat(b));
  }

  // Centre bars ride the kick, the edges catch the hats; fast attack, slow release.
  private onBeat({ kick, hat, swell, env }: Beat) {
    const t = performance.now() / 1000;
    this.bars.forEach((bar, i) => {
      const edge = Math.abs(i / (BARS - 1) - 0.5) * 2;
      const shimmer = 0.5 + 0.5 * Math.sin(t * (2 + this.shape[i] * 3) + i);
      const drive = kick * (1 - edge) + hat * edge * 0.8 + 0.18 * shimmer;
      const target = Math.max(0.1, env * this.shape[i] * (0.35 + 0.9 * drive) * (0.82 + 0.18 * swell));
      const cur = this.level[i] ?? target;
      const next = cur + (target - cur) * (target > cur ? 0.55 : 0.12);
      this.level[i] = next;
      bar.style.transform = `scaleY(${next.toFixed(3)})`;
    });
  }

  private onTrack(info: TrackInfo) {
    const { text, generated } = lineFor(info);
    this.entry = info.entry;
    this.text.classList.toggle("is-generated", generated);
    this.text.replaceChildren();
    text.split(/\s+/).filter(Boolean).forEach((word, i) => {
      if (i) this.text.append(" ");
      const w = document.createElement("span");
      w.className = "mw";
      w.style.setProperty("--i", String(i));
      w.textContent = word;
      this.text.append(w);
    });
    this.dataset.ready = "";

    this.shape = heights(info.entry.title ?? info.entry.type);
    this.bars = this.shape.map((h) => {
      const b = document.createElement("i");
      b.style.transform = `scaleY(${h.toFixed(3)})`;
      return b;
    });
    this.wave.replaceChildren(...this.bars);
    this.lit = 0;
  }

  private onTime({ current }: TimeInfo) {
    const e = this.entry;
    if (!e || e.duration <= 0) return;
    const p = Math.min(1, Math.max(0, (current - e.offset) / e.duration));
    const n = Math.floor(p * BARS);
    if (n === this.lit) return;
    const [from, to] = n > this.lit ? [this.lit, n] : [n, this.lit];
    for (let i = from; i < to; i++) this.bars[i]?.classList.toggle("on", n > this.lit);
    this.lit = n;
  }
}

if (!customElements.get("memory-card")) customElements.define("memory-card", MemoryCardElement);
