export interface Album {
  year: number;
  title: string;
  subtitle: string;
  kind: string;
  /** Precomputed by scripts/resolve-art.mjs; the runtime lookup is the fallback. */
  art?: string;
}

export interface TourDate {
  city: string;
  date: string;
}

export interface AlbumsData {
  albums: Album[];
  tour: TourDate[];
}

function isAlbum(v: unknown): v is Album {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.year === "number" && typeof r.title === "string" && typeof r.subtitle === "string";
}

function isTourDate(v: unknown): v is TourDate {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.city === "string" && typeof r.date === "string";
}

export function parseAlbumsData(raw: unknown): AlbumsData {
  if (typeof raw !== "object" || raw === null) return { albums: [], tour: [] };
  const r = raw as Record<string, unknown>;
  const albums = Array.isArray(r.albums) ? r.albums.filter(isAlbum) : [];
  const tour = Array.isArray(r.tour) ? r.tour.filter(isTourDate) : [];
  return { albums, tour };
}

export function fmtOffset(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function msUntil(dateStr: string): number {
  // tour dates are local to India
  return new Date(`${dateStr.slice(0, 10)}T00:00:00+05:30`).getTime() - Date.now();
}

export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? "" : "s"}`;

export function countdownParts(ms: number): { n: number; unit: string }[] {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(totalMin / 1440), h = Math.floor((totalMin % 1440) / 60), m = totalMin % 60;
  return [
    ...(d > 0 ? [{ n: d, unit: plural(d, "day").slice(String(d).length + 1) }] : []),
    { n: h, unit: plural(h, "hour").slice(String(h).length + 1) },
    { n: m, unit: plural(m, "minute").slice(String(m).length + 1) },
  ];
}

export function countdownHtml(ms: number): string {
  return countdownParts(ms).map((p) =>
    `<span class="ar-cd"><span class="ar-cd-n num">${p.n}</span><span class="ar-cd-u">${p.unit}</span></span>`).join("");
}

export function buildTourHtml(tour: TourDate[]): string {
  const next = tour.find((t) => msUntil(t.date) > 0);
  const timer = next
    ? `<p class="ar-timer" aria-label="Time until ${esc(next.city)}">${countdownHtml(msUntil(next.date))}</p>` +
      `<p class="meta">until ${esc(next.city)}</p>`
    : `<p class="meta">The tour is over. Thank you for coming.</p>`;
  const list = tour.map((t) => {
    const d = new Date(t.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
    const past = msUntil(t.date) <= 0;
    return `<li class="${t === next ? "is-next" : ""}"><span class="ar-tour-city">${esc(t.city)}</span>` +
      `<span class="meta num">${d}${past ? ", played" : ""}</span></li>`;
  }).join("");
  return `<div class="ar-tour-clock">${timer}</div><ul class="ar-tour-list">${list}</ul>`;
}
