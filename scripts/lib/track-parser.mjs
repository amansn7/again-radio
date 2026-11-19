// Decomposes timestamped setlists and track titles into semantic ASTs.
const TIME_RE = /^(?:\[|\()?\s*(\d{1,2}:)?(\d{1,2}):(\d{2})\s*(?:\]|\))?\s*[-–—:]?\s*/;
const SEC_RE = /^(?:\[|\()?\s*(\d+)\s*(?:s|sec)?\s*(?:\]|\))?\s*[-–—:]?\s*/i;
const MOD_RE = /[(\[]([^()[\]]*?\b(live\s+edit|remix|vip|dub|edit|flip|mix|rework|bootleg|version|outro|intro)\b[^()[\]]*?)[)\]]/i;
const TYPE_RE = /\b(live\s+edit|remix|vip|dub|edit|flip|mix|rework|bootleg|version|outro|intro)\b/i;
const LABEL_RE = /\s*\[(?:Atlantic|Warner|Virgin|Universal|XL|OWSLA|Polydor|EMI|Sony|Def Jam|Interscope)[^\]]*\]/gi;
const ID_RE = /(?:^|\b)(?:id\s*[-–]\s*id|unreleased(?:\s+id)?|track\s*id|\bid\b)(?:$|\b)/i;
const INTERLUDE_RE = /(?:^|\b)(?:interlude|station\s*ident)(?:$|\b)/i;
const PERSON_RE = /^([A-Z][\p{L}]+(?:\s+[A-Z][\p{L}]+)?)\s*\(([^)]+)\)/u;

export function parseTimestamp(line) {
  let text = line.trim();
  let offset = null;
  const tm = text.match(TIME_RE);
  if (tm) {
    const h = tm[1] ? Number.parseInt(tm[1], 10) : 0;
    const m = Number.parseInt(tm[2], 10);
    const s = Number.parseInt(tm[3], 10);
    offset = h * 3600 + m * 60 + s;
    text = text.slice(tm[0].length).trim();
  } else {
    const sm = text.match(SEC_RE);
    if (sm && /^\d+\s*[-–—:]\s*\S/.test(text)) {
      offset = Number.parseInt(sm[1], 10);
      text = text.slice(sm[0].length).trim();
    }
  }
  return { offset, text };
}

export function parseTitle(raw, defaultArtist = "Fred again..") {
  const cleaned = raw.replace(LABEL_RE, "").trim();
  if (ID_RE.test(cleaned)) return { raw, artist: defaultArtist, baseTitle: "ID", versionType: "original", type: "id" };
  if (INTERLUDE_RE.test(cleaned)) return { raw, artist: "AGAIN RADIO", baseTitle: "Interlude", versionType: "original", type: "interlude" };

  let artist = defaultArtist;
  let title = cleaned;
  if (cleaned.includes(" - ")) {
    const parts = cleaned.split(/\s+[-–—]\s+/);
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }
  }

  let versionType = "original";
  let remixer = null;
  const mm = title.match(MOD_RE);
  if (mm) {
    const tm = mm[1].match(TYPE_RE);
    if (tm) {
      versionType = tm[1].toLowerCase().replace(/\s+/g, "_");
      remixer = mm[1].slice(0, tm.index).trim() || null;
    }
  }

  const isFredRemix = Boolean(remixer && /fred again/i.test(remixer));
  let baseTitle = title.replace(MOD_RE, "").replace(/\s*[-–—]\s*$/, "").trim();
  let personName = null;
  let hook = null;
  const pm = baseTitle.match(PERSON_RE);
  if (pm) {
    personName = pm[1].trim();
    hook = pm[2].trim();
  } else if (/^[A-Z][\p{L}]+(?:\s+[A-Z][\p{L}]+)?$/u.test(baseTitle)) {
    personName = baseTitle.trim();
  }

  return { raw, artist, title, baseTitle, personName, hook, versionType, remixer, isFredRemix, type: "track" };
}

export function parseTracklist(rawText, totalDuration = null, defaultArtist = "Fred again..") {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    const { offset, text } = parseTimestamp(line);
    if (offset == null || !text) continue;
    items.push({ offset, ...parseTitle(text, defaultArtist) });
  }

  items.sort((a, b) => a.offset - b.offset);
  const entries = [];
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    const next = items[i + 1];
    let duration = next ? next.offset - cur.offset : (totalDuration ? Math.max(1, totalDuration - cur.offset) : 180);
    if (duration <= 0) duration = 1;
    entries.push({
      offset: cur.offset,
      duration,
      type: cur.type,
      title: cur.title,
      artist: cur.artist,
      ast: cur,
    });
  }
  return entries;
}
