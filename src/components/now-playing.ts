import type { ProgramEntry } from "../lib/station.ts";
import { RADIO_TRACK } from "../lib/events.ts";
import type { TrackInfo } from "../lib/events.ts";
import { coverArtUrl, resolveArtUrl } from "../lib/art.ts";
import { dateStamp, personFromTitle } from "../lib/memories.ts";
import { onPulse } from "../lib/pulse.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RANGE = /\((\w+) (\d+)\s*[–-]\s*(\w+) (\d+) (\d{4})\)/;

function nameOf(e: ProgramEntry): { name: string; rest: string } {
  if (e.type === "interlude") return { name: "Again Radio", rest: "station ident" };
  if (e.type === "id") return { name: "Unreleased", rest: "an ID with no title yet" };
  const title = e.title ?? "";
  const person = personFromTitle(title);
  if (!person) return { name: title, rest: e.artist ?? "" };
  return { name: person, rest: title.slice(person.length).replace(/[()]/g, "").trim() };
}

function when(album: string | undefined, iso: string | undefined): { stamp: string; plain: string } {
  const m = album?.match(RANGE);
  if (m) {
    return {
      stamp: dateStamp(album),
      plain: `${m[1].slice(0, 3)} ${m[2]} to ${m[3].slice(0, 3)} ${m[4]}, ${m[5]}`,
    };
  }
  const [y, mo, d] = (iso ?? "").split("-").map(Number);
  if (!y || !mo || !d) return { stamp: "", plain: "" };
  return { stamp: `'${String(y).slice(2)} ${mo} ${d}`, plain: `${MONTHS[mo - 1]} ${d}, ${y}` };
}

function letters(text: string): DocumentFragment {
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

const covers = new Map<string, Promise<string>>();

function coverFor(entry: ProgramEntry): Promise<string> {
  const key = `${entry.title ?? ""}|${entry.album ?? ""}`;
  let p = covers.get(key);
  if (!p) {
    p = resolveArtUrl(entry).then((u) => u ?? coverArtUrl());
    covers.set(key, p);
  }
  return p;
}

class NowPlayingElement extends HTMLElement {
  private fit!: HTMLElement;
  private name!: HTMLElement;
  private rest!: HTMLElement;
  private meta!: HTMLElement;
  private cover!: HTMLElement;
  private seq = 0;

  connectedCallback() {
    const q = (s: string) => this.querySelector<HTMLElement>(s)!;
    this.fit = q(".np-fit");
    this.name = q(".np-name");
    this.rest = q(".np-rest");
    this.meta = q(".np-meta");
    this.cover = q(".np-cover");
    this.meta.dataset.empty = "";
    document.addEventListener(RADIO_TRACK, (e) => this.onTrack((e as CustomEvent<TrackInfo>).detail));
    let beat = -1;
    onPulse(({ kick, env }) => {
      const v = Math.round(kick * env * 50) / 50;
      if (v !== beat) this.name.style.setProperty("--beat", String((beat = v)));
    });
    setTimeout(() => {
      if (this.fit.dataset.ready !== undefined) return;
      this.fit.dataset.ready = "";
      this.name.textContent = "Still tuning";
      this.rest.textContent = "The station has not answered yet. Reload the page if this stays.";
    }, 10_000);
  }

  private onTrack({ entry, programTitle, date }: TrackInfo) {
    const { name, rest } = nameOf(entry);
    const longest = Math.max(5, ...name.split(/\s+/).map((w) => Array.from(w).length));
    this.fit.style.setProperty("--len", String(longest));

    const label = document.createElement("span");
    label.className = "sr-only";
    label.textContent = name;
    const visual = document.createElement("span");
    visual.className = "np-name-in";
    visual.setAttribute("aria-hidden", "true");
    visual.append(letters(name));
    this.name.replaceChildren(label, visual);

    const restIn = document.createElement("span");
    restIn.className = "np-rest-in";
    restIn.textContent = rest;
    this.rest.replaceChildren(restIn);
    this.fit.dataset.ready = "";

    // without an album, name the artist rather than repeat the programme credit under the video
    const artist = entry.artist && !/^fred again/i.test(entry.artist) ? entry.artist : "";
    const metaText = entry.album?.replace(/\s*\([^)]*\)\s*/, " ").trim() || (artist !== rest ? artist : "");
    this.meta.toggleAttribute("data-empty", entry.type !== "track" || !metaText);
    this.q(".np-album").textContent = metaText || programTitle;
    const w = when(entry.album, date);
    this.q(".np-stamp").textContent = w.stamp;
    this.q(".np-plain").textContent = w.plain;
    if (entry.type === "track") void this.setCover(entry);
    else this.cover.replaceChildren();
  }

  private q(s: string): HTMLElement {
    return this.querySelector<HTMLElement>(s)!;
  }

  private async setCover(entry: ProgramEntry) {
    const mine = ++this.seq;
    this.cover.classList.add("skeleton");
    this.cover.replaceChildren();
    const src = await coverFor(entry);
    if (mine !== this.seq) return;
    const img = new Image();
    img.alt = "";
    img.addEventListener("load", () => {
      if (mine !== this.seq) return;
      this.cover.classList.remove("skeleton");
      this.cover.replaceChildren(img);
    });
    img.addEventListener("error", () => {
      if (mine === this.seq) this.cover.classList.remove("skeleton");
    });
    img.src = src;
  }
}

if (!customElements.get("now-playing")) customElements.define("now-playing", NowPlayingElement);
