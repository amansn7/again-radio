export const CHANNEL = "UCXF6DMVLIVRr2OQAqyfEGeg";
export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
export const H = { "user-agent": UA, "accept-language": "en", cookie: "CONSENT=YES+1; SOCS=CAI" };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const ID = /^[\w-]{11}$/;

export async function html(url) {
  const r = await fetch(url, { headers: H });
  return r.text();
}

export function initialData(page) {
  const m = page.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  return m ? JSON.parse(m[1]) : null;
}

export function walk(node, out) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, out));
  if (!node || typeof node !== "object") return;
  if (node.videoRenderer?.videoId) out.videos.push(node.videoRenderer);
  else if (node.lockupViewModel?.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") out.videos.push(node.lockupViewModel);
  if (node.continuationItemRenderer) {
    out.token = node.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token ?? out.token;
  }
  for (const v of Object.values(node)) walk(v, out);
}

export function toSeconds(text) {
  if (!text) return null;
  const p = text.split(":").map(Number);
  if (p.some(Number.isNaN)) return null;
  return p.reduce((a, n) => a * 60 + n, 0);
}

export function normalise(v) {
  if (v.videoId) {
    const len = v.lengthText?.simpleText ?? v.thumbnailOverlays?.find((o) => o.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText;
    return { youtubeId: v.videoId, title: v.title?.runs?.map((r) => r.text).join("") ?? v.title?.simpleText, duration: toSeconds(len) };
  }
  const badge = JSON.stringify(v.contentImage ?? {}).match(/"text":"([\d:]+)"/);
  return { youtubeId: v.contentId, title: v.metadata?.lockupMetadataViewModel?.title?.content, duration: toSeconds(badge?.[1]) };
}

export async function crawl(tab) {
  const page = await html(`https://www.youtube.com/channel/${CHANNEL}/${tab}`);
  const data = initialData(page);
  if (!data) return [];
  const key = page.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const ver = page.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
  const out = { videos: [], token: null };
  walk(data, out);
  for (let guard = 0; out.token && guard < 60; guard++) {
    await sleep(450);
    const r = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${key}`, {
      method: "POST",
      headers: { ...H, "content-type": "application/json" },
      body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: ver, hl: "en" } }, continuation: out.token }),
    });
    const next = { videos: [], token: null };
    walk(await r.json(), next);
    out.videos.push(...next.videos);
    out.token = next.token;
  }
  return out.videos.map(normalise).filter((v) => v.youtubeId && ID.test(v.youtubeId) && v.title);
}

export function clean(title) {
  let t = title.replace(/^\s*Fred again\.*\s*[-–—:|]\s*/i, "");
  t = t.replace(/\s*[\[(](official\s+)?(music\s+video|video|visuali[sz]er|lyric\s+video|audio|official audio|live[^\])]*)[\])]/gi, "");
  t = t.replace(/\s*[-–|]\s*(official\s+)?(music\s+video|video|visuali[sz]er|lyric video|audio)\s*$/i, "");
  return t.trim();
}

export function classify(title, duration) {
  const t = title.toLowerCase();
  if (duration >= 1200 && /(boiler room|set|live from|live at|show|stream|usb|rooftop|palace)/.test(t)) return "set";
  if (duration >= 1200) return "set";
  if (/(documentary|behind the scenes|film|stream summary|making of|recap|trailer|interview)/.test(t)) return "film";
  if (/\blive\b|boiler room|performance|session|rooftop/.test(t)) return "live";
  if (/(official video|music video|\(video\)|\[video\])/.test(t)) return "video";
  if (/(visuali[sz]er|lyric|official audio|\(audio\)|\[audio\])/.test(t)) return "song";
  return duration && duration <= 480 ? "song" : "other";
}

/** "Artist - Song (Official Video)" → { artist, song }; no dash means a Fred again.. upload titled by the song. */
export function splitTitle(title) {
  const at = title.indexOf(" - ");
  const artist = at < 0 ? "Fred again.." : title.slice(0, at).trim();
  const rest = at < 0 ? title : title.slice(at + 3);
  const song = rest.replace(/\s*[\[(][^\])]*(official|video|visuali[sz]er|lyric|audio)[^\])]*[\])]\s*$/i, "").trim();
  return { artist, song };
}

/** Versions of one song (visualiser, video, a different credit) share this key. */
export const songKey = (title) => splitTitle(title).song.toLowerCase().trim();

const NOT_MUSIC = /trailer|teaser|interview|documentary|\bfilm\b|summary|behind the scenes/i;

export function isMusic({ title, duration }) {
  const kind = classify(title, duration);
  return (kind === "song" || kind === "video") && duration >= 60 && duration <= 600 && !NOT_MUSIC.test(title);
}
