import { RADIO_CUE, RADIO_TIME, RADIO_TRACK } from "../lib/events.ts";
import type { TimeInfo, TrackInfo } from "../lib/events.ts";
import { personFromTitle } from "../lib/memories.ts";
import type { ProgramEntry } from "../lib/station.ts";

function fmt(total: number): string {
  const t = Math.max(0, Math.floor(total));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function shortName(e: ProgramEntry): string {
  if (e.type === "interlude") return "Interlude";
  if (e.type === "id") return "Unreleased ID";
  return personFromTitle(e.title) ?? e.title ?? "Untitled";
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  return n;
}

class TracklistBar extends HTMLElement {
  private bar!: HTMLElement;
  private tip!: HTMLElement;
  private time!: HTMLElement;
  private next!: HTMLElement;
  private segs: HTMLButtonElement[] = [];
  private fills: HTMLElement[] = [];
  private info: TrackInfo | null = null;
  private key = "";
  private lastP = -1;
  private lastSec = -1;

  connectedCallback() {
    const q = (s: string) => this.querySelector<HTMLElement>(s)!;
    this.bar = q(".tl-bar");
    this.tip = q(".tl-tip");
    this.time = q(".tl-time");
    this.next = q(".tl-next");

    document.addEventListener(RADIO_TRACK, (e) => this.onTrack((e as CustomEvent<TrackInfo>).detail));
    document.addEventListener(RADIO_TIME, (e) => this.onTime((e as CustomEvent<TimeInfo>).detail));

    this.bar.addEventListener("click", (e) => {
      const i = this.indexOf(e.target);
      const entry = this.info?.entries[i];
      if (!this.info || !entry || this.segs[i]?.disabled) return;
      document.dispatchEvent(
        new CustomEvent(RADIO_CUE, { detail: { program: this.info.programPath, offset: entry.offset } }),
      );
    });
    this.bar.addEventListener("pointerover", (e) => this.showTip(this.indexOf(e.target)));
    this.bar.addEventListener("focusin", (e) => this.showTip(this.indexOf(e.target)));
    this.bar.addEventListener("pointerleave", () => this.hideTip());
    this.bar.addEventListener("focusout", () => this.hideTip());
    this.bar.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      const i = this.indexOf(e.target);
      if (!step || i < 0) return;
      e.preventDefault();
      this.focusSeg(Math.min(this.segs.length - 1, Math.max(0, i + step)));
    });
  }

  private indexOf(t: EventTarget | null): number {
    const seg = (t as Element | null)?.closest?.(".tl-seg");
    return seg ? this.segs.indexOf(seg as HTMLButtonElement) : -1;
  }

  private focusSeg(i: number) {
    this.segs.forEach((s, n) => (s.tabIndex = n === i ? 0 : -1));
    this.segs[i]?.focus();
  }

  private build(info: TrackInfo) {
    const playable = !info.programPath.startsWith("video:");
    const list = playable ? info.entries : info.entries.slice(0, 1);
    this.segs = list.map((e) => {
      const b = el("button", "tl-seg");
      b.type = "button";
      b.style.flexGrow = String(Math.max(e.duration, 1));
      b.disabled = !playable;
      b.setAttribute(
        "aria-label",
        playable ? `Play ${e.title ?? shortName(e)}, from ${fmt(e.offset)}` : (e.title ?? shortName(e)),
      );
      const track = el("span", "tl-track");
      const fill = el("i", "tl-fill");
      track.append(fill);
      b.append(track);
      return b;
    });
    this.fills = this.segs.map((s) => s.querySelector<HTMLElement>(".tl-fill")!);
    this.bar.replaceChildren(...this.segs);
  }

  private onTrack(info: TrackInfo) {
    const key = `${info.programPath}|${info.entries.length}`;
    if (key !== this.key) {
      this.key = key;
      this.build(info);
    }
    this.info = info;
    const focused = this.bar.contains(document.activeElement);
    this.segs.forEach((s, i) => {
      s.classList.toggle("is-played", i < info.index);
      s.classList.toggle("is-current", i === info.index);
      if (i === info.index) s.setAttribute("aria-current", "true");
      else s.removeAttribute("aria-current");
      if (!focused) s.tabIndex = i === Math.min(info.index, this.segs.length - 1) ? 0 : -1;
    });
    this.fills.forEach((f) => (f.style.transform = "scaleX(0)"));
    this.lastP = -1;
    this.lastSec = -1;

    const nxt = info.entries[info.index + 1];
    this.next.hidden = !nxt;
    if (nxt) this.next.querySelector<HTMLElement>(".tl-next-t")!.textContent = shortName(nxt);
    this.onTime({ current: info.entry.offset + info.elapsed });
  }

  private onTime({ current }: Pick<TimeInfo, "current">) {
    const info = this.info;
    if (!info) return;
    const { entry } = info;
    const elapsed = Math.min(entry.duration, Math.max(0, current - entry.offset));
    const p = entry.duration > 0 ? elapsed / entry.duration : 0;
    if (Math.abs(p - this.lastP) > 0.002) {
      this.lastP = p;
      const fill = this.fills[Math.min(info.index, this.fills.length - 1)];
      if (fill) fill.style.transform = `scaleX(${p.toFixed(4)})`;
    }
    const sec = Math.floor(elapsed);
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      this.time.textContent = `${fmt(elapsed)} of ${fmt(entry.duration)}`;
    }
  }

  private showTip(i: number) {
    const seg = this.segs[i];
    const entry = this.info?.entries[i];
    if (!seg || !entry || seg.disabled) return;
    const name = document.createElement("span");
    name.textContent = shortName(entry);
    const at = el("span", "num");
    at.textContent = fmt(entry.offset);
    this.tip.replaceChildren(name, at);
    const w = this.tip.offsetWidth;
    const left = seg.offsetLeft + seg.offsetWidth / 2 - w / 2;
    this.tip.style.left = `${Math.min(Math.max(0, left), this.clientWidth - w)}px`;
    this.tip.classList.add("is-on");
  }

  private hideTip() {
    this.tip.classList.remove("is-on");
  }
}

if (!customElements.get("tracklist-bar")) customElements.define("tracklist-bar", TracklistBar);
