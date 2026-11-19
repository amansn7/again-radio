// Audio player for Rory: plays pre-rendered ElevenLabs voice clips or falls back to Web Speech API.

const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export interface AudioPlayOptions {
  volume?: number;
  onProgress?: (currentTime: number, duration: number) => void;
}

export class JockeyAudio {
  private el: HTMLAudioElement | null = null;
  private settle: (() => void) | null = null;
  private synth: SpeechSynthesis | null = null;
  private britishVoice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  private loadVoices(): void {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    this.britishVoice =
      voices.find(
        (v) =>
          v.lang.startsWith("en-GB") &&
          /female|natural|serena|stephanie|fiona|martha/i.test(v.name)
      ) ||
      voices.find((v) => v.lang.startsWith("en-GB")) ||
      voices.find((v) => v.lang.startsWith("en")) ||
      null;
  }

  /** Plays an audio clip by URL, or speaks text via Web Speech API if audio is missing */
  async play(
    audioUrl: string | undefined,
    text: string,
    options: AudioPlayOptions = {}
  ): Promise<void> {
    this.stop();

    if (audioUrl) {
      try {
        await this.playFile(audioUrl, options);
        return;
      } catch (err) {
        console.warn("[jockey-audio] audio playback error, attempting speech fallback", err);
      }
    }

    if (text) {
      await this.speakText(text, options);
    }
  }

  /** Call synchronously inside the tune-in tap so iOS lets later clips play. */
  unlock(): void {
    if (typeof Audio === "undefined" || this.settle) return;
    const audio = this.element();
    audio.muted = true;
    audio.src = SILENT_WAV;
    audio.play().then(() => this.settle || audio.pause(), () => {});
  }

  stop(): void {
    this.settle?.();
    if (this.el && !this.el.paused) this.el.pause();
    if (this.synth && this.synth.speaking) {
      this.synth.cancel();
    }
  }

  private element(): HTMLAudioElement {
    return (this.el ??= new Audio());
  }

  private playFile(url: string, options: AudioPlayOptions): Promise<void> {
    const audio = this.element();
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setInterval(() => {
        if (!audio.paused && audio.duration) {
          options.onProgress?.(audio.currentTime, audio.duration);
        }
      }, 100);
      const finish = (fail: boolean, err?: unknown) => {
        if (done) return;
        done = true;
        clearInterval(timer);
        audio.onended = audio.onerror = null;
        this.settle = null;
        if (fail) reject(err);
        else resolve();
      };
      this.settle = () => finish(false);
      audio.onended = () => finish(false);
      audio.onerror = (e) => finish(true, e);
      audio.muted = false;
      audio.volume = options.volume ?? 1.0;
      audio.src = url;
      audio.play().catch((err) => finish(true, err));
    });
  }

  private speakText(text: string, options: AudioPlayOptions): Promise<void> {
    return new Promise((resolve) => {
      if (!this.synth) {
        resolve();
        return;
      }
      this.synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      if (this.britishVoice) utterance.voice = this.britishVoice;
      utterance.rate = 1.02;
      utterance.pitch = 1.0;
      utterance.volume = options.volume ?? 1.0;

      const finish = () => {
        utterance.onend = utterance.onerror = null;
        if (this.settle === finish) this.settle = null;
        resolve();
      };
      this.settle = finish;
      utterance.onend = finish;
      utterance.onerror = finish;

      this.synth.speak(utterance);
    });
  }
}
