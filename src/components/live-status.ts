import { RADIO_LIVE, RADIO_STATE, RADIO_TIME, RADIO_TRACK, lastTrack } from "../lib/events.ts";
import type { StateInfo, TimeInfo, TrackInfo } from "../lib/events.ts";
import { watchListeners } from "./listeners.ts";
import { hereText } from "../lib/live.ts";

export function clock(total: number): string {
  const t = Math.max(0, Math.floor(total));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// Everyone tuned in shares one position in the set (rotation runs from a fixed epoch), so the
// set clock is the one number every listener sees tick in step. It only ever shows the
// player's own position, never an estimate.
class LiveStatus extends HTMLElement {
  private live = true;
  private shown = "";
  private here = "";
  private place: string | undefined;
  private stop: (() => void) | null = null;
  private ac = new AbortController();

  connectedCallback(): void {
    this.classList.add("is-live");
    this.innerHTML =
      `<span class="ls-sign"><span class="live-dot" aria-hidden="true"></span><span class="ls-hollow" aria-hidden="true" hidden></span>` +
      `<span class="ls-word">Live</span><button class="ls-go" type="button" hidden>Go live</button></span>` +
      `<span class="ls-clock" hidden><span class="ls-short"></span><span class="ls-long"></span></span>` +
      `<span class="ls-count" hidden><span class="ls-n num"></span> listening</span>`;
    const signal = (this.ac = new AbortController()).signal;
    this.q(".ls-go").addEventListener("click", () => document.dispatchEvent(new CustomEvent(RADIO_LIVE)), { signal });
    document.addEventListener(RADIO_STATE, (e) => this.setLive((e as CustomEvent<StateInfo>).detail.live), { signal });
    document.addEventListener(RADIO_TIME, (e) => this.tick((e as CustomEvent<TimeInfo>).detail.current), { signal });
    document.addEventListener(RADIO_TRACK, (e) => {
      this.place = (e as CustomEvent<TrackInfo>).detail.venue;
      this.here = "";
    }, { signal });
    this.place = lastTrack?.venue;
    this.stop = watchListeners((n) => this.count(n));
  }

  disconnectedCallback(): void {
    this.ac.abort();
    this.stop?.();
    this.stop = null;
  }

  private q(s: string): HTMLElement {
    return this.querySelector<HTMLElement>(s)!;
  }

  private setLive(live: boolean): void {
    if (live === this.live) return;
    this.live = live;
    this.classList.toggle("is-live", live);
    this.q(".live-dot").hidden = !live;
    this.q(".ls-hollow").hidden = live;
    this.q(".ls-go").hidden = live;
    this.q(".ls-word").textContent = live ? "Live" : "Replaying";
  }

  private tick(current: number): void {
    const { short, long } = hereText(current, this.place);
    if (long === this.here) return;
    this.here = long;
    this.q(".ls-short").textContent = short;
    this.q(".ls-long").textContent = long;
    this.q(".ls-clock").hidden = false;
  }

  private count(n: number | null): void {
    const box = this.q(".ls-count");
    box.hidden = n === null;
    if (n === null) return void (this.shown = "");
    const text = n.toLocaleString("en-US");
    if (text === this.shown) return;
    const prev = this.shown;
    this.shown = text;
    this.q(".ls-n").replaceChildren(...[...text].map((ch, i, all) => {
      const d = document.createElement("span");
      d.className = "ls-d";
      if (prev && prev[prev.length - (all.length - i)] !== ch) d.classList.add("roll");
      d.textContent = ch;
      return d;
    }));
  }
}

if (!customElements.get("live-status")) customElements.define("live-status", LiveStatus);
