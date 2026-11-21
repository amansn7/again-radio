import type { Program } from "./station.ts";
import { RADIO_LIVE_STREAM } from "./events.ts";

export type LiveStatusType = "offline" | "scheduled" | "live";

export interface LiveStreamEvent {
  status: LiveStatusType;
  channelId?: string;
  youtubeId?: string;
  title?: string;
  scheduledStartTime?: string;
  startTime?: number;
  thumbnail?: string;
  checkedAt?: string;
}

export const FRED_AGAIN_CHANNEL = "UCXF6DMVLIVRr2OQAqyfEGeg";

export function parseYouTubeLiveHtml(
  html: string,
  channelId: string = FRED_AGAIN_CHANNEL,
  nowSec: number = Math.floor(Date.now() / 1000),
): LiveStreamEvent {
  const canMatch = html.match(/<link rel="canonical" href="([^"]+)">/);
  const ogMatch = html.match(/<meta property="og:url" content="([^"]+)">/);
  const url = canMatch?.[1] ?? ogMatch?.[1] ?? "";

  const vMatch = url.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
  if (!vMatch) {
    return { status: "offline", channelId, checkedAt: new Date(nowSec * 1000).toISOString() };
  }
  const youtubeId = vMatch[1];

  let title = "Live Broadcast";
  const titleMeta = html.match(/<meta name="title" content="([^"]+)">/) ?? html.match(/<meta property="og:title" content="([^"]+)">/);
  if (titleMeta) title = titleMeta[1];

  let isLiveNow = false;
  let scheduledStart: string | undefined;
  let scheduledEnd: string | undefined;
  let isPostLiveDvr = false;
  let isArchived = false;

  const playerMatch = html.match(/var ytInitialPlayerResponse = ({.*?});(?:<\/script>|\n)/s);
  if (playerMatch) {
    try {
      const data = JSON.parse(playerMatch[1]) as Record<string, unknown>;
      const vd = (data.videoDetails ?? {}) as Record<string, unknown>;
      const mf = (data.microformat ?? {}) as Record<string, unknown>;
      const pmr = (mf.playerMicroformatRenderer ?? {}) as Record<string, unknown>;
      const lbd = (vd.liveBroadcastDetails ?? pmr.liveBroadcastDetails ?? {}) as Record<string, unknown>;

      if (typeof lbd.isLiveNow === "boolean") isLiveNow = lbd.isLiveNow;
      if (typeof lbd.startTimestamp === "string") scheduledStart = lbd.startTimestamp;
      if (typeof lbd.endTimestamp === "string") scheduledEnd = lbd.endTimestamp;
      if (typeof vd.title === "string" && vd.title.trim()) title = vd.title;
      if (typeof vd.isLive === "boolean") isLiveNow = vd.isLive;
      if (typeof vd.isPostLiveDvr === "boolean" && vd.isPostLiveDvr) isPostLiveDvr = true;
      if (typeof lbd.status === "string" && lbd.status === "ARCHIVED") isArchived = true;
    } catch {
      /* ignore malformed embedded JSON */
    }
  }

  if (!scheduledStart) {
    const startMatch = html.match(/"startTimestamp":\s*"([^"]+)"/);
    if (startMatch) scheduledStart = startMatch[1];
  }
  if (!scheduledEnd) {
    const endMatch = html.match(/"endTimestamp":\s*"([^"]+)"/);
    if (endMatch) scheduledEnd = endMatch[1];
  }
  if (!isLiveNow) {
    const liveNowMatch = html.match(/"isLiveNow":\s*(true|false)/);
    if (liveNowMatch) isLiveNow = liveNowMatch[1] === "true";
  }
  if (!isLiveNow && !scheduledStart) {
    const isLive = html.match(/"isLive":\s*(true|false)/);
    if (isLive && isLive[1] === "true") isLiveNow = true;
  }
  if (!isPostLiveDvr && /"isPostLiveDvr":\s*true/.test(html)) {
    isPostLiveDvr = true;
  }
  if (!isArchived && /"status":\s*"ARCHIVED"/.test(html)) {
    isArchived = true;
  }

  let startTime = scheduledStart ? Math.floor(Date.parse(scheduledStart) / 1000) : undefined;
  if (startTime !== undefined && Number.isNaN(startTime)) startTime = undefined;

  let endTime = scheduledEnd ? Math.floor(Date.parse(scheduledEnd) / 1000) : undefined;
  if (endTime !== undefined && Number.isNaN(endTime)) endTime = undefined;

  const MAX_START_LAG_SEC = 300;
  let status: LiveStatusType = "offline";
  if (scheduledEnd || isPostLiveDvr || isArchived || (endTime !== undefined && nowSec >= endTime)) {
    status = "offline";
  } else if (isLiveNow) {
    status = "live";
  } else if (startTime !== undefined && nowSec < startTime) {
    status = "scheduled";
  } else if (startTime !== undefined && nowSec >= startTime && !scheduledEnd) {
    if (nowSec - startTime < MAX_START_LAG_SEC) {
      status = "live";
    } else {
      status = "offline";
    }
  } else {
    status = "offline";
  }

  if (status === "offline") {
    return {
      status: "offline",
      channelId,
      checkedAt: new Date(nowSec * 1000).toISOString(),
    };
  }

  return {
    status,
    channelId,
    youtubeId,
    title,
    scheduledStartTime: scheduledStart,
    startTime,
    thumbnail: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    checkedAt: new Date(nowSec * 1000).toISOString(),
  };
}

export function isLiveNow(
  event: LiveStreamEvent | null | undefined,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!event || !event.youtubeId || event.status === "offline") return false;
  if (event.status === "live") return true;
  if (event.status === "scheduled" && event.startTime !== undefined) {
    const diff = nowSec - event.startTime;
    return diff >= 0 && diff < 300;
  }
  return false;
}

export function isScheduled(
  event: LiveStreamEvent | null | undefined,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!event || !event.youtubeId || event.status !== "scheduled") return false;
  return event.startTime !== undefined && nowSec < event.startTime;
}

export function countdownText(targetSec: number, nowSec: number = Math.floor(Date.now() / 1000)): string {
  const diff = Math.max(0, targetSec - nowSec);
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function liveStreamProgram(stream: LiveStreamEvent): Program {
  const youtubeId = stream.youtubeId ?? "c0-hvjV2A5Y";
  const title = stream.title ?? "Fred again.. Live";
  const art = stream.thumbnail ?? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  return {
    id: `live-${youtubeId}`,
    title,
    venue: "YouTube Live",
    date: stream.scheduledStartTime?.slice(0, 10),
    youtubeId,
    duration: 86400 * 7,
    source: "Official YouTube Live Broadcast",
    entries: [
      {
        offset: 0,
        duration: 86400 * 7,
        type: "track",
        title,
        artist: "Fred again..",
        art,
        bpm: 128,
        memory: "Live broadcast from Fred again.. official YouTube channel.",
      },
    ],
  };
}

export async function fetchLiveStream(): Promise<LiveStreamEvent> {
  const isBrowser = typeof location !== "undefined";
  const local = isBrowser && (location.hostname === "127.0.0.1" || location.hostname === "localhost");
  const remoteUrl = "https://again-radio-presence.again-radio-listeners.workers.dev/live-stream";
  const urls = local ? ["/live-stream", "/data/live-stream.json"] : [remoteUrl, "/data/live-stream.json"];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const raw = (await res.json()) as LiveStreamEvent;
        if (raw && (raw.status === "offline" || raw.status === "scheduled" || raw.status === "live")) {
          return raw;
        }
      }
    } catch {
      /* continue to fallback url */
    }
  }

  return { status: "offline", channelId: FRED_AGAIN_CHANNEL };
}

export function watchLiveStream(cb: (event: LiveStreamEvent) => void, intervalMs: number = 30_000): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function check() {
    if (stopped) return;
    const event = await fetchLiveStream();
    if (stopped) return;
    cb(event);
    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent(RADIO_LIVE_STREAM, { detail: event }));
    }
  }

  void check();
  timer = setInterval(() => void check(), intervalMs);

  const onWake = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") void check();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
  }

  return () => {
    stopped = true;
    if (timer !== null) clearInterval(timer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
    }
  };
}
