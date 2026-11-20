#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { CHANNEL, H, ID, html, crawl, clean, classify, sleep } from "./lib/youtube-channel.mjs";
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
