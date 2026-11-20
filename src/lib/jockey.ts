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
import { introFits, outroLeadSeconds } from "./jockey-timing.ts";
import type { JockeyDelivery } from "./jockey-voice.ts";

const LAST_WELCOME_KEY = "again-radio:last-welcome";

export interface JockeyClip {
  id: string;
  audio?: string;
  text: string;
  synthesisText?: string;
  delivery?: JockeyDelivery;
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
  outro?: JockeyClip & { durationSeconds?: number };
}

export interface FactItem extends JockeyClip {
  topic: string;
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
  private lastFactId = "";
  private currentTrack: TrackInfo | null = null;
  private currentTrackAt = 0;
  private welcomePending = false;

  constructor(
    private duckTo: (pct: number) => void,
    private isMuted: () => boolean,
    private isPlaying: () => boolean
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
    try { localStorage.setItem("again-radio:jockey", String(val)); } catch {}
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

  /** Rory only talks over sound the listener can already hear. */
  private ready(): boolean {
    return this.isPlaying();
  }

  /** YouTube reports PLAYING: pick up whatever waited for the sound. */
  onPlaying(): void {
    // The track clock did not run while the video was loading.
    this.currentTrackAt = Date.now();
    if (this._speaking) return;
    if (this.welcomePending) void this.welcome();
    else {
      const live = this.liveTrack();
      if (live) void this.onTrack(live);
    }
  }

  async onTuneIn(): Promise<void> {
    if (!this._enabled || this.hasWelcomed || this.isMuted() || this._speaking) return;
    this.audio.unlock();
    this.hasWelcomed = true;
    this.welcomePending = true;
    if (this.ready()) await this.welcome();
  }

  private async welcome(): Promise<void> {
    this.welcomePending = false;
    if (!this.data) this.data = await loadJockeyData().catch(() => null);
    if (!this.data) return;

    const welcome = this.pickWelcome();
    if (welcome) {
      await this.speak(welcome.text, welcome.audio, { isTuneIn: true, delivery: welcome.delivery });
    } else {
      const live = this.liveTrack();
      if (live) await this.onTrack(live);
    }
  }

  private setCurrent(info: TrackInfo): void {
    this.currentTrack = info;
    this.currentTrackAt = Date.now();
  }

  /** The current track with elapsed advanced to now: ticks stop while the tab is hidden. */
  private liveTrack(): TrackInfo | null {
    const t = this.currentTrack;
    return t && { ...t, elapsed: t.elapsed + (Date.now() - this.currentTrackAt) / 1000 };
  }

  async onTrack(info: TrackInfo): Promise<void> {
    this.setCurrent(info);
    if (!this._enabled || this._speaking || this.isMuted() || !this.ready()) return;
    if (!this.data) this.data = await loadJockeyData().catch(() => null);
    if (!this.data) return;

    const trackKey = `${info.programId}:${info.entry.title}`;
    if (this.spokeIntro.has(trackKey)) return;

    // Check for set/program transition first
    if (this.lastProgram && this.lastProgram !== info.programId) {
      this.lastProgram = info.programId;
      const trans = this.data.transitions[info.programId];
      if (trans && introFits(info.elapsed, trans, this.data.tracks[info.entry.title ?? ""]?.postSeconds)) {
        this.spokeIntro.add(trackKey);
        await this.speak(trans.text, trans.audio, { delivery: trans.delivery });
        return;
      }
    }
    this.lastProgram = info.programId;

    // Intros are the core of the show, so they skip the chatter cooldown, but only if they end before the vocals.
    const trackConfig = this.data.tracks[info.entry.title ?? ""];
    if (trackConfig?.intro) {
      this.spokeIntro.add(trackKey);
      if (introFits(info.elapsed, trackConfig.intro, trackConfig.postSeconds)) {
        await this.speak(trackConfig.intro.text, trackConfig.intro.audio, { delivery: trackConfig.intro.delivery });
      }
      return;
    }

    const now = Date.now();
    if (now - this.lastSpokeTime < 80_000) return;

    // Periodic listener mentions fill a gap only when there is no track intro.
    if (now - this.lastListenerAnnounce > 260_000 && this.data.listeners?.length) {
      this.lastListenerAnnounce = now;
      this.spokeIntro.add(trackKey);
      await this.announceListeners();
      return;
    }

    // Occasional trivia/fact (every ~4-5 minutes)
    if (now - this.lastSpokeTime > 240_000 && this.data.facts.length > 0) {
      const fresh = this.data.facts.filter((f) => f.id !== this.lastFactId);
      const pool = fresh.length ? fresh : this.data.facts;
      const fact = pool[Math.floor(Math.random() * pool.length)];
      if (fact) {
        this.lastFactId = fact.id;
        this.spokeIntro.add(trackKey);
        await this.speak(fact.text, fact.audio, { delivery: fact.delivery });
      }
    }
  }

  /** Mid-song thought triggered at the designated reflection point of the track */
  async onTime(timeInfo: TimeInfo, info: TrackInfo): Promise<void> {
    const elapsed = Math.max(0, timeInfo.current - info.entry.offset);
    this.setCurrent({ ...info, elapsed, progress: info.entry.duration ? elapsed / info.entry.duration : 0 });
    if (!this._enabled || this._speaking || this.isMuted() || !this.ready()) return;
    if (!this.data) return;

    const trackConfig = this.data.tracks[info.entry.title ?? ""];
    const trackKey = `${info.programId}:${info.entry.title}`;
    if (trackConfig?.thought && trackConfig.thoughtOffset !== undefined && !this.spokeThought.has(trackKey) &&
        elapsed >= trackConfig.thoughtOffset && elapsed < trackConfig.thoughtOffset + 3.5) {
      const now = Date.now();
      if (now - this.lastSpokeTime >= 45_000) {
        this.spokeThought.add(trackKey);
        await this.speak(trackConfig.thought.text, trackConfig.thought.audio, { delivery: trackConfig.thought.delivery });
      }
    }

    const endKey = `${info.programId}:${info.entry.title}`;
    const outroWindow = trackConfig?.outro
      ? outroLeadSeconds(trackConfig.outro.text, trackConfig.outro.durationSeconds)
      : 0;
    if (!this._speaking && trackConfig?.outro && !this.spokeOutro.has(endKey) &&
        info.entry.duration - elapsed <= outroWindow && info.entry.duration - elapsed >= 0) {
      this.spokeOutro.add(endKey);
      await this.speak(trackConfig.outro.text, trackConfig.outro.audio, { delivery: trackConfig.outro.delivery });
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
      await this.speak(chosen.text, chosen.audio, { delivery: chosen.delivery });
    }
  }

  async speak(text: string, audioUrl?: string, options: { isTuneIn?: boolean; delivery?: JockeyDelivery } = {}): Promise<void> {
    if (this._speaking) return;
    this._speaking = true;
    const token = ++this.speakToken;
    this._currentText = text;
    this.lastSpokeTime = Date.now();
    this.emitState();

    if (typeof document !== "undefined") {
      document.dispatchEvent(
        new CustomEvent(RADIO_JOCKEY_SPEAK, {
          detail: { text, audioUrl, isTuneIn: Boolean(options.isTuneIn), delivery: options.delivery }
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
      if (token === this.speakToken) await this.audio.play(audioUrl, text, { delivery: options.delivery });
    } catch (err) {
      console.warn("[jockey] Speech error:", err);
    } finally {
      // stop() already restored volume and state; a newer clip may own them now.
      if (token !== this.speakToken) return;
      // 3. Swell YouTube volume back up
      await this.ducker.unduck(this.duckTo, duckVol, 100, unduckFadeMs);
      if (token === this.speakToken) {
        this._speaking = false;
        this._currentText = "";
        this.emitState();
        if (typeof document !== "undefined") {
          document.dispatchEvent(new CustomEvent(RADIO_JOCKEY_END));
        }
        // A track that started while Rory talked still gets its intro if it fits before the vocals.
        const live = this.liveTrack();
        if (live) void this.onTrack(live);
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
