import {
  RADIO_JOCKEY,
  RADIO_JOCKEY_SPEAK,
  RADIO_JOCKEY_END,
  type JockeyStateDetail,
  type TrackInfo,
  type TimeInfo
} from "./events.ts";
import { JockeyDucker } from "./jockey-ducker.ts";
import { JockeyAudio } from "./jockey-audio.ts";
import { pickWelcome } from "./welcome.ts";

const LAST_WELCOME_KEY = "again-radio:last-welcome";

export interface JockeyClip {
  id: string;
  audio?: string;
  text: string;
}

export interface ListenerClip extends JockeyClip {
  min?: number;
  max?: number;
}

export interface WelcomeClip extends JockeyClip {
  mood?: string;
  hours?: number[];
}

export interface TrackJockeyConfig {
  postSeconds?: number;
  thoughtOffset?: number;
  intro?: JockeyClip;
  thought?: JockeyClip;
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
  welcomes?: WelcomeClip[];
  sweepers: JockeyClip[];
  listeners?: ListenerClip[];
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
  private speakToken = 0;
  private _currentText = "";
  private lastSpokeTime = 0;
  private spokeIntro = new Set<string>();
  private spokeThought = new Set<string>();
  private spokeOutro = new Set<string>();
  private lastProgram = "";
  private hasWelcomed = false;
  private currentListenerCount: number | null = null;
  private lastListenerAnnounce = 0;

  constructor(
    private duckTo: (pct: number) => void,
    private isMuted: () => boolean
  ) {
    try { this._enabled = localStorage.getItem("again-radio:jockey") !== "false"; } catch {}
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

  setListenerCount(count: number | null): void {
    this.currentListenerCount = count;
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

  private pickWelcome(): WelcomeClip | undefined {
    if (!this.data) return undefined;
    const pool = this.data.welcomes?.length
      ? this.data.welcomes
      : this.data.sweepers.filter((s) => s.id === "welcome");
    let last = "";
    try { last = localStorage.getItem(LAST_WELCOME_KEY) ?? ""; } catch {}
    const chosen = pickWelcome(pool, new Date().getHours(), last);
    try { if (chosen) localStorage.setItem(LAST_WELCOME_KEY, chosen.id); } catch {}
    return chosen;
  }

  async onTuneIn(): Promise<void> {
    if (!this._enabled || this.hasWelcomed || this.isMuted() || this._speaking) return;
    this.audio.unlock();
    this.hasWelcomed = true;
    if (!this.data) this.data = await loadJockeyData().catch(() => null);
    if (!this.data) return;

    const welcome = this.pickWelcome();
    if (welcome) {
      await this.speak(welcome.text, welcome.audio, { isTuneIn: true });
    }
    const current = this.currentTrack;
    if (current && current.elapsed < 8) await this.onTrack(current);
  }

  private currentTrack: TrackInfo | null = null;

  async onTrack(info: TrackInfo): Promise<void> {
    this.currentTrack = info;
    if (!this._enabled || this._speaking || this.isMuted()) return;
    if (!this.data) this.data = await loadJockeyData().catch(() => null);
    if (!this.data) return;

    const trackKey = `${info.programId}:${info.entry.title}`;
    if (this.spokeIntro.has(trackKey)) return;

    // Check for set/program transition first
    if (this.lastProgram && this.lastProgram !== info.programId) {
      this.lastProgram = info.programId;
      const trans = this.data.transitions[info.programId];
      if (trans) {
        this.spokeIntro.add(trackKey);
        await this.speak(trans.text, trans.audio);
        return;
      }
    }
    this.lastProgram = info.programId;

    // Cooldown check
    const now = Date.now();
    const cooldownMs = 80_000;
    if (now - this.lastSpokeTime < cooldownMs) return;

    // Check if this track has an intro
    const trackConfig = this.data.tracks[info.entry.title];
    if (trackConfig?.intro) {
      this.spokeIntro.add(trackKey);
      if (info.elapsed <= 8) await this.speak(trackConfig.intro.text, trackConfig.intro.audio);
      return;
    }

    // Periodic listener mentions fill a gap only when there is no track intro.
    if (now - this.lastListenerAnnounce > 260_000 && this.data.listeners?.length) {
      this.lastListenerAnnounce = now;
      this.spokeIntro.add(trackKey);
      await this.announceListeners();
      return;
    }

    // Occasional trivia/fact (every ~4-5 minutes)
    if (now - this.lastSpokeTime > 240_000 && this.data.facts.length > 0) {
      const fact = this.data.facts[Math.floor(Math.random() * this.data.facts.length)];
      if (fact) {
        this.spokeIntro.add(trackKey);
        await this.speak(fact.text, fact.audio);
      }
    }
  }

  /** Mid-song thought triggered at the designated reflection point of the track */
  async onTime(timeInfo: TimeInfo, info: TrackInfo): Promise<void> {
    const elapsed = Math.max(0, timeInfo.current - info.entry.offset);
    this.currentTrack = { ...info, elapsed, progress: info.entry.duration ? elapsed / info.entry.duration : 0 };
    if (!this._enabled || this._speaking || this.isMuted()) return;
    if (!this.data) return;

    const trackConfig = this.data.tracks[info.entry.title];
    const trackKey = `${info.programId}:${info.entry.title}`;
    if (trackConfig?.thought && trackConfig.thoughtOffset !== undefined && !this.spokeThought.has(trackKey) &&
        elapsed >= trackConfig.thoughtOffset && elapsed < trackConfig.thoughtOffset + 3.5) {
      const now = Date.now();
      if (now - this.lastSpokeTime >= 45_000) {
        this.spokeThought.add(trackKey);
        await this.speak(trackConfig.thought.text, trackConfig.thought.audio);
      }
    }

    const endKey = `${info.programId}:${info.entry.title}`;
    const outroWindow = trackConfig?.outro ? Math.ceil(trackConfig.outro.text.length / 13) + 2 : 0;
    if (!this._speaking && trackConfig?.outro && !this.spokeOutro.has(endKey) &&
        info.entry.duration - elapsed <= outroWindow && info.entry.duration - elapsed >= 0) {
      this.spokeOutro.add(endKey);
      await this.speak(trackConfig.outro.text, trackConfig.outro.audio);
    }
  }

  /** Announces live listeners using the configured listener brackets */
  async announceListeners(): Promise<void> {
    if (!this.data?.listeners?.length) return;
    const count = this.currentListenerCount;

    let chosen: ListenerClip | undefined;
    if (count !== null) {
      chosen = this.data.listeners.find(
        (l) => l.min !== undefined && count >= l.min && count <= (l.max ?? 9999)
      );
    }

    chosen ??= this.data.listeners.find((l) => l.id === "listener-moment") ?? this.data.listeners[0];
    if (chosen) {
      await this.speak(chosen.text, chosen.audio);
    }
  }

  /** Triggered when user asks Rory to talk about the current track */
  async askCurrent(info: TrackInfo): Promise<void> {
    if (this.isMuted()) return;
    if (!this.data) this.data = await loadJockeyData().catch(() => null);
    if (!this.data) return;

    const trackConfig = this.data.tracks[info.entry.title];
    // If mid-song and thought exists, prioritize the intimate thought
    if (info.elapsed > 30 && trackConfig?.thought) {
      await this.speak(trackConfig.thought.text, trackConfig.thought.audio);
      return;
    }
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

  unlockAudio(): void {
    this.audio.unlock();
  }

  async speak(text: string, audioUrl?: string, options: { isTuneIn?: boolean } = {}): Promise<void> {
    if (this._speaking) return;
    this._speaking = true;
    const token = ++this.speakToken;
    this._currentText = text;
    this.lastSpokeTime = Date.now();
    this.emitState();

    if (typeof document !== "undefined") {
      document.dispatchEvent(
        new CustomEvent(RADIO_JOCKEY_SPEAK, {
          detail: { text, audioUrl, isTuneIn: Boolean(options.isTuneIn) }
        })
      );
    }

    const duckVol = this.data?.station.duckVolume ?? 22;
    const duckFadeMs = this.data?.station.duckFadeMs ?? 250;
    const unduckFadeMs = this.data?.station.unduckFadeMs ?? 400;

    try {
      // 1. Duck YouTube volume
      await this.ducker.duck(this.duckTo, 100, duckVol, duckFadeMs);

      // 2. Play Rory's voice
      if (token === this.speakToken) await this.audio.play(audioUrl, text);
    } catch (err) {
      console.warn("[jockey] Speech error:", err);
    } finally {
      // stop() already restored volume and state; a newer clip may own them now.
      if (token !== this.speakToken) return;
      // 3. Swell YouTube volume back up
      await this.ducker.unduck(this.duckTo, duckVol, 100, unduckFadeMs);
      this._speaking = false;
      this._currentText = "";
      this.emitState();

      if (typeof document !== "undefined") {
        document.dispatchEvent(new CustomEvent(RADIO_JOCKEY_END));
      }
    }
  }

  stop(): void {
    this.speakToken++;
    this.audio.stop();
    this.ducker.cancel();
    this.duckTo(100);
    if (this._speaking) {
      this._speaking = false;
      this._currentText = "";
      this.emitState();
      if (typeof document !== "undefined") {
        document.dispatchEvent(new CustomEvent(RADIO_JOCKEY_END));
      }
    }
  }
}
