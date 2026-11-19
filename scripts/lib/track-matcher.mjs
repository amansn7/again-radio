// In-memory indexing and matching across canonical songs, albums, and programs.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const norm = (s) => String(s ?? "").toLowerCase().replace(/\s*[(\[][^)\]]*[)\]]/g, "").replace(/\s+\b(feat|with|ft)\b\.?.*$/i, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const ALIASES = new Map([
  ["turn on the lights", "turn on the lights again"],
  ["turn on the lights again", "turn on the lights again"],
  ["leave me alone", "leavemealone"],
  ["baby again", "baby again"],
  ["stay in it", "stayinit"],
]);

export class TrackMatcher {
  constructor(dataDir = "public/data") {
    this.dataDir = dataDir;
    this.songs = new Map();
    this.personMap = new Map();
    this.albums = new Map();
    this.artCache = new Map();
    this.bpmCache = new Map();
    this.init();
  }

  init() {
    const sp = join(this.dataDir, "songs.json");
    if (existsSync(sp)) {
      const data = JSON.parse(readFileSync(sp, "utf8"));
      for (const s of data.songs ?? []) {
        this.songs.set(norm(s.title), s);
        const m = s.title.match(/^([A-Z][\p{L}]+)\s*\(/u);
        if (m) {
          const pk = m[1].toLowerCase();
          const isAmb = /interlude|airport|station|road|line/i.test(s.title);
          if (!this.personMap.has(pk) || (!isAmb && /interlude|airport|station|road|line/i.test(this.personMap.get(pk).title))) {
            this.personMap.set(pk, s);
          }
        }
      }
    }

    const ap = join(this.dataDir, "albums.json");
    if (existsSync(ap)) {
      const data = JSON.parse(readFileSync(ap, "utf8"));
      for (const a of data.albums ?? []) {
        this.albums.set(norm(a.title), a);
      }
    }

    const pp = join(this.dataDir, "programs");
    if (existsSync(pp)) {
      for (const f of readdirSync(pp).filter((n) => n.endsWith(".json"))) {
        const p = JSON.parse(readFileSync(join(pp, f), "utf8"));
        for (const e of p.entries ?? []) {
          if (e.art && e.title) this.artCache.set(norm(e.title), e.art);
          if (e.bpm && e.title) this.bpmCache.set(norm(e.title), e.bpm);
        }
      }
    }

    const prodPath = join(this.dataDir, "production.json");
    if (existsSync(prodPath)) {
      const pdata = JSON.parse(readFileSync(prodPath, "utf8"));
      for (const s of pdata.songs ?? []) {
        const k = norm(s.title);
        if (!this.songs.has(k)) this.songs.set(k, { title: s.title, release: s.release, year: s.year, artists: s.artists, isExternal: true });
      }
    }
  }

  match(ast) {
    if (ast.type === "id") return { type: "id", title: ast.title ?? "Unreleased ID", artist: ast.artist ?? "Fred again.." };
    if (ast.type === "interlude") return { type: "interlude", title: "Interlude", artist: "AGAIN RADIO" };

    const k1 = norm(ast.baseTitle);
    const k2 = norm(ast.title);
    const aliasKey = ALIASES.get(k1) ?? ALIASES.get(k2);
    let canonical = this.songs.get(k1) ?? this.songs.get(k2);
    if (!canonical && aliasKey) canonical = this.songs.get(aliasKey);
    if (!canonical && ast.personName) {
      canonical = this.personMap.get(ast.personName.toLowerCase());
    }

    let title = ast.title;
    let artist = ast.artist || "Fred again..";
    let album = undefined;

    if (canonical) {
      if (canonical.isExternal) {
        title = canonical.title;
        artist = canonical.artists?.length ? canonical.artists.join(", ") : (ast.artist || "Fred again..");
      } else if (ast.versionType === "original") {
        title = canonical.title;
        artist = canonical.with ? `Fred again.., ${canonical.with.join(", ")}` : "Fred again..";
      } else {
        title = `${canonical.title}${ast.remixer ? ` (${ast.remixer} Remix)` : ` (${ast.versionType.replace("_", " ").toUpperCase()})`}`;
      }
      album = canonical.release;
    }

    if (ast.versionType === "remix" && (!album || album === "Actual Life 3")) {
      const usbRemixes = this.albums.get("usb002 remixes");
      if (usbRemixes && (norm(title).includes("feisty") || norm(title).includes("leavemealone") || norm(title).includes("places to be"))) {
        album = usbRemixes.title;
      }
    }

    let art = this.artCache.get(norm(title)) ?? this.artCache.get(norm(ast.baseTitle));
    if (!art && album) {
      const alb = this.albums.get(norm(album));
      if (alb?.art) art = alb.art;
    }

    const bpm = this.bpmCache.get(norm(title)) ?? this.bpmCache.get(norm(ast.baseTitle));
    return {
      type: "track",
      title,
      artist,
      ...(album ? { album } : {}),
      ...(art ? { art } : {}),
      ...(bpm ? { bpm } : {}),
    };
  }
}
