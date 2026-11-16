import type { ProgramEntry } from "../lib/station.ts";
import { RADIO_STATE, RADIO_TIME, RADIO_TRACK } from "../lib/events.ts";
import type { StateInfo, TimeInfo, TrackInfo } from "../lib/events.ts";
import { coverArtUrl, resolveArtUrl } from "../lib/art.ts";


function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function albumName(album: string | undefined): string {
  return (album ?? "").replace(/\s*\([^)]*\)\s*/, " ").trim();
}

function formatDay(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function initials(title: string | undefined): string {
  const words = (title ?? "").split(/[\s,]+/).filter((w) => /[a-z0-9]/i.test(w));
  if (!words.length) return "?";
  return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class NowPlayingElement extends HTMLElement {
  private artworkBox!: HTMLElement;
  private fieldsEl!: HTMLElement;
  private emptyEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private artistEl!: HTMLElement;
  private albumEl!: HTMLElement;
  private albumWrap!: HTMLElement;
  private programmeEl!: HTMLElement;
  private stateDot!: HTMLElement;
  private progressFill!: HTMLElement;
  private timeElapsed!: HTMLElement;
  private timeRemaining!: HTMLElement;

  private currentEntry: ProgramEntry | null = null;
  private lastPct = -1;
  private lastSec = -1;
  private lastArtKey: string | null = null;
  private playing = false;

  connectedCallback() {
    this.innerHTML = `
      <div class="np-artwork-box"><div class="np-placeholder is-stamp">NOW PLAYING</div></div>
      <div class="np-track-area">
        <div class="np-empty-state"><hr class="rule" /><span class="stamp">NOW PLAYING</span></div>
        <div class="np-fields">
          <div class="np-title-wrap"><div class="np-title"></div></div>
          <div class="np-artist-wrap"><div class="np-artist"></div></div>
          <div class="np-album-wrap"><div class="np-album"></div></div>
          <div class="np-programme"><span class="np-state-dot">&#9679;</span><span class="np-programme-text"></span></div>
          <div class="np-progress-wrap">
            <div class="np-progress-track"><div class="np-progress-fill"></div></div>
            <div class="np-progress-times"><span class="np-elapsed">0:00</span><span class="np-remaining">0:00</span></div>
          </div>
        </div>
      </div>
    </div>
    `;

    this.artworkBox = this.querySelector(".np-artwork-box") as HTMLElement;
    this.fieldsEl = this.querySelector(".np-fields") as HTMLElement;
    this.emptyEl = this.querySelector(".np-empty-state") as HTMLElement;
    this.titleEl = this.querySelector(".np-title") as HTMLElement;
    this.artistEl = this.querySelector(".np-artist") as HTMLElement;
    this.albumEl = this.querySelector(".np-album") as HTMLElement;
    this.albumWrap = this.querySelector(".np-album-wrap") as HTMLElement;
    this.programmeEl = this.querySelector(".np-programme-text") as HTMLElement;
    this.stateDot = this.querySelector(".np-state-dot") as HTMLElement;
    this.progressFill = this.querySelector(".np-progress-fill") as HTMLElement;
    this.timeElapsed = this.querySelector(".np-elapsed") as HTMLElement;
    this.timeRemaining = this.querySelector(".np-remaining") as HTMLElement;

    document.addEventListener(RADIO_TRACK, (e) => {
      this.onTrack((e as CustomEvent<TrackInfo>).detail);
    });
    document.addEventListener(RADIO_TIME, (e) => {
      this.onTime((e as CustomEvent<TimeInfo>).detail);
    });
    document.addEventListener(RADIO_STATE, (e) => {
      this.playing = (e as CustomEvent<StateInfo>).detail.playing;
      this.stateDot.textContent = this.playing ? "●" : "○";
    });
  }

  private async onTrack(info: TrackInfo) {
    const { entry, venue, date } = info;

    this.fieldsEl.classList.remove("is-live");
    await sleep(200);

    this.currentEntry = entry;
    this.titleEl.textContent = entry.title ?? "";
    this.artistEl.textContent = entry.artist ?? "";

    if (entry.album) {
      this.albumEl.textContent = albumName(entry.album);
      this.albumWrap.style.visibility = "visible";
    } else {
      this.albumEl.textContent = "";
      this.albumWrap.style.visibility = "hidden";
    }

    const parts = [venue, formatDay(date)].filter(Boolean);
    this.programmeEl.textContent = parts.join(" · ");
    this.stateDot.textContent = this.playing ? "●" : "○";

    this.lastPct = -1;
    this.emptyEl.classList.add("is-gone");
    this.fieldsEl.classList.add("is-live");

    const artKey = `${entry.type}|${entry.title ?? ""}|${entry.album ?? ""}`;
    if (artKey !== this.lastArtKey) {
      this.lastArtKey = artKey;
      void this.updateArtwork(entry);
    }
  }

  private async updateArtwork(entry: ProgramEntry) {
    if (entry.type === "id") {
      this.artworkBox.innerHTML = `<div class="np-placeholder">${initials(entry.title)}</div>`;
      return;
    }
    if (entry.type === "interlude") {
      this.artworkBox.innerHTML = `<div class="np-ident">AGAIN RADIO</div>`;
      return;
    }

    const resolved = await resolveArtUrl(entry);
    const src = resolved ?? coverArtUrl();
    const img = document.createElement("img");
    img.alt = entry.title ?? "Track artwork";
    const loaded = await new Promise<boolean>((res) => {
      img.onload = () => res(true);
      img.onerror = () => res(false);
      img.src = src;
    });
    if (!loaded) {
      this.artworkBox.innerHTML = `<div class="np-placeholder">${initials(entry.title)}</div>`;
      return;
    }
    this.artworkBox.innerHTML = "";
    this.artworkBox.appendChild(img);
  }

  private onTime({ current }: { current: number; duration: number }) {
    const entry = this.currentEntry;
    if (!entry) return;
    const elapsed = Math.max(0, Math.min(current - entry.offset, entry.duration));
    const pct = entry.duration > 0 ? Math.round((elapsed / entry.duration) * 100) : 0;
    if (pct !== this.lastPct) {
      this.lastPct = pct;
      this.progressFill.style.width = `${pct}%`;
    }
    const sec = Math.floor(elapsed);
    if (sec === this.lastSec) return;
    this.lastSec = sec;
    this.timeElapsed.textContent = formatTime(elapsed);
    this.timeRemaining.textContent = formatTime(entry.duration - elapsed);
  }
}

if (!customElements.get("now-playing")) customElements.define("now-playing", NowPlayingElement);
