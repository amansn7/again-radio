#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FRED_AGAIN_CHANNEL, parseYouTubeLiveHtml } from "../src/lib/live-stream.ts";

const DATA_FILE = join(import.meta.dirname, "..", "public", "data", "live-stream.json");

export async function fetchChannelLive(channelId = FRED_AGAIN_CHANNEL) {
  const url = `https://www.youtube.com/channel/${channelId}/live`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`YouTube HTTP ${res.status}`);
  const html = await res.text();
  return parseYouTubeLiveHtml(html, channelId);
}

export function writeLiveStreamData(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
  const distDir = join(import.meta.dirname, "..", "dist", "data");
  if (existsSync(distDir)) {
    writeFileSync(join(distDir, "live-stream.json"), JSON.stringify(data, null, 2) + "\n");
  }
}

export function readLiveStreamData() {
  if (!existsSync(DATA_FILE)) return null;
  return JSON.parse(readFileSync(DATA_FILE, "utf8"));
}

export function mockLiveStream(youtubeId, startOffsetSec = 0, title = "Fred again.. Live Broadcast") {
  const nowSec = Math.floor(Date.now() / 1000);
  const startTime = nowSec + Number(startOffsetSec);
  const scheduledStartTime = new Date(startTime * 1000).toISOString();
  const status = startOffsetSec > 0 ? "scheduled" : "live";

  const data = {
    status,
    channelId: FRED_AGAIN_CHANNEL,
    youtubeId,
    title,
    scheduledStartTime,
    startTime,
    thumbnail: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    checkedAt: new Date().toISOString(),
  };

  writeLiveStreamData(data);
  return data;
}

export function clearLiveStream() {
  const data = {
    status: "offline",
    channelId: FRED_AGAIN_CHANNEL,
    checkedAt: new Date().toISOString(),
  };
  writeLiveStreamData(data);
  return data;
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || "check";

  if (cmd === "check") {
    console.log(`Checking YouTube channel ${FRED_AGAIN_CHANNEL}...`);
    try {
      const data = await fetchChannelLive(FRED_AGAIN_CHANNEL);
      console.log("Channel live status:", data);
    } catch (err) {
      console.error("Check failed:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  } else if (cmd === "update") {
    console.log(`Checking YouTube channel ${FRED_AGAIN_CHANNEL} and updating ${DATA_FILE}...`);
    try {
      const data = await fetchChannelLive(FRED_AGAIN_CHANNEL);
      writeLiveStreamData(data);
      console.log(`✓ Updated ${DATA_FILE}: status = ${data.status}`);
    } catch (err) {
      console.error("Update failed:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  } else if (cmd === "mock") {
    const ytid = args[1] || "c0-hvjV2A5Y";
    const offset = Number(args[2] ?? 0);
    const title = args[3] || "Fred again.. Live Special";
    const data = mockLiveStream(ytid, offset, title);
    console.log(`✓ Mock live stream saved (${data.status}):`, data);
  } else if (cmd === "clear") {
    clearLiveStream();
    console.log(`✓ Reset ${DATA_FILE} to offline`);
  } else if (cmd === "watch") {
    const intervalSec = Number(args[1] || 60);
    console.log(`Starting live tracker daemon (polling every ${intervalSec}s)...`);
    let lastKey = "";
    const run = async () => {
      try {
        const data = await fetchChannelLive(FRED_AGAIN_CHANNEL);
        const key = `${data.status}:${data.youtubeId}:${data.scheduledStartTime}`;
        if (key !== lastKey) {
          lastKey = key;
          writeLiveStreamData(data);
          console.log(`[${new Date().toLocaleTimeString()}] Live status updated: ${data.status} (${data.title || "none"})`);
        }
      } catch (err) {
        console.warn(`[${new Date().toLocaleTimeString()}] Poll warning:`, err instanceof Error ? err.message : String(err));
      }
    };
    await run();
    setInterval(run, intervalSec * 1000);
  } else {
    console.log("Usage: node scripts/live-tracker.mjs [check|update|watch|mock|clear]");
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*scripts\//, "scripts/"))) {
  await main();
}
