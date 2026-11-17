import { loadArtist, type Artist, type Release } from "../lib/artist.ts";
import { RADIO_SEARCH } from "../lib/events.ts";
import { esc } from "./archive-rail.ts";
import { layoutLedger, sentenceDate, type Layout } from "./ledger-layout.ts";

const LANE_PX = 44;
const ROW_PX = 28;
const MOTION_OK = (): boolean => !matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window;

const when = (r: Release): string =>
  r.span ? `${sentenceDate(r.span.from)} to ${sentenceDate(r.span.to)}` : sentenceDate(r.date);
const t = (r: Release): number => Date.parse(r.date);
const num = (n: number, w: string): string => `<span class="num">${n}</span> ${w}`;

function buildStage(a: Artist, l: Layout): string {
  const d = (x: number): string => `--d:${Math.round(x * 14)}ms`;
  const years = l.years.map((y) => `<span class="lg-year num" style="left:${y.x}%">${y.label}</span>`).join("");
  const records = l.records.map((r) => {
    const cls = `lg-it ${r.band ? "lg-band" : "lg-mark"}${r.flip ? " is-flip" : ""}`;
    return `<button class="${cls}" data-g="r" data-rid="${esc(r.rel.id)}" data-t="${t(r.rel)}" data-q="${esc(r.rel.title)}" ` +
      `style="left:${r.x}%;--w:${r.w}%;--lane:${r.lane};${d(r.x)}" aria-label="${esc(r.rel.title)}, ${when(r.rel)}">` +
      `<span class="lg-label">${esc(r.rel.title)}</span></button>`;
  }).join("");
  const ticks = l.ticks.map((k) =>
    `<button class="lg-it lg-tick" data-g="r" data-rid="${esc(k.rel.id)}" data-t="${t(k.rel)}" data-q="${esc(k.rel.title)}" ` +
    `style="left:${k.x}%;${d(k.x)}" aria-label="${esc(k.rel.title)}, ${when(k.rel)}"></button>`).join("");
  const names = l.names.map((n) =>
    `<button class="lg-it lg-name${n.flip ? " is-flip" : ""}" data-g="n" data-rid="${esc(n.rel.id)}" data-t="${t(n.rel)}" ` +
    `data-q="${esc(n.name)}" data-pi="${n.pi}" style="left:calc(${n.x}% + ${Math.round(n.drift)}px);--row:${n.row};${d(n.x)}" ` +
    `aria-label="${esc(n.name)}, named in ${esc(n.rel.title)}">${esc(n.name)}</button>`).join("");
  return `<div class="lg-bands" style="height:${l.lanes * LANE_PX}px">${records}</div>` +
    `<div class="lg-axis">${ticks}<span class="lg-axisline"></span></div>` +
    `<div class="lg-years">${years}</div>` +
    `<div class="lg-names" style="height:${l.rows * ROW_PX + 12}px">${names}</div>`;
}

const coverCache = new Map<number, Promise<string | null>>();
function cover(id: number): Promise<string | null> {
  let p = coverCache.get(id);
  if (!p) {
    p = fetch(`https://itunes.apple.com/lookup?id=${id}`)
      .then((r) => r.json() as Promise<{ results?: { artworkUrl100?: string }[] }>)
      .then((b) => b.results?.[0]?.artworkUrl100?.replace("100x100bb", "200x200bb") ?? null)
      .catch(() => null);
    coverCache.set(id, p);
  }
  return p;
}

class LedgerElement extends HTMLElement {
  private a!: Artist;
  private groups: Record<string, HTMLElement[]> = { r: [], n: [] };
  private card!: HTMLElement;
  private seq = 0;

  async connectedCallback(): Promise<void> {
    this.innerHTML = `<div class="lg-head"><h2 class="section-title" id="lg-title">A life in progress</h2><p class="meta lg-counts"></p></div>` +
      `<div class="skeleton lg-skel"></div>`;
    try {
      this.a = await loadArtist();
    } catch {
      this.querySelector(".lg-skel")!.outerHTML = `<p class="meta lg-error" role="alert">The catalogue hasn't loaded. Reload to try again.</p>`;
      return;
    }
    this.render();
  }

  private render(): void {
    const a = this.a;
    const motion = MOTION_OK();
    this.querySelector(".lg-counts")!.innerHTML =
      [num(a.releases.length, "records"), num(a.songs.length, "songs"), `${num(a.people.length, "people")} named in titles`, num(a.shows, "shows")].join(", ");
    this.querySelector(".lg-skel")!.outerHTML =
      `<div class="lg-scroll"><div class="lg-stage" role="group" aria-labelledby="lg-title"${motion ? ` data-reveal="pending"` : ""}>` +
      `${buildStage(a, layoutLedger(a))}</div></div>` +
      `<div class="lg-card" aria-hidden="true"><img alt="" width="72" height="72" decoding="async"><div class="lg-card-body">` +
      `<p class="lg-card-title"></p><p class="meta lg-card-when num"></p><p class="meta lg-card-songs"></p></div></div>`;

    const stage = this.querySelector<HTMLElement>(".lg-stage")!;
    this.card = this.querySelector<HTMLElement>(".lg-card")!;
    const img = this.card.querySelector("img")!;
    img.addEventListener("load", () => img.classList.add("is-loaded"));
    img.addEventListener("error", () => this.card.classList.add("no-art"));
    for (const g of ["r", "n"]) {
      this.groups[g] = [...stage.querySelectorAll<HTMLElement>(`.lg-it[data-g="${g}"]`)].sort((x, y) => Number(x.dataset.t) - Number(y.dataset.t));
      this.groups[g]!.forEach((el, i) => el.tabIndex = g === "r" && i === 0 ? 0 : -1);
    }

    stage.addEventListener("pointerover", (e) => { if (e.pointerType !== "touch") this.show(e.target); });
    stage.addEventListener("focusin", (e) => this.show(e.target, true));
    stage.addEventListener("pointerout", () => this.hide());
    stage.addEventListener("focusout", () => this.hide());
    stage.addEventListener("click", (e) => {
      const q = (e.target as HTMLElement).closest<HTMLElement>(".lg-it")?.dataset.q;
      if (q) document.dispatchEvent(new CustomEvent(RADIO_SEARCH, { detail: { query: q } }));
    });
    stage.addEventListener("keydown", (e) => this.key(e));

    if (motion) {
      const io = new IntersectionObserver((es) => {
        if (!es.some((x) => x.isIntersecting)) return;
        io.disconnect();
        stage.dataset.reveal = "done";
      }, { threshold: 0.3 });
      io.observe(stage);
    }
  }

  private show(target: EventTarget | null, focus = false): void {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>(".lg-it");
    if (!el) return;
    if (focus) {
      this.querySelectorAll<HTMLElement>('.lg-it[tabindex="0"]').forEach((o) => { o.tabIndex = -1; });
      el.tabIndex = 0;
    }
    this.hide();
    const rid = el.dataset.rid!;
    this.classList.add("has-on");
    this.querySelectorAll(`.lg-it[data-rid="${rid}"]`).forEach((o) => o.classList.add("is-on"));
    el.classList.add("is-on");
    const rel = this.a.releases.find((r) => r.id === rid);
    if (rel) this.fillCard(rel, el);
  }

  private hide(): void {
    this.classList.remove("has-on");
    this.querySelectorAll(".is-on").forEach((o) => o.classList.remove("is-on"));
    this.card?.classList.remove("is-show");
    this.seq++;
  }

  private fillCard(rel: Release, el: HTMLElement): void {
    const mine = new Set(el.dataset.pi ? this.a.people[Number(el.dataset.pi)]?.songIds : []);
    const byId = new Map(this.a.songs.map((s) => [s.id, s]));
    const songs = rel.trackIds.flatMap((id) => byId.get(id) ?? []);
    const shown = songs.slice(0, 14).map((s) => (mine.has(s.id) ? `<b>${esc(s.title)}</b>` : esc(s.title)));
    const more = songs.length > 14 ? `, and ${songs.length - 14} more` : "";
    const c = this.card;
    c.querySelector(".lg-card-title")!.textContent = rel.title;
    c.querySelector(".lg-card-when")!.textContent = when(rel);
    c.querySelector(".lg-card-songs")!.innerHTML = shown.join(", ") + more;
    const img = c.querySelector("img")!;
    img.classList.remove("is-loaded");
    img.removeAttribute("src");
    c.classList.remove("no-art");
    const mark = ++this.seq;
    const art = rel.collectionId ? cover(rel.collectionId) : Promise.resolve(null);
    void art.then((u) => { if (mark !== this.seq) return; if (u) img.src = u; else c.classList.add("no-art"); });

    const box = this.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.max(r.left + r.width / 2 - box.left - c.offsetWidth / 2, 0), box.width - c.offsetWidth);
    const below = r.top - box.top < box.height / 2;
    c.style.left = `${left}px`;
    c.style.top = `${below ? r.bottom - box.top + 10 : r.top - box.top - c.offsetHeight - 10}px`;
    c.classList.add("is-show");
  }

  private key(e: KeyboardEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>(".lg-it");
    if (!el) return;
    const g = el.dataset.g!;
    const own = this.groups[g]!;
    const i = own.indexOf(el);
    let next: HTMLElement | undefined;
    if (e.key === "ArrowRight") next = own[i + 1];
    else if (e.key === "ArrowLeft") next = own[i - 1];
    else if (e.key === "Home") next = own[0];
    else if (e.key === "End") next = own[own.length - 1];
    else if ((e.key === "ArrowDown" && g === "r") || (e.key === "ArrowUp" && g === "n")) {
      const at = Number(el.dataset.t);
      next = this.groups[g === "r" ? "n" : "r"]!.reduce<HTMLElement | undefined>((best, o) =>
        !best || Math.abs(Number(o.dataset.t) - at) < Math.abs(Number(best.dataset.t) - at) ? o : best, undefined);
    } else return;
    e.preventDefault();
    next?.focus();
  }
}

if (!customElements.get("life-ledger")) customElements.define("life-ledger", LedgerElement);
