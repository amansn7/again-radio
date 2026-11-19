import {
  RADIO_JOCKEY,
  RADIO_JOCKEY_SPEAK,
  RADIO_JOCKEY_END,
  type JockeyStateDetail,
  type TrackInfo
} from "./events.ts";
import { JockeyDucker } from "./jockey-ducker.ts";
import { JockeyAudio } from "./jockey-audio.ts";

export interface JockeyClip {
  id: string;
  audio?: string;
  text: string;
}

export interface TrackJockeyConfig {
  postSeconds?: number;
  intro?: JockeyClip;
  outro?: JockeyClip;
}

export interface FactItem {
  id: string;
  audio?: string;
  topic: string;
  text: string;
  source: string;
}

export interface JockeyData {
  station: {
    name: string;
    jockey: string;
    gender: string;
    voiceId: string;
    duckVolume: number;
    duckFadeMs: number;
    unduckFadeMs: number;
  };
  sweepers: JockeyClip[];
  tracks: Record<string, TrackJockeyConfig>;
  transitions: Record<string, JockeyClip>;
  facts: FactItem[];
}

let cachedData: JockeyData | null = null;

export async function loadJockeyData(): Promise<JockeyData> {
  if (cachedData) return cachedData;
  const res = await fetch("/data/jockey.json");
  if (!res.ok) throw new Error(`Failed to load jockey data: ${res.status}`);
  cachedData = (await res.json()) as JockeyData;
  return cachedData;
}

export class RadioJockey {
  private data: JockeyData | null = null;
  private ducker = new JockeyDucker();
  private audio = new JockeyAudio();
  private _enabled = true;
  private _speaking = false;
  private _currentText = "";
  private lastSpokeTime = 0;
  private spokeForTrack = new Set<string>();
  private lastProgram = "";
  private hasWelcomed = false;

  constructor(
    private getVolume: () => number,
    private setVolume: (v: number) => void,
    private isMuted: () => boolean
  ) {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("again-radio:jockey");
      if (stored !== null) this._enabled = stored === "true";
    }
    loadJockeyData().then((d) => (this.data = d)).catch((err) => {
      console.warn("[jockey] Could not load data:", err);
    });
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(val: boolean) {
    this._enabled = val;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("again-radio:jockey", String(val));
    }
    if (!val && this._speaking) {
      this.stop();
    }
    this.emitState();
  }

  get speaking(): boolean {
    return this._speaking;
  }

  get currentText(): string {
    return this._currentText;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  emitState(): void {
    if (typeof document === "undefined") return;
    const detail: JockeyStateDetail = {
      enabled: this._enabled,
      speaking: this._speaking,
      text: this._currentText,
      jockeyName: this.data?.station.jockey ?? "Rory"
    };
    document.dispatchEvent(new CustomEvent(RADIO_JOCKEY, { detail }));
  }

  async onTuneIn(): Promise<void> {
    if (!this._enabled || this.hasWelcomed || this.isMuted()) return;
    this.hasWelcomed = true;
    if (!this.data) this.data = await loadJockeyData().catch(() => null);
    if (!this.data) return;

    const welcome = this.data.sweepers.find((s) => s.id === "welcome");
    if (welcome) {
      await this.speak(welcome.text, welcome.audio);
    }
  }

  async onTrack(info: TrackInfo): Promise<void> {
    if (!this._enabled || this.isMuted()) return;
    if (!this.data) this.data = await loadJockeyData().catch(() => null);
    if (!this.data) return;

    const trackKey = `${info.programId}:${info.entry.title}`;
    if (this.spokeForTrack.has(trackKey)) return;

    // Check for set/program transition first
    if (this.lastProgram && this.lastProgram !== info.programId) {
      this.lastProgram = info.programId;
      const trans = this.data.transitions[info.programId];
      if (trans) {
        this.spokeForTrack.add(trackKey);
        await this.speak(trans.text, trans.audio);
        return;
      }
    }
    this.lastProgram = info.programId;

    // Check cooldown: avoid talking every 30 seconds if songs are short
    const now = Date.now();
    const cooldownMs = 90_000; // minimum 90 seconds between non-explicit speeches
    if (now - this.lastSpokeTime < cooldownMs) return;

    // Check if this track has a registered intro
    const trackConfig = this.data.tracks[info.entry.title];
    if (trackConfig?.intro) {
      this.spokeForTrack.add(trackKey);
      await this.speak(trackConfig.intro.text, trackConfig.intro.audio);
      return;
    }

    // Occasional trivia/fact (every ~4-5 minutes)
    if (now - this.lastSpokeTime > 240_000 && this.data.facts.length > 0) {
      const fact = this.data.facts[Math.floor(Math.random() * this.data.facts.length)];
      if (fact) {
        this.spokeForTrack.add(trackKey);
        await this.speak(fact.text, fact.audio);
      }
    }
  }

  /** Triggered when user asks Rory to talk about the current track */
  async askCurrent(info: TrackInfo): Promise<void> {
    if (this.isMuted()) return;
    if (!this.data) this.data = await loadJockeyData().catch(() => null);
    if (!this.data) return;

    const trackConfig = this.data.tracks[info.entry.title];
    if (trackConfig?.intro) {
      await this.speak(trackConfig.intro.text, trackConfig.intro.audio);
      return;
    }

    // Pick a related fact or a random fact about Fred
    const fact = this.data.facts[Math.floor(Math.random() * this.data.facts.length)];
    if (fact) {
      await this.speak(fact.text, fact.audio);
      return;
    }

    // Fallback station shout
    const shout = this.data.sweepers[Math.floor(Math.random() * this.data.sweepers.length)];
    if (shout) {
      await this.speak(shout.text, shout.audio);
    }
  }

  async speak(text: string, audioUrl?: string): Promise<void> {
    if (this._speaking) {
      this.stop();
    }
    this._speaking = true;
    this._currentText = text;
    this.lastSpokeTime = Date.now();
    this.emitState();

    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent(RADIO_JOCKEY_SPEAK, { detail: { text, audioUrl } }));
    }

    const currentVol = this.getVolume();
    const duckVol = this.data?.station.duckVolume ?? 22;
    const duckFadeMs = this.data?.station.duckFadeMs ?? 250;
    const unduckFadeMs = this.data?.station.unduckFadeMs ?? 400;

    try {
      // 1. Duck YouTube volume
      await this.ducker.duck(this.setVolume, currentVol, duckVol, duckFadeMs);

      // 2. Play Rory's voice
      await this.audio.play(audioUrl, text);
    } catch (err) {
      console.warn("[jockey] Speech error:", err);
    } finally {
      // 3. Swell YouTube volume back up
      await this.ducker.unduck(this.setVolume, duckVol, currentVol, unduckFadeMs);
      this._speaking = false;
      this._currentText = "";
      this.emitState();

      if (typeof document !== "undefined") {
        document.dispatchEvent(new CustomEvent(RADIO_JOCKEY_END));
      }
    }
  }

  stop(): void {
    this.audio.stop();
    this.ducker.cancel();
    if (this._speaking) {
      this._speaking = false;
      this._currentText = "";
      this.setVolume(this.getVolume());
      this.emitState();
      if (typeof document !== "undefined") {
        document.dispatchEvent(new CustomEvent(RADIO_JOCKEY_END));
      }
    }
  }
}
