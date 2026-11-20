#!/usr/bin/env node
// Finds new official music on Fred again..'s channel and appends it to public/data/new-music.json.
// Daily from .github/workflows/new-music.yml; the workflow only opens a pull request.
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CHANNEL, H, crawl, isMusic, splitTitle } from "./lib/youtube-channel.mjs";

const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`;
/** Only uploads this recent count as new, on the first run and on every daily run after it. */
const WINDOW_DAYS = 90;

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** The channel's latest uploads, newest first. */
export function parseFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap(([, e]) => {
    const youtubeId = e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
    const title = e.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const published = e.match(/<published>(\d{4}-\d\d-\d\d)/)?.[1];
    return youtubeId && title && published ? [{ youtubeId, title: decode(title).trim(), published }] : [];
  });
}

/** Duration, upload date and channel from the watch page; throws if YouTube served something else. */
function watchInfo(page, id) {
  const length = page.match(/"lengthSeconds":"(\d+)"/)?.[1];
  const published = page.match(/"uploadDate":"(\d{4}-\d\d-\d\d)/)?.[1] ?? page.match(/"publishDate":"(\d{4}-\d\d-\d\d)/)?.[1];
  const channel = page.match(/"channelId":"(UC[\w-]{22})"/)?.[1];
  if (length === undefined || !published || !channel) throw new Error(`${id}: watch page is missing length, date or channel`);
  // Length 0: an upcoming premiere or stream. Not playable yet; a later run picks it up.
  return { duration: Number(length), published, channel };
}

const daysBefore = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86400_000).toISOString().slice(0, 10);

/** Adds new music to `<dataDir>/new-music.json`; returns the raw titles added. Writes nothing on failure. */
export async function run({ fetchText, today, dataDir, known, listVideos = () => crawl("videos") }) {
  const file = join(dataDir, "new-music.json");
  const firstRun = !existsSync(file);
  const data = firstRun ? { checked: today, items: [] } : JSON.parse(readFileSync(file, "utf8"));
  const have = new Set([...known, ...data.items.map((i) => i.youtubeId)]);

  // An empty list means YouTube served something else (consent, bot check, outage): fail loudly.
  let candidates;
  if (firstRun) {
    candidates = (await listVideos()).map((v) => ({ youtubeId: v.youtubeId, title: v.title }));
    if (!candidates.length) throw new Error("the channel's Videos tab listed nothing");
  } else {
    const feed = await fetchText(FEED);
    candidates = feed.status === 200 ? parseFeed(feed.text) : [];
    if (!candidates.length) throw new Error(`the upload feed returned no entries (HTTP ${feed.status})`);
  }
  const since = daysBefore(today, WINDOW_DAYS);

  const added = [];
  for (const c of candidates) {
    if (have.has(c.youtubeId)) continue;
    have.add(c.youtubeId);
    const short = await fetchText(`https://www.youtube.com/shorts/${c.youtubeId}`, { redirect: "manual" });
    // Only a page that names this video is a Short; a bot-check page must not hide every upload.
    if (short.status === 200 && short.text.includes(`"videoId":"${c.youtubeId}"`)) continue;
    const info = watchInfo((await fetchText(`https://www.youtube.com/watch?v=${c.youtubeId}`)).text, c.youtubeId);
    if (info.duration === 0) continue;
    // The Videos tab runs newest first and can be long: past the window, the rest is older still.
    if (info.published < since) {
      if (firstRun) break;
      continue;
    }
    if (info.channel !== CHANNEL || !isMusic({ title: c.title, duration: info.duration })) continue;
    added.push({ youtubeId: c.youtubeId, title: c.title, ...splitTitle(c.title), duration: info.duration, published: info.published, addedAt: today });
  }
  if (!added.length && !firstRun) return [];

  data.checked = today;
  data.items = [...data.items, ...added].sort((a, b) => b.published.localeCompare(a.published));
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  return added.map((a) => a.title);
}

/** Every video the station already plays, so the bot never adds it twice. */
function knownIds(dataDir) {
  const ids = new Set();
  for (const f of readdirSync(join(dataDir, "programs")).filter((n) => n.endsWith(".json"))) {
    ids.add(JSON.parse(readFileSync(join(dataDir, "programs", f), "utf8")).youtubeId);
  }
  for (const i of JSON.parse(readFileSync(join(dataDir, "catalogue.json"), "utf8")).items ?? []) ids.add(i.youtubeId);
  return ids;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dataDir = join(import.meta.dirname, "..", "public", "data");
  const fetchText = async (url, init = {}) => {
    const r = await fetch(url, { headers: H, ...init });
    return { status: r.status, text: await r.text() };
  };
  const added = await run({ fetchText, today: new Date().toISOString().slice(0, 10), dataDir, known: knownIds(dataDir) });
  for (const t of added) console.log(t);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `added=${added.length}\n`);
}
