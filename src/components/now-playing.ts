import type { ProgramEntry } from "../lib/station.ts";
import { RADIO_TRACK } from "../lib/events.ts";
import type { TrackInfo } from "../lib/events.ts";
import { coverArtUrl, resolveArtUrl, ytThumb } from "../lib/art.ts";
import { dateStamp, personFromTitle } from "../lib/memories.ts";
import { NameLight, letters } from "./hero-name.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RANGE = /\((\w+) (\d+)\s*[–-]\s*(\w+) (\d+) (\d{4})\)/;

function nameOf(e: ProgramEntry): { name: string; rest: string } {
  if (e.type === "interlude") return { name: "Again Radio", rest: "station ident" };
  if (e.type === "id") return { name: "Unreleased", rest: "an ID with no title yet" };
  const title = e.title ?? "", person = personFromTitle(title);
  if (!person) return { name: title, rest: e.artist ?? "" };
  return { name: person, rest: title.slice(person.length).replace(/[()]/g, "").trim() };
}

function when(album: string | undefined, iso: string | undefined): { stamp: string; plain: string } {
  const m = album?.match(RANGE);
  if (m) return { stamp: dateStamp(album), plain: `${m[1].slice(0, 3)} ${m[2]} to ${m[3].slice(0, 3)} ${m[4]}, ${m[5]}` };
  const [y, mo, d] = (iso ?? "").split("-").map(Number);
  if (!y || !mo || !d) return { stamp: "", plain: "" };
  return { stamp: `'${String(y).slice(2)} ${mo} ${d}`, plain: `${MONTHS[mo - 1]} ${d}, ${y}` };
}

const coverFor = (entry: ProgramEntry, ytId?: string): Promise<string> =>
  resolveArtUrl(entry, ytId).then((u) => u ?? (ytId ? ytThumb(ytId) : coverArtUrl()));

class NowPlayingElement extends HTMLElement {
  private fit!: HTMLElement;
  private name!: HTMLElement;
  private rest!: HTMLElement;
  private meta!: HTMLElement;
  private cover!: HTMLElement;
  private seq = 0;
  private light!: NameLight;
  private swap = 0;
  private metaSwap = 0;
  private still = matchMedia("(prefers-reduced-motion: reduce)");

  connectedCallback() {
    const q = (s: string) => this.querySelector<HTMLElement>(s)!;
    this.fit = q(".np-fit"); this.name = q(".np-name"); this.rest = q(".np-rest");
    this.meta = q(".np-meta"); this.cover = q(".np-cover");
    this.meta.dataset.empty = "";
    document.addEventListener(RADIO_TRACK, (e) => this.onTrack((e as CustomEvent<TrackInfo>).detail));
    this.light = new NameLight(this.name);
    setTimeout(() => {
      if (this.fit.dataset.ready !== undefined) return;
      this.fit.dataset.ready = "";
      this.name.textContent = "Still tuning";
      this.rest.textContent = "The station has not answered yet. Reload the page if this stays.";
    }, 10_000);
  }

  private onTrack({ entry, programTitle, date, youtubeId }: TrackInfo) {
    const { name, rest } = nameOf(entry);
    this.showName(name, rest);
    this.showMeta(entry, programTitle, date);

    if (entry.type === "track") void this.setCover(entry, youtubeId);
    else {
      ++this.seq;
      this.cover.classList.remove("skeleton");
      this.cover.replaceChildren();
    }
  }

  private showMeta(entry: ProgramEntry, programTitle: string, date: string | undefined) {
    const mine = ++this.metaSwap;
    const update = () => {
      if (mine !== this.metaSwap) return;
      // without an album, name the artist rather than repeat the programme credit under the video
      const artist = entry.artist && !/^fred again/i.test(entry.artist) ? entry.artist : "";
      const rest = nameOf(entry).rest;
      const metaText = entry.album?.replace(/\s*\([^)]*\)\s*/, " ").trim() || (artist !== rest ? artist : "");
      this.meta.toggleAttribute("data-empty", entry.type !== "track" || !metaText);
      this.q(".np-album").textContent = metaText || programTitle;
      const w = when(entry.album, date);
      this.q(".np-stamp").textContent = w.stamp;
      this.q(".np-plain").textContent = w.plain;
      this.meta.removeAttribute("data-changing");
    };
    if (!this.meta.hasAttribute("data-changing") && this.still.matches) return update();
    this.meta.setAttribute("data-changing", "");
    if (this.still.matches || document.hidden) return update();
    setTimeout(update, 120);
  }

  // The old name lifts and softens away before the new one arrives.
  private showName(name: string, rest: string) {
    const mine = ++this.swap;
    const old = this.name.querySelector(".np-name-in");
    const put = () => {
      if (mine !== this.swap) return;
      const longest = Math.max(5, ...name.split(/\s+/).map((w) => Array.from(w).length));
      this.fit.style.setProperty("--len", String(longest));
      this.fit.style.setProperty("--total", String(Math.max(10, Array.from(name).length)));
      const label = document.createElement("span"); label.className = "sr-only"; label.textContent = name;
      const visual = document.createElement("span"); visual.className = "np-name-in"; visual.setAttribute("aria-hidden", "true"); visual.append(letters(name));
      this.name.replaceChildren(label, visual);
      const restIn = document.createElement("span"); restIn.className = "np-rest-in"; restIn.textContent = rest;
      this.rest.replaceChildren(restIn);
      this.fit.dataset.ready = "";
      this.light.arrive();
    };
    if (!old || this.still.matches || document.hidden) return put();
    old.classList.add("np-out");
    this.rest.firstElementChild?.classList.add("np-out");
    setTimeout(put, 220);
  }

  private q(s: string): HTMLElement {
    return this.querySelector<HTMLElement>(s)!;
  }

  private async setCover(entry: ProgramEntry, youtubeId?: string) {
    const mine = ++this.seq;
    const previous = this.cover.querySelector("img");
    if (!previous) this.cover.classList.add("skeleton");
    const src = await coverFor(entry, youtubeId);
    if (mine !== this.seq) return;
    const img = new Image();
    img.alt = "";
    img.addEventListener("load", () => {
      if (mine !== this.seq) return;
      this.cover.classList.remove("skeleton");
      img.classList.add("np-cover-in");
      this.cover.append(img);
      if (previous) setTimeout(() => previous.remove(), this.still.matches ? 0 : 360);
    });
    img.addEventListener("error", () => {
      if (mine !== this.seq) return;
      this.cover.classList.remove("skeleton");
      previous?.remove();
    });
    img.src = src;
  }
}

if (!customElements.get("now-playing")) customElements.define("now-playing", NowPlayingElement);
