// Audio player for Rory: plays pre-rendered ElevenLabs voice clips or falls back to Web Speech API.

export interface AudioPlayOptions {
  volume?: number;
  onProgress?: (currentTime: number, duration: number) => void;
}

export class JockeyAudio {
  private currentAudio: HTMLAudioElement | null = null;
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

  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if (this.synth && this.synth.speaking) {
      this.synth.cancel();
    }
  }

  private playFile(url: string, options: AudioPlayOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      this.currentAudio = audio;
      audio.volume = options.volume ?? 1.0;

      const timer = setInterval(() => {
        if (!audio.paused && audio.duration) {
          options.onProgress?.(audio.currentTime, audio.duration);
        }
      }, 100);

      const cleanup = () => {
        clearInterval(timer);
        this.currentAudio = null;
      };

      audio.onended = () => {
        cleanup();
        resolve();
      };

      audio.onerror = (e) => {
        cleanup();
        reject(e);
      };

      audio.play().catch((err) => {
        cleanup();
        reject(err);
      });
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

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      this.synth.speak(utterance);
    });
  }
}
