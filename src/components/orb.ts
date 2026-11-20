import { RADIO_TRACK, RADIO_JOCKEY_SPEAK, RADIO_JOCKEY_END } from "../lib/events.ts";
import type { TrackInfo } from "../lib/events.ts";
import { onPulse } from "../lib/pulse.ts";
import { artComplements, videoComplements } from "./orb-colour.ts";
import { createWaveRenderer, type WaveRenderer } from "./orb-wave.ts";

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

export type OrbState = "idle" | "morph-to-speech" | "speech" | "morph-to-orb";

class RadioOrb extends HTMLElement {
  private kick = 0;
  private hat = 0;
  private speed = 0.5;
  private spin: Animation | undefined;
  private vid = "";
  private wave: WaveRenderer | null = null;
  private state: OrbState = "idle";
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;

  connectedCallback() {
    this.dataset.state = "idle";
    this.paint(artComplements());
    const canvas = this.querySelector<HTMLCanvasElement>(".o-wave");
    if (canvas) {
      this.wave = createWaveRenderer(canvas);
      this.updateAccentFromTheme();
    }
    orbs.add(this);
    startPulse();
    document.addEventListener(RADIO_TRACK, this.onTrack);
    document.addEventListener(RADIO_JOCKEY_SPEAK, this.onJockeySpeak);
    document.addEventListener(RADIO_JOCKEY_END, this.onJockeyEnd);
  }

  disconnectedCallback() {
    orbs.delete(this);
    if (this.transitionTimer) clearTimeout(this.transitionTimer);
    this.wave?.destroy();
    this.wave = null;
    document.removeEventListener(RADIO_TRACK, this.onTrack);
    document.removeEventListener(RADIO_JOCKEY_SPEAK, this.onJockeySpeak);
    document.removeEventListener(RADIO_JOCKEY_END, this.onJockeyEnd);
  }

  private updateAccentFromTheme() {
    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue("--accent").trim();
    if (accent.startsWith("#")) {
      const hex = accent.replace("#", "");
      const num = parseInt(hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex, 16);
      this.wave?.setAccent(((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
    }
  }

  private onJockeySpeak = (e: Event) => {
    const detail = (e as CustomEvent<{ text: string; isTuneIn?: boolean }>).detail;
    if (detail?.isTuneIn || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    this.transitionTo("morph-to-speech");
  };

  private onJockeyEnd = () => {
    this.transitionTo("morph-to-orb");
  };

  private transitionTo(next: OrbState) {
    if (this.state === next) return;
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }

    if (next === "morph-to-speech") {
      this.state = "morph-to-speech";
      this.dataset.state = "morph-to-speech";
      this.dataset.wave = "true";
      this.wave?.morphTo(1.0, 600, () => {
        if (this.state === "morph-to-speech") {
          this.state = "speech";
          this.dataset.state = "speech";
        }
      });
      this.transitionTimer = setTimeout(() => {
        if (this.state === "morph-to-speech") {
          this.state = "speech";
          this.dataset.state = "speech";
        }
      }, 620);
    } else if (next === "morph-to-orb") {
      this.state = "morph-to-orb";
      this.dataset.state = "morph-to-orb";
      this.wave?.morphTo(0.0, 520, () => {
        if (this.state === "morph-to-orb") {
          this.state = "idle";
          this.dataset.state = "idle";
          delete this.dataset.wave;
        }
      });
      this.transitionTimer = setTimeout(() => {
        if (this.state === "morph-to-orb") {
          this.state = "idle";
          this.dataset.state = "idle";
          delete this.dataset.wave;
        }
      }, 540);
    }
  }

  private onTrack = (e: Event) => {
    const id = (e as CustomEvent<TrackInfo>).detail.youtubeId;
    if (!id || id === this.vid) return;
    this.vid = id;
    videoComplements(id).then((c) => this.vid === id && this.paint(c ?? artComplements()));
  };

  private paint(colours: string[]) {
    colours.forEach((c, i) => this.style.setProperty(`--orb-c${i + 1}`, c));
    this.updateAccentFromTheme();
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
    if (this.state === "speech" || this.state === "morph-to-speech") {
      this.wave?.setVoiceIntensity(this.kick * 0.65 + swell * 0.35);
    }
  }
}

if (!customElements.get("radio-orb")) customElements.define("radio-orb", RadioOrb);
