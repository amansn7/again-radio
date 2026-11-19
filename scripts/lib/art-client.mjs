// Persistent disk caching and rate-limited iTunes/Cover Art Archive resolver.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ART_URL = /^https:\/\/(is[0-9]-ssl\.mzstatic\.com|coverartarchive\.org|i\.ytimg\.com)\//;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function ytThumb(id, frame = 0) {
  return `https://i.ytimg.com/vi/${id}/${frame ? `mq${frame}` : "hqdefault"}.jpg`;
}

export class ArtClient {
  constructor(cachePath = ".cache/art-cache.json") {
    this.cachePath = cachePath;
    this.cache = new Map();
    this.lastReq = 0;
    this.gap = 2000;
    this.loadCache();
  }

  loadCache() {
    if (existsSync(this.cachePath)) {
      try {
        const data = JSON.parse(readFileSync(this.cachePath, "utf8"));
        for (const [k, v] of Object.entries(data)) this.cache.set(k, v);
      } catch {}
    }
  }

  saveCache() {
    try {
      const dir = join(this.cachePath, "..");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const obj = Object.fromEntries(this.cache);
      writeFileSync(this.cachePath, JSON.stringify(obj, null, 2) + "\n");
    } catch {}
  }

  async searchItunes(term, entity) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=5`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const now = Date.now();
      const wait = Math.max(0, this.lastReq + this.gap - now);
      if (wait > 0) await sleep(wait);
      this.lastReq = Date.now();

      const res = await fetch(url).catch(() => null);
      if (res?.ok) {
        const body = await res.json().catch(() => null);
        return body?.results ?? [];
      }
      if (res && (res.status === 403 || res.status === 429) && attempt === 0) {
        await sleep(5000);
        continue;
      }
      return [];
    }
    return [];
  }

  pick(rows, want, field) {
    const w = String(want ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!w) return null;
    const hit = rows.find((r) => {
      const val = String(r[field] ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      return val === w || val.startsWith(w) || w.startsWith(val);
    }) ?? rows[0];
    const art = hit?.artworkUrl100;
    if (typeof art === "string" && art) {
      const highRes = art.replace("100x100bb", "600x600bb");
      if (ART_URL.test(highRes)) return highRes;
    }
    return null;
  }

  async resolve(title, artist = "Fred again..", album = "") {
    const key = `${artist}|${title}|${album}`.toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key);

    let art = null;
    if (title) {
      const rows = await this.searchItunes(`${artist} ${title}`, "song");
      art = this.pick(rows, title, "trackName");
    }
    if (!art && album) {
      const rows = await this.searchItunes(`${artist} ${album}`, "album");
      art = this.pick(rows, album, "collectionName");
    }

    this.cache.set(key, art);
    this.saveCache();
    return art;
  }
}
