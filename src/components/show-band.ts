import { onPulse } from "../lib/pulse.ts";
import { esc } from "./archive-rail.ts";
import {
  NARROW, WIDE, dayLabel, glow, heading, onAir, parseShows, readout, sameZone, stations, upcoming, xOf,
  type Geom, type Show, type Station,
} from "../lib/shows.ts";

const DAY = 86400_000;
const TUNE_MS = 6000;
const HINT = `<p class="sb-hint">Tap a station to tune to it. The band drifts toward the next show in real time.</p>`;
const rollTimers = new WeakMap<HTMLElement, number>();

const dayNum = (s: Show) => new Date(s.t).toLocaleDateString("en-GB", { day: "numeric", timeZone: s.tz });
const local = (s: Show) =>
  new Date(s.t).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: s.tz }).replace(":00", "");
const yours = (s: Show) => new Date(s.t).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
const subLine = (s: Show) =>
  `${dayLabel(s)}, ${local(s)} local · ${s.venue}${sameZone(s) ? "" : ` · ${yours(s)} your time`}`;

function rollText(el: HTMLElement, value: string): void {
  const timer = rollTimers.get(el);
  if (timer) clearTimeout(timer);
  const old = el.dataset.value ?? value;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || old === value) {
    el.dataset.value = value;
    el.setAttribute("aria-label", value);
    el.textContent = value;
    return;
  }
  const style = getComputedStyle(el);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const lineHeight = style.lineHeight === "normal" ? style.fontSize : style.lineHeight;
  const spacing = Number.parseFloat(style.letterSpacing) || 0;
  const width = (s: string) => ctx.measureText(s).width + spacing * s.length;
  const nextWidth = width(value);
  const reading = el.classList.contains("sb-read");
  const boxWidth = reading ? el.clientWidth : Math.max(width(old), nextWidth);
  const xOffset = reading ? boxWidth - nextWidth : 0;
  const count = Math.max(old.length, value.length);
  el.classList.remove("sb-rolling");
  el.setAttribute("aria-label", value);
  el.dataset.value = value;
  el.innerHTML = `<span class="sb-roll-layout" style="--roll-width:${boxWidth}px;--roll-height:${lineHeight}">` + Array.from({ length: count }, (_, i) => {
    const from = old[i] ?? " ", to = value[i] ?? " ";
    const toX = xOffset + width(value.slice(0, i));
    const wheelWidth = Math.max(width(from), width(to));
    if (from === to) return `<span class="sb-wheel-static" style="--wheel-to:${toX}px;--wheel-width:${wheelWidth}px">${esc(to)}</span>`;
    return `<span class="sb-wheel" style="--wheel-to:${toX}px;--wheel-width:${wheelWidth}px"><span class="sb-wheel-track"><span>${esc(from)}</span><span>${esc(to)}</span></span></span>`;
  }).join("") + "</span>";
  void el.offsetWidth;
  requestAnimationFrame(() => el.classList.add("sb-rolling"));
  rollTimers.set(el, window.setTimeout(() => {
    if (el.dataset.value !== value) return;
    el.classList.remove("sb-rolling");
    el.textContent = value;
  }, 760));
}

class ShowBand extends HTMLElement {
  private shows: Show[] = [];
  private up: Show[] = [];
  private sts: Station[] = [];
  private geom: Geom = WIDE;
  private key = "";
  private ticks: HTMLElement[] = [];
  private tickX: number[] = [];
  private lift: number[] = [];
  private btns: HTMLButtonElement[] = [];
  private cur: Show | null = null;
  private tuned: Show | null = null;
  private read = "";
  private timer = 0;
  private tuneTimer = 0;
  private ac: AbortController | null = null;
  private pulsing = false;

  async connectedCallback(): Promise<void> {
    const ac = (this.ac = new AbortController());
    try {
      const r = await fetch("/data/shows.json");
      if (!r.ok) throw new Error(String(r.status));
      this.shows = parseShows(await r.json()).shows;
    } catch {
      this.innerHTML = `<section class="wrap" aria-labelledby="sb-title"><h2 class="section-title" id="sb-title">Upcoming shows</h2>` +
        `<p class="meta" role="alert">The show dates could not be loaded. Check your connection and reload the page.</p></section>`;
      return;
    }
    if (ac.signal.aborted) return;
    const { signal } = ac;
    addEventListener("resize", () => this.update(), { passive: true, signal });
    document.addEventListener("visibilitychange", () => this.update(), { signal });
    this.addEventListener("click", (e) => {
      const i = this.btns.indexOf((e.target as Element).closest<HTMLButtonElement>(".st")!);
      if (i >= 0) this.tune(this.sts[i].shows[0]);
    }, { signal });
    if (!this.pulsing) {
      this.pulsing = true;
      onPulse((b) => this.beat(b.kick));
    }
    this.update();
  }

  disconnectedCallback(): void {
    this.ac?.abort();
    clearInterval(this.timer);
    clearTimeout(this.tuneTimer);
    this.timer = 0;
    this.key = "";
  }

  private update(): void {
    const now = Date.now();
    const g = innerWidth < 520 ? NARROW : WIDE;
    const up = upcoming(this.shows, now);
    const key = `${g.needle}|${up.map((s) => s.t).join()}`;
    if (key !== this.key) {
      this.key = key;
      this.geom = g;
      this.up = up;
      this.build(now);
    }
    const run = up.length > 0 && !document.hidden;
    if (run && !this.timer) this.timer = window.setInterval(() => this.update(), 1000);
    if (!run && this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
    if (run) this.place(now);
  }

  private build(now: number): void {
    const { up, geom: g } = this;
    const sts = (this.sts = stations(up));
    const n = up.length ? Math.min(41, Math.max(1, Math.floor((up[up.length - 1].t - now) / DAY) + 1)) : 41;
    const ticks = Array.from({ length: n }, (_, d) =>
      `<b class="${d % 7 ? "" : "maj"}"${up.length ? "" : ` style="left:${3 + d * 2.4}%"`}></b>`).join("");
    const head = up.length
      ? `<div class="sb-head"><p class="sb-kick"><i class="dot"></i><span></span></p><p class="sb-city" aria-live="polite"></p>` +
        `<p class="sb-read num" aria-live="off"></p><p class="sb-sub" aria-live="polite"></p></div>`
      : `<p class="none">No shows announced yet.</p>`;
    const stns = sts.map((st, i) =>
      `<button type="button" class="st${i % 2 ? " lo" : ""}" style="--pw:${st.shows.length * 12 - 4}px" aria-label="${esc(st.city)}, ${esc(st.shows.map(dayLabel).join(" and "))}">` +
      `<span class="pins">${st.shows.map(() => "<i></i>").join("")}</span>` +
      `<span class="lab">${esc(st.city)}<span>${st.shows.map(dayNum).join(" · ")}</span></span></button>`).join("");
    this.innerHTML =
      `<section class="wrap" aria-labelledby="sb-title"><h2 class="section-title" id="sb-title">${esc(heading(up))}</h2>${head}` +
      `<div class="sb-band${up.length ? "" : " quiet"}" role="group" aria-label="Upcoming shows" style="--needle:${g.needle}%">` +
      `<div class="sb-rail">${ticks}</div><div class="sb-signal" aria-hidden="true"><i></i></div>${stns}<div class="sb-needle" aria-hidden="true">${up.length ? "<span>now</span>" : ""}</div></div>` +
      `${up.length ? HINT : ""}</section>`;
    this.ticks = [...this.querySelectorAll<HTMLElement>(".sb-rail b")];
    this.btns = [...this.querySelectorAll<HTMLButtonElement>(".st")];
    this.tickX = this.ticks.map((_, d) => 3 + d * 2.4);
    this.lift = [];
    this.cur = null;
    this.tuned = null;
    this.read = "";
  }

  private place(now: number): void {
    const { up, sts, geom: g } = this;
    const f = this.tuned ?? up[0];
    const live = f === onAir(up, now);
    const fi = sts.findIndex((st) => st.shows.includes(f));
    const showChanged = f !== this.cur;
    if (showChanged) {
      this.cur = f;
      rollText(this.querySelector<HTMLElement>(".sb-city")!, f.city);
      this.querySelector(".sb-sub")!.textContent = subLine(f);
      this.btns.forEach((b, i) => {
        b.classList.toggle("next", i === fi && !this.tuned);
        b.classList.toggle("tuned", i === fi && !!this.tuned);
        b.style.setProperty("--glow", "0");
      });
    }
    this.querySelector(".sb-head")!.classList.toggle("on", live);
    this.querySelector(".sb-kick span")!.textContent = live ? "On air now" : this.tuned ? "Tuned to" : "Next show";
    const since = now - f.t;
    const read = live
      ? `On air · ${Math.floor(since / 3600_000)} h ${Math.floor((since % 3600_000) / 60_000)} min in`
      : readout(f.t - now);
    if (read !== this.read) {
      const readEl = this.querySelector<HTMLElement>(".sb-read")!;
      this.read = read;
      rollText(readEl, read);
      readEl.classList.remove("sb-tick");
      if (!showChanged && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        void readEl.offsetWidth;
        readEl.classList.add("sb-tick");
      }
    }
    this.btns[fi]?.style.setProperty("--glow", String(glow(live ? 0 : f.t - now)));
    const signal = this.querySelector<HTMLElement>(".sb-signal");
    const signalEnd = xOf(up[0].t, now, up, g);
    const signalDistance = Math.max(0, signalEnd - g.needle);
    signal?.style.setProperty("--signal-left", `${g.needle}%`);
    signal?.style.setProperty("--signal-width", `${signalDistance}%`);
    signal?.style.setProperty("--signal-distance", `${this.querySelector<HTMLElement>(".sb-band")!.clientWidth * signalDistance / 100}px`);
    signal?.style.setProperty("--signal-streak", `${Math.max(0.9, Math.min(2.2, signalDistance * 0.12))}rem`);
    this.btns.forEach((b, i) => {
      const x = xOf(sts[i].shows[0].t, now, up, g);
      b.style.left = `${x}%`;
      // Near the needle a centred label would run off the band's left edge.
      b.classList.toggle("edge", x < 20);
    });
    const last = up[up.length - 1].t;
    this.ticks.forEach((b, d) => {
      const t = now + d * DAY;
      const x = (this.tickX[d] = xOf(t, now, up, g));
      b.style.left = `${x}%`;
      b.hidden = t > last;
    });
  }

  private tune(s: Show): void {
    clearTimeout(this.tuneTimer);
    this.tuned = s;
    this.cur = null;
    this.place(Date.now());
    this.tuneTimer = window.setTimeout(() => {
      this.tuned = null;
      this.cur = null;
      if (this.up.length) this.place(Date.now());
    }, TUNE_MS);
  }

  private beat(kick: number): void {
    if (!this.isConnected || !this.up.length) return;
    const n = this.geom.needle;
    this.ticks.forEach((b, d) => {
      const dist = Math.abs(this.tickX[d] - n);
      const v = Math.round((dist < 30 ? 1 + kick * (1 - dist / 30) * 0.35 : 1) * 100) / 100;
      if (v !== this.lift[d]) b.style.setProperty("--lift", String((this.lift[d] = v)));
    });
  }
}

if (!customElements.get("show-band")) customElements.define("show-band", ShowBand);
