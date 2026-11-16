#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const CHANNEL = "UCXF6DMVLIVRr2OQAqyfEGeg";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const H = { "user-agent": UA, "accept-language": "en", cookie: "CONSENT=YES+1; SOCS=CAI" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ID = /^[\w-]{11}$/;

async function html(url) {
  const r = await fetch(url, { headers: H });
  return r.text();
}

function initialData(page) {
  const m = page.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  return m ? JSON.parse(m[1]) : null;
}

function walk(node, out) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, out));
  if (!node || typeof node !== "object") return;
  if (node.videoRenderer?.videoId) out.videos.push(node.videoRenderer);
  else if (node.lockupViewModel?.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") out.videos.push(node.lockupViewModel);
  if (node.continuationItemRenderer) {
    out.token = node.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token ?? out.token;
  }
  for (const v of Object.values(node)) walk(v, out);
}

function toSeconds(text) {
  if (!text) return null;
  const p = text.split(":").map(Number);
  if (p.some(Number.isNaN)) return null;
  return p.reduce((a, n) => a * 60 + n, 0);
}

function normalise(v) {
  if (v.videoId) {
    const len = v.lengthText?.simpleText ?? v.thumbnailOverlays?.find((o) => o.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText;
    return { youtubeId: v.videoId, title: v.title?.runs?.map((r) => r.text).join("") ?? v.title?.simpleText, duration: toSeconds(len) };
  }
  const badge = JSON.stringify(v.contentImage ?? {}).match(/"text":"([\d:]+)"/);
  return { youtubeId: v.contentId, title: v.metadata?.lockupMetadataViewModel?.title?.content, duration: toSeconds(badge?.[1]) };
}

async function crawl(tab) {
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

async function oembed(id) {
  const r = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`);
  return r.status === 200 ? (await r.json()).author_name : null;
}

async function published(id) {
  try {
    const p = await html(`https://www.youtube.com/watch?v=${id}`);
    return p.match(/"uploadDate":"(\d{4}-\d{2}-\d{2})/)?.[1] ?? p.match(/"publishDate":"(\d{4}-\d{2}-\d{2})/)?.[1];
  } catch {
    return undefined;
  }
}

const albums = JSON.parse(readFileSync("public/data/albums.json", "utf8")).albums.map((a) => a.title);

function clean(title) {
  let t = title.replace(/^\s*Fred again\.*\s*[-–—:|]\s*/i, "");
  t = t.replace(/\s*[\[(](official\s+)?(music\s+video|video|visuali[sz]er|lyric\s+video|audio|official audio|live[^\])]*)[\])]/gi, "");
  t = t.replace(/\s*[-–|]\s*(official\s+)?(music\s+video|video|visuali[sz]er|lyric video|audio)\s*$/i, "");
  return t.trim();
}

function classify(title, duration) {
  const t = title.toLowerCase();
  if (duration >= 1200 && /(boiler room|set|live from|live at|show|stream|usb|rooftop|palace)/.test(t)) return "set";
  if (duration >= 1200) return "set";
  if (/(documentary|behind the scenes|film|stream summary|making of|recap|trailer|interview)/.test(t)) return "film";
  if (/\blive\b|boiler room|performance|session|rooftop/.test(t)) return "live";
  if (/(official video|music video|\(video\)|\[video\])/.test(t)) return "video";
  if (/(visuali[sz]er|lyric|official audio|\(audio\)|\[audio\])/.test(t)) return "song";
  return duration && duration <= 480 ? "song" : "other";
}

function albumFor(song) {
  const s = song.toLowerCase();
  return albums.find((a) => a.toLowerCase() === s);
}

async function main() {
  const found = new Map();
  for (const tab of ["videos", "streams"]) {
    const vs = await crawl(tab);
    console.log(`${tab}: ${vs.length} listed`);
    for (const v of vs) if (!found.has(v.youtubeId)) found.set(v.youtubeId, v);
    await sleep(450);
  }
  for (const f of readdirSync("public/data/programs").filter((n) => n.endsWith(".json"))) {
    const p = JSON.parse(readFileSync(`public/data/programs/${f}`, "utf8"));
    if (!found.has(p.youtubeId)) found.set(p.youtubeId, { youtubeId: p.youtubeId, title: p.title, duration: p.duration });
  }

  const items = [];
  let dropped = 0;
  for (const v of found.values()) {
    const channel = await oembed(v.youtubeId);
    await sleep(150);
    if (!channel || v.duration == null) { dropped++; continue; }
    const kind = classify(v.title, v.duration);
    const item = { youtubeId: v.youtubeId, title: v.title, kind, duration: v.duration, channel };
    if (kind === "song" || kind === "video" || kind === "live") {
      const song = clean(v.title);
      if (song) item.song = song;
      const album = song && albumFor(song);
      if (album) item.album = album;
    }
    const date = await published(v.youtubeId);
    if (date) item.published = date;
    await sleep(300);
    items.push(item);
  }
  items.sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));

  writeFileSync("public/data/catalogue.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), channel: CHANNEL, items }, null, 2) + "\n");
  const counts = {};
  for (const i of items) counts[i.kind] = (counts[i.kind] ?? 0) + 1;
  console.log(`wrote ${items.length} items (dropped ${dropped} unverified)`, counts);
}

await main();
