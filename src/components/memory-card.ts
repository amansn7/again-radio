import { RADIO_TRACK } from "../lib/events.ts";
import type { TrackInfo } from "../lib/events.ts";
import { memoryFor } from "../lib/memories.ts";

function lineFor(info: TrackInfo): { text: string; generated: boolean } {
  const { entry } = info;
  if (entry.type === "interlude") return { text: "The station, between songs.", generated: true };
  if (entry.type === "id") {
    return { text: "A track with no title yet. If you know what it is, you know more than the archive does.", generated: true };
  }
  const m = memoryFor(entry, { programTitle: info.programTitle, venue: info.venue, date: info.date });
  return { text: m.text, generated: m.generated };
}

class MemoryCardElement extends HTMLElement {
  private text!: HTMLElement;

  connectedCallback() {
    this.text = this.querySelector<HTMLElement>(".mc-text")!;
    document.addEventListener(RADIO_TRACK, (e) => this.onTrack((e as CustomEvent<TrackInfo>).detail));
  }

  private onTrack(info: TrackInfo) {
    const { text, generated } = lineFor(info);
    this.text.classList.toggle("is-generated", generated);
    this.text.replaceChildren();
    text.split(/\s+/).filter(Boolean).forEach((word, i) => {
      if (i) this.text.append(" ");
      const w = document.createElement("span");
      w.className = "mw";
      w.style.setProperty("--i", String(i));
      w.textContent = word;
      this.text.append(w);
    });
    this.dataset.ready = "";
  }
}

if (!customElements.get("memory-card")) customElements.define("memory-card", MemoryCardElement);
