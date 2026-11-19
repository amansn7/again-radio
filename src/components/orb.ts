import { RADIO_TRACK, RADIO_JOCKEY_SPEAK, RADIO_JOCKEY_END } from "../lib/events.ts";
import type { TrackInfo } from "../lib/events.ts";
import { onPulse } from "../lib/pulse.ts";
import { artComplements, videoComplements } from "./orb-colour.ts";

const ATTACK = 0.7;
const RELEASE = 0.07;
const orbs = new Set<RadioOrb>();
let pulsing = false;

const ease = (cur: number, to: number) => cur + (to - cur) * (to > cur ? ATTACK : RELEASE);

function startPulse() {
  if (pulsing) return;
  pulsing = true;
  onPulse((b) => orbs.forEach((o) => o.beat(b.kick * b.env, b.hat * b.env, b.swell, b.env)));
}

class RadioOrb extends HTMLElement {
  private kick = 0;
  private hat = 0;
  private speed = 0.5;
  private spin: Animation | undefined;
  private vid = "";

  connectedCallback() {
    this.paint(artComplements());
    orbs.add(this);
    startPulse();
    document.addEventListener(RADIO_TRACK, this.onTrack);
    document.addEventListener(RADIO_JOCKEY_SPEAK, this.onJockeySpeak);
    document.addEventListener(RADIO_JOCKEY_END, this.onJockeyEnd);
  }

  disconnectedCallback() {
    orbs.delete(this);
    document.removeEventListener(RADIO_TRACK, this.onTrack);
    document.removeEventListener(RADIO_JOCKEY_SPEAK, this.onJockeySpeak);
    document.removeEventListener(RADIO_JOCKEY_END, this.onJockeyEnd);
  }

  private onJockeySpeak = () => {
    this.dataset.voice = "true";
  };

  private onJockeyEnd = () => {
    delete this.dataset.voice;
  };

  private onTrack = (e: Event) => {
    const id = (e as CustomEvent<TrackInfo>).detail.youtubeId;
    if (!id || id === this.vid) return;
    this.vid = id;
    videoComplements(id).then((c) => this.vid === id && this.paint(c ?? artComplements()));
  };

  private paint(colours: string[]) {
    colours.forEach((c, i) => this.style.setProperty(`--orb-c${i + 1}`, c));
  }

  beat(kick: number, hat: number, swell: number, env: number) {
    this.kick = ease(this.kick, kick);
    this.hat = ease(this.hat, hat);
    const s = this.style;
    s.setProperty("--orb-kick", this.kick.toFixed(3));
    s.setProperty("--orb-hat", this.hat.toFixed(3));
    s.setProperty("--orb-swell", swell.toFixed(3));
    this.spin ??= this.querySelector(".o-mesh")?.getAnimations()[0];
    if (this.spin) {
      this.speed += (0.5 + env * (0.4 + swell * 1.6) - this.speed) * 0.05;
      this.spin.playbackRate = this.speed;
    }
  }
}

if (!customElements.get("radio-orb")) customElements.define("radio-orb", RadioOrb);
