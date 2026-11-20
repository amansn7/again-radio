import { loadCatalogue } from "../lib/catalogue.ts";
import { loadNewMusic, newMusicCatalogue } from "../lib/new-music.ts";
import { RADIO_CUE, RADIO_SEARCH } from "../lib/events.ts";
import { fetchJson, loadProgram, loadStation } from "../lib/station.ts";
import "../lib/glass.ts";
import { parseShows } from "../lib/shows.ts";
import { fly, loadArt, tilt } from "./search-fx.ts";
import { GROUPS, buildIndex, search, type Album, type Doc, type Song, type Sources } from "../lib/search.ts";

const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>`;
const SHOWS = "programs/usb002-every-show.json";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});

function parseSongs(v: unknown): Song[] {
  const list = rec(v).songs;
  if (!Array.isArray(list)) return [];
  return list.filter((s): s is Song => {
    const r = rec(s);
    return typeof r.title === "string" && typeof r.release === "string" && typeof r.year === "number";
  });
}

async function loadSources(): Promise<Sources> {
  const [cat, station, shows, albums, tour, songs, fresh] = await Promise.allSettled([
    loadCatalogue(), loadStation(), loadProgram(SHOWS), fetchJson("/data/albums.json"), fetchJson("/data/shows.json"),
    fetchJson("/data/songs.json"), loadNewMusic(),
  ]);
  const paths = station.status === "fulfilled" ? station.value.rotation.map((r) => r.program) : [];
  const progs = await Promise.allSettled(paths.map((p) => loadProgram(p)));
  const a = albums.status === "fulfilled" ? rec(albums.value) : {};
  return {
    catalogue: [
      ...(cat.status === "fulfilled" ? cat.value : []),
      ...(fresh.status === "fulfilled" ? newMusicCatalogue(fresh.value) : []),
    ],
    programs: progs.flatMap((r, i) => (r.status === "fulfilled" ? [{ path: paths[i], program: r.value }] : [])),
    shows: shows.status === "fulfilled" ? { path: SHOWS, program: shows.value } : null,
    albums: Array.isArray(a.albums) ? (a.albums as Album[]) : [],
    tour: tour.status === "fulfilled" ? parseShows(tour.value).shows : [],
    songs: songs.status === "fulfilled" ? parseSongs(songs.value) : [],
  };
}

class RadioSearch extends HTMLElement {
  private index: Promise<Doc[]> | null = null;
  private dlg!: HTMLDialogElement;
  private input!: HTMLInputElement;
  private list!: HTMLElement;
  private results!: HTMLElement;
  private hits: Doc[] = [];
  private active = 0;
  private opener: Element | null = null;
  private shown = new Set<string>();

  connectedCallback() {
    this.innerHTML =
      `<button type="button" class="btn rs-open" aria-haspopup="dialog">${ICON}<span>Search</span><kbd class="rs-kbd" aria-hidden="true">/</kbd></button>` +
      `<dialog class="rs-dlg glass" data-glass="regular" aria-label="Search"><div class="rs-head">${ICON}` +
      `<input class="rs-input" type="search" placeholder="Song, person, city, year" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="rs-list" aria-label="Search the radio"></div>` +
      `<div class="rs-results"><p class="rs-status meta" role="status">Try a name like Kyle or Delilah, a city like Glasgow, or a year.</p>` +
      `<div class="rs-loading" aria-hidden="true" hidden><div class="skeleton rs-sk"></div><div class="skeleton rs-sk"></div><div class="skeleton rs-sk"></div></div>` +
      `<div class="rs-list" id="rs-list" role="listbox" aria-label="Results" hidden></div></div></dialog>`;
    this.dlg = this.querySelector("dialog")!;
    this.input = this.querySelector("input")!;
    this.list = this.querySelector(".rs-list")!;
    this.results = this.querySelector(".rs-results")!;
    this.querySelector(".rs-open")!.addEventListener("click", () => this.open());
    tilt(this.list);
    this.input.addEventListener("input", () => this.render());
    this.dlg.addEventListener("keydown", (e) => this.key(e));
    this.dlg.addEventListener("click", (e) => { if (e.target === this.dlg) this.dlg.close(); });
    this.dlg.addEventListener("close", () => {
      this.input.setAttribute("aria-expanded", "false");
      (this.opener as HTMLElement | null)?.focus();
    });
    this.list.addEventListener("click", (e) => {
      const i = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
      if (i) this.pick(Number(i.dataset.i));
    });
    document.addEventListener("keydown", (e) => {
      const t = e.target as HTMLElement;
      if (t.matches("input, textarea, select, [contenteditable]") || this.dlg.open) return;
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        this.open();
      }
    });
    document.addEventListener(RADIO_SEARCH, (e) => this.open((e as CustomEvent<{ query?: string }>).detail?.query));
  }

  private open(query = "") {
    if (this.dlg.open) return;
    this.opener = document.activeElement;
    this.input.value = query;
    this.shown.clear();
    this.dlg.showModal();
    this.input.setAttribute("aria-expanded", "true");
    this.input.focus();
    this.index ??= loadSources().then(buildIndex);
    this.render();
  }

  private async render() {
    const q = this.input.value;
    const status = this.querySelector<HTMLElement>(".rs-status")!;
    if (!q.trim()) {
      this.hits = [];
      this.list.hidden = true;
      this.list.replaceChildren();
      this.results.removeAttribute("aria-busy");
      this.querySelector<HTMLElement>(".rs-loading")!.hidden = true;
      status.textContent = "Try a name like Kyle or Delilah, a city like Glasgow, or a year.";
      this.input.setAttribute("aria-expanded", "false");
      this.input.removeAttribute("aria-activedescendant");
      return;
    }
    this.index ??= loadSources().then(buildIndex);
    const pending = this.index;
    this.results.setAttribute("aria-busy", "true");
    this.list.hidden = true;
    this.querySelector<HTMLElement>(".rs-loading")!.hidden = false;
    status.textContent = "Loading search results.";
    let idx: Doc[] | undefined;
    try { idx = await pending!; } catch { if (this.index === pending) this.index = null; }
    if (q !== this.input.value) return;
    this.results.removeAttribute("aria-busy");
    this.querySelector<HTMLElement>(".rs-loading")!.hidden = true;
    if (!idx) {
      status.textContent = "Search is unavailable right now. Try again.";
      return;
    }
    this.list.replaceChildren();
    this.hits = search(idx, q);
    this.active = 0;
    if (!this.hits.length) {
      status.textContent = `Nothing matches “${q.trim()}”. Try a person's name, a city or an album.`;
      this.input.setAttribute("aria-expanded", "false");
      this.input.removeAttribute("aria-activedescendant");
      return;
    }
    status.textContent = "";
    this.list.hidden = false;
    this.input.setAttribute("aria-expanded", "true");
    let html = "";
    let n = 0;
    for (const g of GROUPS) {
      const rows = this.hits.map((d, i) => [d, i] as const).filter(([d]) => d.group === g);
      if (!rows.length) continue;
      const fresh = !this.shown.has(g);
      this.shown.add(g);
      html += `<div role="group" aria-label="${g}"><h3 class="rs-group">${g}</h3>`;
      for (const [d, i] of rows) {
        html += `<div class="rs-row${fresh ? " rs-in" : ""}" style="--n:${n++}" role="option" id="rs-${i}" data-i="${i}">` +
          `<span class="rs-art" data-a="${i}"></span><span class="rs-t"><span>${esc(d.title)}</span><span class="meta">${esc(d.context)}</span></span><span class="rs-r num meta">${esc(d.right)}${d.action.type === "link" ? `<span class="rs-out" aria-label=", opens YouTube"> ↗</span>` : ""}</span></div>`;
      }
      html += `</div>`;
    }
    this.list.innerHTML = html;
    loadArt(this.list, this.hits.map((d) => d.art));
    this.mark();
  }

  private mark() {
    this.list.querySelectorAll("[aria-selected]").forEach((r) => r.removeAttribute("aria-selected"));
    const row = this.list.querySelector<HTMLElement>(`#rs-${this.active}`);
    row?.setAttribute("aria-selected", "true");
    row?.scrollIntoView({ block: "nearest" });
    this.input.setAttribute("aria-activedescendant", `rs-${this.active}`);
  }

  private key(e: KeyboardEvent) {
    const n = this.hits.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!n) return;
      this.active = (this.active + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
      this.mark();
    } else if (e.key === "Enter" && n) {
      e.preventDefault();
      this.pick(this.active);
    }
  }

  private pick(i: number) {
    const a = this.hits[i]?.action;
    if (!a) return;
    if (a.type === "query") {
      this.input.value = a.query;
      this.render();
      return;
    }
    if (a.type === "link") {
      window.open(a.url, "_blank", "noopener");
      return;
    }
    if (a.type === "scroll") {
      this.dlg.close();
      document.querySelector(a.target)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    const detail = a.type === "video" ? { video: a.video, offset: a.offset } : { program: a.program, offset: a.offset };
    void fly(this.list.querySelector<HTMLElement>(`#rs-${i}`), this.dlg, () => document.dispatchEvent(new CustomEvent(RADIO_CUE, { detail })));
  }
}

customElements.define("radio-search", RadioSearch);
