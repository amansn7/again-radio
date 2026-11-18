export interface HourBlock {
  from: number;
  to: number;
  label: string;
}

export interface StationConfig {
  name: string;
  tagline: string;
  rotation: { program: string; weight: number }[];
  hourBlocks: HourBlock[];
}

export interface ProgramEntry {
  offset: number;
  duration: number;
  type: "track" | "interlude" | "id";
  title?: string;
  artist?: string;
  album?: string;
  art?: string;
  bpm?: number;
  memory?: string;
}

export interface Program {
  id: string;
  title: string;
  venue?: string;
  date?: string;
  youtubeId: string;
  duration: number;
  source?: string;
  entries: ProgramEntry[];
}

function fail(where: string, what: string): never {
  throw new Error(`${where}: ${what}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}


function isEntryType(v: unknown): v is ProgramEntry["type"] {
  return v === "track" || v === "interlude" || v === "id";
}

function reqString(v: unknown, where: string, key: string): string {
  if (typeof v !== "string" || !v.trim()) fail(where, `"${key}" must be a non-empty string`);
  return v;
}

function reqInt(v: unknown, where: string, key: string): number {
  if (typeof v !== "number" || !Number.isInteger(v)) fail(where, `"${key}" must be an integer`);
  return v;
}

function reqNum(v: unknown, where: string, key: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(where, `"${key}" must be a number`);
  return v;
}

function optString(v: unknown, where: string, key: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") fail(where, `"${key}" must be a string`);
  return v;
}

function optInt(v: unknown, where: string, key: string): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v)) fail(where, `"${key}" must be an integer`);
  return v;
}

function parseHourBlock(v: unknown, where: string): HourBlock {
  if (!isRecord(v)) fail(where, "expected an object");
  return {
    from: reqInt(v.from, where, "from"),
    to: reqInt(v.to, where, "to"),
    label: reqString(v.label, where, "label"),
  };
}

export function parseStation(v: unknown, where: string): StationConfig {
  if (!isRecord(v)) fail(where, "expected an object");
  const rotation = v.rotation;
  if (!Array.isArray(rotation)) fail(where, `"rotation" must be an array`);
  const hourBlocks = v.hourBlocks;
  if (!Array.isArray(hourBlocks)) fail(where, `"hourBlocks" must be an array`);
  return {
    name: reqString(v.name, where, "name"),
    tagline: reqString(v.tagline, where, "tagline"),
    rotation: rotation.map((r, i) => {
      const w = `${where}.rotation[${i}]`;
      if (!isRecord(r)) fail(w, "expected an object");
      return {
        program: reqString(r.program, w, "program"),
        weight: reqNum(r.weight, w, "weight"),
      };
    }),
    hourBlocks: hourBlocks.map((b, i) => parseHourBlock(b, `${where}.hourBlocks[${i}]`)),
  };
}

const ART_URL = /^https:\/\/(is[0-9]-ssl\.mzstatic\.com|coverartarchive\.org)\//;

function parseEntry(v: unknown, where: string): ProgramEntry {
  if (!isRecord(v)) fail(where, "expected an object");
  const type = v.type;
  if (!isEntryType(type)) fail(where, `"type" must be "track", "interlude" or "id"`);
  const entry: ProgramEntry = {
    offset: reqInt(v.offset, where, "offset"),
    duration: reqInt(v.duration, where, "duration"),
    type,
  };
  const title = optString(v.title, where, "title");
  if (title !== undefined) entry.title = title;
  const artist = optString(v.artist, where, "artist");
  if (artist !== undefined) entry.artist = artist;
  const album = optString(v.album, where, "album");
  if (album !== undefined) entry.album = album;
  const art = optString(v.art, where, "art");
  if (art !== undefined) {
    if (!ART_URL.test(art)) fail(where, `"art" must be an https mzstatic or coverartarchive URL`);
    entry.art = art;
  }
  const bpm = optInt(v.bpm, where, "bpm");
  if (bpm !== undefined) entry.bpm = bpm;
  const memory = optString(v.memory, where, "memory");
  if (memory !== undefined) entry.memory = memory;
  return entry;
}

export function parseProgram(v: unknown, where: string): Program {
  if (!isRecord(v)) fail(where, "expected an object");
  const entries = v.entries;
  if (!Array.isArray(entries)) fail(where, `"entries" must be an array`);
  const program: Program = {
    id: reqString(v.id, where, "id"),
    title: reqString(v.title, where, "title"),
    youtubeId: reqString(v.youtubeId, where, "youtubeId"),
    duration: reqInt(v.duration, where, "duration"),
    entries: entries.map((e, i) => parseEntry(e, `${where}.entries[${i}]`)),
  };
  const venue = optString(v.venue, where, "venue");
  if (venue !== undefined) program.venue = venue;
  const date = optString(v.date, where, "date");
  if (date !== undefined) program.date = date;
  const source = optString(v.source, where, "source");
  if (source !== undefined) program.source = source;
  return program;
}

export async function fetchJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`fetch ${url} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw new Error(`fetch ${url} failed: HTTP ${res.status}`);
  try {
    const raw: unknown = await res.json();
    return raw;
  } catch {
    throw new Error(`fetch ${url} failed: invalid JSON`);
  }
}

export async function loadStation(): Promise<StationConfig> {
  const url = "/data/station.json";
  return parseStation(await fetchJson(url), url);
}

export async function loadProgram(path: string): Promise<Program> {
  const url = `/data/${path}`;
  return parseProgram(await fetchJson(url), url);
}
