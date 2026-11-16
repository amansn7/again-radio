import type { ProgramEntry } from "../lib/station.ts";
import { RADIO_TRACK } from "../lib/events.ts";
import type { TrackInfo } from "../lib/events.ts";
import { memoryFor, dateStamp } from "../lib/memories.ts";
import type { MemoryLine } from "../lib/memories.ts";


class MemoryCard extends HTMLElement {
  private typeLabel: HTMLElement | null = null;
  private personEl: HTMLElement | null = null;
  private captionEl: HTMLElement | null = null;
  private identEl: HTMLElement | null = null;
  private stampEl: HTMLElement | null = null;
  private reduced = false;

  connectedCallback() {
    this.typeLabel = this.querySelector("#mc-type-label");
    this.personEl = this.querySelector("#mc-person");
    this.captionEl = this.querySelector("#mc-caption");
    this.identEl = this.querySelector("#mc-ident");
    this.stampEl = this.querySelector("#mc-stamp");
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    document.addEventListener(RADIO_TRACK, (e) => {
      this.onTrack((e as CustomEvent<TrackInfo>).detail);
    });
  }

  private onTrack(info: TrackInfo): void {
    if (info.entry.type === "interlude") {
      this.renderIdent();
      return;
    }
    const line: MemoryLine = memoryFor(info.entry, {
      programTitle: info.programTitle,
      venue: info.venue,
      date: info.date,
    });
    this.renderLine(info.entry, line);
  }

  private renderIdent(): void {
    if (!this.typeLabel || !this.personEl || !this.captionEl || !this.identEl || !this.stampEl) return;
    this.typeLabel.textContent = "IDENT";
    this.personEl.style.visibility = "hidden";
    this.stampEl.style.visibility = "hidden";
    this.captionEl.style.visibility = "hidden";
    this.identEl.style.visibility = "visible";
    this.identEl.setAttribute("aria-hidden", "false");
  }

  private renderLine(entry: ProgramEntry, line: MemoryLine): void {
    if (!this.typeLabel || !this.personEl || !this.captionEl || !this.identEl || !this.stampEl) return;

    const isId = entry.type === "id";
    this.typeLabel.textContent = isId ? "UNRELEASED" : "MEMORY";
    this.identEl.style.visibility = "hidden";
    this.identEl.setAttribute("aria-hidden", "true");

    const person = isId ? undefined : line.person;
    if (person) {
      this.personEl.textContent = person;
      this.personEl.style.visibility = "visible";
    } else {
      this.personEl.style.visibility = "hidden";
    }

    const stamp = isId ? dateStamp(entry.album) : line.stamp;
    if (stamp) {
      this.stampEl.textContent = stamp;
      this.stampEl.style.visibility = "visible";
    } else {
      this.stampEl.style.visibility = "hidden";
    }

    const text = isId ? (entry.title ?? "") : line.text;
    const generated = isId ? false : line.generated;

    if (this.reduced) {
      this.captionEl.textContent = text;
      this.captionEl.classList.toggle("mc-generated", generated);
      this.captionEl.style.visibility = "visible";
    } else {
      this.captionEl.style.opacity = "0";
      window.setTimeout(() => {
        this.captionEl?.classList.remove("mc-generated");
        if (generated) this.captionEl?.classList.add("mc-generated");
        if (this.captionEl) {
          this.captionEl.textContent = text;
          this.captionEl.style.visibility = "visible";
          this.captionEl.style.opacity = "1";
        }
      }, 200);
    }
  }
}

if (!customElements.get("memory-card")) customElements.define("memory-card", MemoryCard);
