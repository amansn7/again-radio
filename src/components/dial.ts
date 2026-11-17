import "../lib/glass.ts";
import { loadProgram, loadStation } from "../lib/station.ts";
import { loadCatalogue, type CatalogueItem } from "../lib/catalogue.ts";
import { RADIO_CUE, RADIO_TRACK, lastTrack, type TrackInfo } from "../lib/events.ts";
import { esc, parseAlbumsData, type Album } from "./archive-rail.ts";
import { EVERY_SHOW, albumCards, showCards, trackCards, type Card, type Choice, type Loaded } from "./dial-data.ts";
import { cardEl, warm } from "./dial-card.ts";
import { Ring } from "./dial-ring.ts";
import { drift, type Drift } from "./dial-drift.ts";

const CHOICES: [Choice, string][] = [["order", "Running order"], ["shows", "Shows"], ["albums", "Albums"]];
const HEAD =
  `<div class="wrap dl-head"><h2 class="section-title" id="dl-title">On the dial</h2>` +
  `<p class="meta">Every track, every show, every record. Turn the ring and drop in.</p></div>`;

class WarpDial extends HTMLElement {
  private programs: Loaded[] = [];
  private albums: Album[] = [];
  private catalogue: CatalogueItem[] = [];
  private choice: Choice = "order";
  private sel = 0;
  private picked = false;
  private air: TrackInfo | null = null;
  private airPath = "";
  private cards: Card[] = [];
  private ring!: Ring;
  private drift!: Drift;
  private live!: HTMLElement;

  async connectedCallback(): Promise<void> {
    this.innerHTML = HEAD + `<div class="wrap"><div class="skeleton dl-skel"></div></div>`;
    try {
      const station = await loadStation();
      const paths = [...new Set([...station.rotation.map((r) => r.program), EVERY_SHOW])];
      const albums = fetch("/data/albums.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const catalogue = loadCatalogue().catch((): CatalogueItem[] => []);
      this.programs = await Promise.all(paths.map(async (path) => ({ path, data: await loadProgram(path) })));
      this.albums = parseAlbumsData(await albums).albums;
      this.catalogue = await catalogue;
    } catch {
      this.innerHTML = HEAD + `<p class="wrap meta" role="alert">The dial could not be loaded. Check your connection and reload the page.</p>`;
      return;
    }
    this.renderShell();
    document.addEventListener(RADIO_TRACK, (e) => this.onTrack((e as CustomEvent<TrackInfo>).detail));
    if (lastTrack) this.onTrack(lastTrack);
  }

  private renderShell(): void {
    const tabs = CHOICES.map(([c, label]) =>
      `<button type="button" role="tab" id="dl-tab-${c}" aria-controls="dl-ring" data-c="${c}">${label}</button>`).join("");
    this.innerHTML = HEAD +
      `<div class="wrap dl-controls"><div class="dl-seg glass" data-glass role="tablist" aria-label="Browse by">${tabs}</div>` +
      `<label class="dl-pick glass" data-glass><span class="sr-only">Programme</span><select></select></label>` +
      `<button type="button" class="icon-btn dl-auto glass" data-glass aria-pressed="false" aria-label="Pause auto-scroll" hidden>` +
      `<svg class="dl-ico-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>` +
      `<svg class="dl-ico-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg></button></div>` +
      `<div class="dl-stage" id="dl-ring" role="tabpanel"><div class="dl-track" role="group" aria-roledescription="carousel" aria-describedby="dl-hint"></div></div>` +
      `<p class="wrap meta dl-hint" id="dl-hint">Drag, scroll or use the arrow keys. Choose the front card to play.</p>` +
      `<p class="sr-only" aria-live="polite"></p>`;
    this.live = this.querySelector("[aria-live]")!;
    const seg = this.querySelector<HTMLElement>(".dl-seg")!;
    const select = this.querySelector("select")!;
    seg.addEventListener("click", (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>("[data-c]")?.dataset.c as Choice | undefined;
      if (c) this.setChoice(c);
    });
    seg.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const i = (CHOICES.findIndex(([c]) => c === this.choice) + d + CHOICES.length) % CHOICES.length;
      this.setChoice(CHOICES[i][0]);
      this.querySelector<HTMLElement>(`#dl-tab-${this.choice}`)?.focus();
    });
    select.addEventListener("change", () => { this.picked = true; this.sel = Number(select.value); this.show(); });
    this.options();
    this.ring = new Ring(this.querySelector(".dl-stage")!, this.querySelector(".dl-track")!, {
      build: (i) => cardEl(this.cards[i], this.air, i === this.ring.front),
      activate: (i) => this.play(i),
      front: (i) => this.announce(i),
      prefetch: (i) => { if (this.cards[i]) warm(this.cards[i]); },
    });
    this.drift = drift(this.ring, this.querySelector(".dl-stage")!, this.querySelector(".dl-track")!);
    const auto = this.querySelector<HTMLButtonElement>(".dl-auto")!;
    auto.addEventListener("click", () => {
      const paused = this.drift.toggle();
      auto.setAttribute("aria-pressed", String(paused));
      auto.setAttribute("aria-label", paused ? "Resume auto-scroll" : "Pause auto-scroll");
    });
    this.setChoice("order");
  }

  private options(): void {
    this.querySelector("select")!.innerHTML =
      this.programs.map((p, i) => `<option value="${i}">${esc(p.data.title)}</option>`).join("");
  }

  private setChoice(c: Choice): void {
    this.choice = c;
    this.querySelectorAll<HTMLElement>("[role=tab]").forEach((t) => {
      const on = t.dataset.c === c;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    this.querySelector("#dl-ring")!.setAttribute("aria-labelledby", `dl-tab-${c}`);
    this.querySelector<HTMLElement>(".dl-pick")!.hidden = c !== "order";
    this.querySelector<HTMLElement>(".dl-auto")!.hidden = c === "order";
    this.show();
    // Shows and Albums turn by themselves; the running order follows what is on air instead.
    this.drift.enable(c !== "order");
  }

  private show(): void {
    const p = this.programs[this.sel];
    this.cards = this.choice === "order" ? trackCards(p) : this.choice === "shows" ? showCards(this.programs, this.catalogue) : albumCards(this.albums, this.programs);
    this.querySelector("select")!.value = String(this.sel);
    const label = this.choice === "order" ? `Running order of ${p.data.title}` : this.choice === "shows" ? "Shows" : "Albums";
    this.querySelector(".dl-track")!.setAttribute("aria-label", label);
    const air = this.air;
    this.ring.reset(this.cards.length, air ? Math.max(0, this.cards.findIndex((c) => c.onAir(air))) : 0);
  }

  private play(i: number): void {
    const cue = this.cards[i]?.cue;
    if (cue) document.dispatchEvent(new CustomEvent(RADIO_CUE, { detail: cue }));
  }

  private announce(i: number): void {
    const c = this.cards[i];
    if (c && this.contains(document.activeElement)) this.live.textContent = `${i + 1} of ${this.cards.length}: ${c.title}, ${c.sub}`;
  }

  private onTrack(t: TrackInfo): void {
    this.air = t;
    let prog = this.programs.findIndex((x) => x.path === t.programPath);
    if (prog < 0) {
      // A catalogue video on air: its running order belongs on the dial like any programme.
      prog = this.programs.push({ path: t.programPath, data: {
        id: t.programId, title: t.programTitle, venue: t.venue, date: t.date,
        youtubeId: t.youtubeId, duration: t.programDuration, entries: t.entries,
      } }) - 1;
      this.options();
    }
    // A new set on air wins over an earlier browse: the dial follows what is actually playing.
    if (t.programPath !== this.airPath) {
      this.airPath = t.programPath;
      this.picked = false;
    }
    if (this.choice === "order" && prog !== this.sel && !this.picked) {
      this.sel = prog;
      this.show();
      return;
    }
    this.ring.each((el, i) => (this.cards[i].onAir(t) ? el.setAttribute("aria-current", "true") : el.removeAttribute("aria-current")));
    const i = this.cards.findIndex((c) => c.onAir(t));
    if (this.choice === "order" && i >= 0 && i !== this.ring.front && !this.ring.recent) this.ring.goto(i);
  }
}

if (!customElements.get("warp-dial")) customElements.define("warp-dial", WarpDial);
