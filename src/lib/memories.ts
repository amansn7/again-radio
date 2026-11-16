import type { ProgramEntry } from "./station.ts";

export interface MemoryLine {
  person?: string;
  stamp: string;
  text: string;
  generated: boolean;
}

export interface MemoryContext {
  programTitle?: string;
  venue?: string;
  date?: string;
}

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

const MONTH_MAP: Record<string, string> = {
  january:"JAN", february:"FEB", march:"MAR", april:"APR", may:"MAY", june:"JUN",
  july:"JUL", august:"AUG", september:"SEP", october:"OCT", november:"NOV", december:"DEC",
};

export function personFromTitle(title: string | undefined): string | undefined {
  if (!title) return undefined;
  const m = title.match(/^([^(]+)\s*\(/);
  if (!m) return undefined;
  const name = m[1].trim();
  return name || undefined;
}

export function dateStamp(album: string | undefined): string {
  if (!album) return "";
  const rangeMatch = album.match(/\(([^)]+)\)/);
  if (!rangeMatch) return album.toUpperCase();
  const inner = rangeMatch[1].trim();
  const sep = /\s*[–-]\s*/;
  const parts = inner.split(sep);
  if (parts.length !== 2) return album.toUpperCase();
  const [rawStart, rawEnd] = parts;
  const endMatch = rawEnd.trim().match(/^([A-Za-z]+)\s+(\d+)\s+(\d{4})$/);
  if (!endMatch) return album.toUpperCase();
  const endMonth = MONTH_MAP[endMatch[1].toLowerCase()];
  const endDay = endMatch[2];
  const year = endMatch[3];
  if (!endMonth) return album.toUpperCase();
  const startMatch = rawStart.trim().match(/^([A-Za-z]+)\s+(\d+)(?:\s+(\d{4}))?$/);
  if (!startMatch) return album.toUpperCase();
  const startMonth = MONTH_MAP[startMatch[1].toLowerCase()];
  const startDay = startMatch[2];
  const startYear = startMatch[3];
  if (!startMonth) return album.toUpperCase();
  if (startYear) {
    return `${startMonth} ${startDay} ${startYear} — ${endMonth} ${endDay} ${year}`;
  }
  return `${startMonth} ${startDay} — ${endMonth} ${endDay} ${year}`;
}

const CURATED: Record<string, string> = {
  "Nathan (still breathing)":
    "Named for someone who kept going. The first track, the first breath.",
  "Kammy (like i do)":
    "A borrowed voice held gently in a loop. Kammy's warmth carries the whole of Actual Life 3.",
  "Danielle (smile on my face)":
    "Whatever Danielle said made it into the record. That smile is now permanent.",
  "Tanya (maybe life)":
    "Only on the record does the name get a second half. Tanya doesn't need an explanation.",
  "Delilah (pull me out of this)":
    "A voice note passed between friends, stretched until it holds the whole room up.",
  "BBY vs. Real As It Gets (Fred again.. Bootleg)":
    "Abbreviated, intimate, and welded to something else entirely. The kind of nickname that only sticks between two people.",
  "Stay With Me":
    "A simple ask made enormous by the space the production leaves around it.",
  "Haribo vs. PTSD (Fred again.. Bootleg)":
    "Sweet, sugar-rush short, dragged through something heavier. Over before you've decided how you feel about it.",
  "Feelings":
    "The title does the work. Everything else in the track is just proof.",
  "Strong":
    "Built from something fragile. The contradiction is the point.",
  "Turn On The Lights again..":
    "Swedish House Mafia and Future on the same record — and somehow it still sounds like a bedroom.",
  "Jungle":
    "Dense and shifting. The kind of track that changes depending on where you're standing.",
  "Lights Out":
    "The room goes dark and the music keeps going. That's the whole feeling.",
  "Kahan (last year)":
    "Two syllables and a year attached to them. Whatever happened, only that much was kept.",
  "Baby again..":
    "Skrillex and Four Tet together — and the name is a small, private thing between all of them.",
  "Rumble":
    "Low-end, persistent. The kind of bass that you feel before you hear.",
  "Marnie (wish i had u)":
    "Another name, another person who ended up inside a record without asking for it.",
  "Angie (i've been lost)":
    "The parenthetical is the admission. Angie just happened to be there for it.",
  "Clara (the night is dark)":
    "The last track of the Boiler Room set. The night is dark and the name is Clara.",
  "Ten":
    "Ten days. The whole album compressed into a number.",
  "adore u":
    "Obongjayar's voice arrives and the whole track opens up. Two people, one record.",
  "Roze (forgive)":
    "The ask is in the title. The track doesn't answer it — it just holds the question.",
  "No Love":
    "Summer Walker and SZA in the same room as a DJ set. The absence is the subject.",
  "little mystery":
    "John Martyn's voice, lifted from decades back, dropped into the present. Time folded.",
  "Hannah (the sun)":
    "The sun is the metaphor. Hannah is the person. The track refuses to separate them.",
  "fear less":
    "Sampha's voice arrives like a hand on a shoulder. Two words that ask something impossible.",
  "Weak Become Heroes":
    "The Streets. 2002. Fred plays it in 2024 and it still means the same thing.",
  "Twilight":
    "Durham Diva. The light is going. Everything that happened today stays in the room.",
  "places to be":
    "Anderson .Paak and CHIKA on a track about being somewhere else. The tension is the point.",
  "wya":
    "Three letters. Where you at. The whole record starts with a question.",
  ".one":
    "A title that starts with punctuation. The first track that isn't quite a track.",
  "just stand there":
    "SOAK's voice and an instruction that is also a form of kindness. Don't move.",
  "leavemealone":
    "Baby Keem and no spaces. The title runs together because that's how it comes out.",
  "Victory Lap Five":
    "Skepta, Denzel Curry, Hanumankind — a crowd on one record, all going at once.",
  "Can You Feel It":
    "Mr. Fingers, 1992. A question old enough to be played as an introduction.",
  "One More Time":
    "Daft Punk. The loop that closes the night and opens it again an hour later.",
};

const FALLBACKS: string[] = [
  "{venue}{sep}A name, an era, and a title. Nothing else about it was kept.",
  "{venue}{sep}The name stayed. Everything else came from the date range.",
  "{venue}{sep}Built from a title and a stretch of time. The rest is production.",
  "{venue}{sep}No record of the room or the hour — only the title survived.",
];

function hashTitle(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) {
    h = (Math.imul(31, h) + title.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const mon = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${mon} ${year}`;
}

function buildFallback(title: string, ctx: MemoryContext | undefined): string {
  let venue = "";
  let sep = "";
  if (ctx?.venue && ctx?.date) {
    venue = `${ctx.venue}, ${formatDate(ctx.date)}`;
    sep = ". ";
  } else if (ctx?.venue) {
    venue = ctx.venue;
    sep = ". ";
  }
  const idx = hashTitle(title) % FALLBACKS.length;
  return FALLBACKS[idx]
    .replace("{venue}", venue)
    .replace("{sep}", venue ? sep : "");
}

export function memoryFor(entry: ProgramEntry, ctx?: MemoryContext): MemoryLine {
  const person = personFromTitle(entry.title);
  const stamp = dateStamp(entry.album) || (ctx?.date ? formatDate(ctx.date) : "");

  if (entry.memory) {
    return { person, stamp, text: entry.memory, generated: false };
  }

  const curated = entry.title ? CURATED[entry.title] : undefined;
  if (curated) {
    return { person, stamp, text: curated, generated: false };
  }

  return { person, stamp, text: buildFallback(entry.title ?? "", ctx), generated: true };
}
