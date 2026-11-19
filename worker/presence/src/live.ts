export const FRED_AGAIN_CHANNEL = "UCXF6DMVLIVRr2OQAqyfEGeg";

export interface LiveStreamData {
  status: "offline" | "scheduled" | "live";
  channelId: string;
  youtubeId?: string;
  title?: string;
  scheduledStartTime?: string;
  startTime?: number;
  thumbnail?: string;
  checkedAt: string;
}

export function parseYouTubeLiveHtml(
  html: string,
  channelId: string = FRED_AGAIN_CHANNEL,
  nowSec: number = Math.floor(Date.now() / 1000),
): LiveStreamData {
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
      if (typeof vd.title === "string" && vd.title.trim()) title = vd.title;
      if (typeof vd.isLive === "boolean") isLiveNow = vd.isLive;
    } catch {
      /* ignore JSON parse failure */
    }
  }

  if (!scheduledStart) {
    const startMatch = html.match(/"startTimestamp":"([^"]+)"/);
    if (startMatch) scheduledStart = startMatch[1];
  }
  if (!isLiveNow) {
    const liveNowMatch = html.match(/"isLiveNow":(true|false)/);
    if (liveNowMatch) isLiveNow = liveNowMatch[1] === "true";
  }
  if (!isLiveNow && !scheduledStart) {
    const isLive = html.match(/"isLive":(true|false)/);
    if (isLive && isLive[1] === "true") isLiveNow = true;
  }

  let startTime = scheduledStart ? Math.floor(Date.parse(scheduledStart) / 1000) : undefined;
  if (startTime !== undefined && Number.isNaN(startTime)) startTime = undefined;

  let status: "offline" | "scheduled" | "live" = "offline";
  if (isLiveNow) {
    status = "live";
  } else if (startTime !== undefined && nowSec < startTime) {
    status = "scheduled";
  } else if (startTime !== undefined && nowSec >= startTime) {
    status = "live";
  } else {
    status = "scheduled";
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

let cached: { data: LiveStreamData; expires: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function fetchLiveStatus(channelId: string = FRED_AGAIN_CHANNEL): Promise<LiveStreamData> {
  const now = Date.now();
  if (cached && now < cached.expires) {
    return cached.data;
  }

  const url = `https://www.youtube.com/channel/${channelId}/live`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const data = parseYouTubeLiveHtml(html, channelId);
    cached = { data, expires: now + CACHE_TTL_MS };
    return data;
  } catch {
    if (cached) return cached.data;
    return {
      status: "offline",
      channelId,
      checkedAt: new Date().toISOString(),
    };
  }
}
