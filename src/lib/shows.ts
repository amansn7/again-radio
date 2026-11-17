export interface Show { city: string; country: string; venue: string; start: string; tz: string; t: number }
export interface ShowsData { checked: string; shows: Show[] }
export interface Station { city: string; shows: Show[] }
export interface Geom { needle: number; cap: number; end: number }

export const ON_AIR_MS = 9 * 3600_000;
export const WIDE: Geom = { needle: 14, cap: 34, end: 91 };
export const NARROW: Geom = { needle: 10, cap: 22, end: 84 };

const DAY = 86400_000;
export const validTz = (tz: string) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function parseShows(raw: unknown): ShowsData {
  const r = (raw ?? {}) as { checked?: unknown; shows?: unknown };
  const rows = Array.isArray(r.shows) ? (r.shows as Record<string, unknown>[]) : [];
  const shows: Show[] = [];
  for (const s of rows) {
    const city = str(s?.city), venue = str(s?.venue), tz = str(s?.tz), start = str(s?.start);
    const t = Date.parse(start);
    if (city && venue && tz && !Number.isNaN(t) && validTz(tz)) shows.push({ city, country: str(s.country), venue, start, tz, t });
  }
  return { checked: str(r.checked), shows: shows.sort((a, b) => a.t - b.t) };
}

export const upcoming = (shows: Show[], now: number) => shows.filter((s) => s.t + ON_AIR_MS > now);
export const onAir = (shows: Show[], now: number) => shows.find((s) => s.t <= now && now < s.t + ON_AIR_MS);

export function stations(shows: Show[]): Station[] {
  const out: Station[] = [];
  for (const s of shows) {
    const last = out.at(-1);
    if (last && last.city === s.city && s.t - last.shows.at(-1)!.t <= 2 * DAY) last.shows.push(s);
    else out.push({ city: s.city, shows: [s] });
  }
  return out;
}

const lg = (ms: number) => Math.log2(1 + Math.max(ms, 0) / (6 * 3600_000));

export function xOf(t: number, now: number, up: Show[], g: Geom): number {
  const next = up[0];
  if (!next) return g.needle;
  const ln = lg(next.t - now);
  const xn = g.needle + Math.min(g.cap, 8 * ln);
  if (t <= next.t) return g.needle + (xn - g.needle) * (ln ? lg(t - now) / ln : 0);
  const last = up[up.length - 1].t;
  return last > next.t ? xn + ((t - next.t) / (last - next.t)) * (g.end - xn) : xn;
}

export const glow = (ms: number) => [7 * DAY, 3 * DAY, DAY, 3 * 3600_000, 0].filter((th) => ms <= th).length / 5;

export function readout(ms: number): string {
  const s = Math.floor(Math.max(ms, 0) / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const hms = `${p(Math.floor((s % 86400) / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  return s >= 86400 ? `${Math.floor(s / 86400)} d ${hms}` : hms;
}

export function heading(up: Show[]): string {
  if (!up.length) return "Upcoming shows";
  const month = (s: Show) => new Date(s.t).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: s.tz });
  const one = up.every((s) => s.country === up[0].country && month(s) === month(up[0]));
  return one ? `${up[0].country}, ${month(up[0])}` : "Upcoming shows";
}

export const dayLabel = (s: Show) =>
  new Date(s.t).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: s.tz });
