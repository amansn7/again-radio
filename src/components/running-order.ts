import { loadProgram, loadStation } from "../lib/station.ts";
import type { Program, ProgramEntry } from "../lib/station.ts";
import { RADIO_CUE, RADIO_TIME, RADIO_TRACK } from "../lib/events.ts";
import type { TimeInfo, TrackInfo } from "../lib/events.ts";

const EVERY_SHOW = "programs/usb002-every-show.json";
const clock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const length = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};
const splitTitle = (t: string): [string, string] => {
  const i = t.indexOf(" (");
  return i > 0 ? [t.slice(0, i), t.slice(i + 1)] : [t, ""];
};

class RunningOrder extends HTMLElement {
  private programs: { path: string; data: Program }[] = [];
  private sel = 0;
  private picked = false;
  private onAir: { path: string; index: number } | null = null;
  private bar: HTMLElement | null = null;

  async connectedCallback(): Promise<void> {
    this.innerHTML =
      `<div class="ro-head"><h2 class="section-title" id="ro-title">Running order</h2>` +
      `<p class="meta">Every programme in the rotation, track by track. Pick a row to drop in.</p></div>` +
      `<div class="skeleton ro-skel"></div><div class="skeleton ro-skel"></div><div class="skeleton ro-skel"></div>`;
    try {
      const station = await loadStation();
      const paths = [...station.rotation.map((r) => r.program), EVERY_SHOW];
      this.programs = (await Promise.all(paths.map(async (path) => ({ path, data: await loadProgram(path) }))));
    } catch {
      this.querySelectorAll(".ro-skel").forEach((n) => n.remove());
      this.insertAdjacentHTML("beforeend",
        `<p class="meta ro-error" role="alert">The running order could not be loaded. Check your connection and reload the page.</p>`);
      return;
    }
    this.render();
    document.addEventListener(RADIO_TRACK, (e) => this.onTrack((e as CustomEvent<TrackInfo>).detail));
    document.addEventListener(RADIO_TIME, (e) => this.onTime((e as CustomEvent<TimeInfo>).detail));
  }

  private render(): void {
    const cur = this.programs[this.sel];
    const p = cur.data;
    const tabs = this.programs.map((x, i) =>
      `<button class="ro-tab" role="tab" id="ro-tab-${i}" aria-selected="${i === this.sel}" aria-controls="ro-panel" tabindex="${i === this.sel ? 0 : -1}" data-i="${i}">${esc(x.data.title)}</button>`).join("");
    const when = p.date ? new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
    const info = [p.venue, when, length(p.duration)].filter(Boolean).join(", ");
    this.innerHTML =
      `<div class="ro-head"><h2 class="section-title" id="ro-title">Running order</h2>` +
      `<p class="meta">Every programme in the rotation, track by track. Pick a row to drop in.</p></div>` +
      `<div class="ro-tabs" role="tablist" aria-label="Programmes">${tabs}</div>` +
      `<div class="ro-info"><p class="meta num">${esc(info)}</p><button class="btn" data-play>Play from the start</button></div>` +
      `<ul class="ro-list" role="tabpanel" id="ro-panel" aria-labelledby="ro-tab-${this.sel}" style="margin-top:1.5rem">` +
      p.entries.map((en, i) => this.row(en, i)).join("") + `</ul>`;

    const tablist = this.querySelector<HTMLElement>("[role=tablist]")!;
    tablist.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(".ro-tab");
      if (b) this.select(Number(b.dataset.i), true);
    });
    tablist.addEventListener("keydown", (e) => {
      const n = this.programs.length;
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      const to = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (this.sel + d + n) % n;
      if (!d && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      this.select(to, true);
      this.querySelector<HTMLElement>(`#ro-tab-${to}`)?.focus();
    });
    this.querySelector("[data-play]")!.addEventListener("click", () => this.cue(cur.path, 0));
    this.querySelectorAll<HTMLElement>(".ro-row").forEach((r) =>
      r.addEventListener("click", () => this.cue(cur.path, Number(r.dataset.offset))));
    this.markLive();
  }

  private row(en: ProgramEntry, i: number): string {
    const [name, rest] = splitTitle(en.title ?? (en.type === "id" ? "Station id" : "Interlude"));
    const mem = en.memory ? `<span class="meta ro-mem">${esc(en.memory)}</span>` : "";
    const album = en.album ? `<span class="meta">${esc(en.album)}</span>` : "";
    return `<li><button class="ro-row" data-offset="${en.offset}" data-i="${i}">` +
      `<span class="ro-time num">${clock(en.offset)}</span><span class="ro-main">` +
      `<span class="ro-live"><span class="live-dot"></span><span class="meta">On air</span></span>` +
      `<span class="ro-title"><span class="ro-name">${esc(name)}</span>${rest ? " " + esc(rest) : ""}</span>` +
      `${album}${mem}</span><span class="ro-bar"></span></button></li>`;
  }

  private select(i: number, byUser: boolean): void {
    if (i === this.sel) return;
    if (byUser) this.picked = true;
    this.sel = i;
    this.render();
  }

  private cue(program: string, offset: number): void {
    document.dispatchEvent(new CustomEvent(RADIO_CUE, { detail: { program, offset } }));
  }

  private markLive(): void {
    this.querySelectorAll(".ro-row.is-live").forEach((r) => r.classList.remove("is-live"));
    this.bar = null;
    if (!this.onAir || this.onAir.path !== this.programs[this.sel]?.path) return;
    const row = this.querySelector<HTMLElement>(`.ro-row[data-i="${this.onAir.index}"]`);
    row?.classList.add("is-live");
    this.bar = row?.querySelector<HTMLElement>(".ro-bar") ?? null;
  }

  private onTrack(t: TrackInfo): void {
    this.onAir = { path: t.programPath, index: t.index };
    const i = this.programs.findIndex((x) => x.path === t.programPath);
    if (i >= 0 && !this.picked && i !== this.sel) this.sel = i, this.render();
    else this.markLive();
  }

  private onTime(t: TimeInfo): void {
    if (!this.bar || !this.onAir) return;
    const en = this.programs[this.sel].data.entries[this.onAir.index];
    if (!en) return;
    const f = Math.min(1, Math.max(0, (t.current - en.offset) / en.duration));
    this.bar.style.transform = `scaleX(${f})`;
  }
}

if (!customElements.get("running-order")) customElements.define("running-order", RunningOrder);
