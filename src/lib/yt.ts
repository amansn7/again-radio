interface YTPlayerVars {
  enablejsapi?: number;
  controls?: number;
  modestbranding?: number;
  rel?: number;
  playsinline?: number;
  autoplay?: number;
  mute?: number;
  cc_load_policy?: number;
  iv_load_policy?: number;
  disablekb?: number;
  origin?: string;
  start?: number;
}

interface YTPlayerOptions {
  videoId: string;
  playerVars?: YTPlayerVars;
  events?: {
    onReady?: (event: { target: YTPlayer }) => void;
    onStateChange?: (event: { data: number }) => void;
    onError?: (event: { data: number }) => void;
  };
}

export interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setVolume?(volume: number): void;
  loadVideoById(args: { videoId: string; startSeconds?: number }): void;
  destroy(): void;
  unloadModule?(name: string): void;
}

interface YTNamespace {
  Player: new (el: HTMLElement | string, opts: YTPlayerOptions) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT: YTNamespace;
    onYouTubeIframeAPIReady: () => void;
  }
}

let ytPromise: Promise<YTNamespace> | null = null;

export function loadYT(): Promise<YTNamespace> {
  if (ytPromise) return ytPromise;
  ytPromise = new Promise<YTNamespace>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("loadYT called outside browser"));
      return;
    }
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => reject(new Error("YouTube IFrame API failed to load"));
    document.head.appendChild(script);
  });
  return ytPromise;
}
