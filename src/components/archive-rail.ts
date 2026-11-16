export interface Album {
  year: number;
  title: string;
  subtitle: string;
  kind: string;
}

export interface TourDate {
  city: string;
  date: string;
}

export interface AlbumsData {
  albums: Album[];
  tour: TourDate[];
}

export interface ShowEntry {
  offset: number;
  duration: number;
  type: string;
  title: string;
  memory?: string;
}

export interface ProgramData {
  entries: ShowEntry[];
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

function isShowEntry(v: unknown): v is ShowEntry {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.offset === "number" && typeof r.duration === "number" &&
    typeof r.type === "string" && typeof r.title === "string";
}

export function parseAlbumsData(raw: unknown): AlbumsData {
  if (typeof raw !== "object" || raw === null) return { albums: [], tour: [] };
  const r = raw as Record<string, unknown>;
  const albums = Array.isArray(r.albums) ? r.albums.filter(isAlbum) : [];
  const tour = Array.isArray(r.tour) ? r.tour.filter(isTourDate) : [];
  return { albums, tour };
}

export function parseProgramData(raw: unknown): ProgramData {
  if (typeof raw !== "object" || raw === null) return { entries: [] };
  const r = raw as Record<string, unknown>;
  const entries = Array.isArray(r.entries) ? r.entries.filter(isShowEntry) : [];
  return { entries };
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
  return new Date(dateStr).getTime() - Date.now();
}

export function fmtCountdown(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hrs = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}D`);
  parts.push(`${hrs}H`, `${mins}M`);
  return parts.join(" ");
}

export function buildRailHtml(albums: Album[], shows: ShowEntry[]): string {
  const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

  // USB002 shows are distributed: if titles contain no year, all go to 2025
  const showsByYear: Record<number, ShowEntry[]> = { 2025: [], 2026: [] };
  const hasYearInTitle = shows.some(s => /\d{4}/.test(s.title));
  for (const s of shows) {
    if (hasYearInTitle) {
      const m = s.title.match(/(\d{4})/);
      const yr = m ? parseInt(m[1]) : 0;
      if (yr === 2025 || yr === 2026) showsByYear[yr].push(s);
    } else {
      showsByYear[2025].push(s);
    }
  }

  return years.map(yr => {
    const yrAlbums = albums.filter(a => a.year === yr);
    const releasesHtml = yrAlbums.map(a =>
      `<div class="ar-release">` +
      `<span class="ar-release-title">${a.title}</span>` +
      `<span class="ar-release-sub">${a.subtitle}</span>` +
      `</div>`
    ).join("");

    const usbShows = showsByYear[yr] ?? [];
    const usbHtml = usbShows.length
      ? `<div class="ar-usb-label">USB002 Tour</div><div class="ar-shows">` +
        usbShows.map(s =>
          `<button class="ar-show-btn" ` +
          `aria-label="Play USB002, ${s.title}, from ${fmtOffset(s.offset)}" ` +
          `data-offset="${s.offset}">` +
          `<span class="ar-show-city">${s.title}</span>` +
          (s.memory ? `<span class="ar-show-guest">${s.memory}</span>` : "") +
          `<span class="ar-show-ts">${fmtOffset(s.offset)}</span>` +
          `</button>`
        ).join("") + `</div>`
      : "";

    return `<div class="ar-year" tabindex="-1">` +
      `<div class="ar-year-label">${yr}</div>` +
      `<div class="ar-releases">${releasesHtml}</div>` +
      usbHtml + `</div>`;
  }).join("");
}

export function buildCountdownHtml(tourDates: TourDate[]): string {
  if (!tourDates.length) return "";

  const citiesHtml = tourDates.map(t => {
    const dateLabel = new Date(t.date).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric"
    }).toUpperCase();
    const isFuture = msUntil(t.date) > 0;
    return `<span class="ar-city-item${isFuture ? " is-next" : ""}">${t.city} ${dateLabel}</span>`;
  }).join(`<span class="ar-city-item"> · </span>`);

  const nextDate = tourDates.find(t => msUntil(t.date) > 0);
  const timerHtml = nextDate
    ? `<span class="ar-timer" data-next="${nextDate.date}"><span class="ar-timer-val">${fmtCountdown(msUntil(nextDate.date))}</span></span>`
    : `<span class="ar-timer">TOUR COMPLETE</span>`;

  return `<div class="ar-on-tour">On Tour</div><div class="ar-cities">${citiesHtml}</div>${timerHtml}`;
}
