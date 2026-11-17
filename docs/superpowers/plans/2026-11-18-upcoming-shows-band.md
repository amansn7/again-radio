# Upcoming Shows Tuning Band Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded India countdown with a data-driven radio tuning band that counts down to the next show, goes "On air", and rests when nothing is announced.

**Architecture:** Pure timeline maths in `src/lib/shows.ts` (parse, next/on-air, station grouping, positions, copy), tested in node. A `<show-band>` custom element (`src/components/show-band.ts`) builds the band once and updates positions/text in place; beat lift comes from `onPulse` in `src/lib/pulse.ts`. Data moves from `albums.json.tour` to `public/data/shows.json`; search reads the new file.

**Tech Stack:** Astro, vanilla TS custom elements, CSS custom properties from `styles/theme.css`, node test scripts (no framework).

**Spec:** `docs/superpowers/specs/2026-11-18-upcoming-shows-band-design.md`

## Global Constraints

- No new dependencies. TypeScript strict; no `any`.
- Data fetched at runtime from `public/data/*.json`, never bundled.
- Components never hardcode colours: theme vars only (`--fg`, `--fg-dim`, `--fg-faint`, `--line`, `--accent`, `--bg`, `--font-body`, `--font-serif`).
- One rAF loop (pulse.ts); nothing animates while the tab is hidden or under `prefers-reduced-motion`.
- Keyboard operable; stations are `<button>`s with accessible names.
- Copy: empty state is exactly `No shows announced yet.`; kickers `Next show`, `On air now`, `Tuned to`.
- Delegates edit files only; the orchestrator commits (`phase N: <what shipped>`), never pushes.

## Review Focus

1. Viewer in another timezone (e.g. America/New_York): date shown is the show's local date, "your time" line shows their own clock. → Task 1 test `day labels use show tz`.
2. Exactly at start and at start + 9 h: on air flips on at `start`, off at `start + 9 h`, band moves to the next show. → Task 1 tests `on-air boundaries`.
3. Last show finishes → empty state, no exception from `xOf` with zero upcoming shows. → Task 1 test `empty upcoming` + Task 3 screenshot state "none".
4. Malformed `shows.json` entry (bad `start`, missing city) is dropped, not fatal; fetch failure shows an inline alert, not a blank section. → Task 1 test `parse drops bad rows`; Task 3 error branch.
5. Two shows in different cities on consecutive days must NOT merge; same city 3 days apart must NOT merge. → Task 1 test `grouping rules`.

---

### Task 1: Show data + timeline maths

**Files:**
- Create: `public/data/shows.json`
- Create: `src/lib/shows.ts`
- Create: `scripts/shows.test.mjs`
- Modify: `scripts/verify.mjs` (validate `shows.json`; warn when every show has ended)

**Interfaces:**
- Produces (all exported from `src/lib/shows.ts`):
  - `interface Show { city: string; country: string; venue: string; start: string; tz: string; t: number }` (`t` = `Date.parse(start)`)
  - `interface ShowsData { checked: string; shows: Show[] }`
  - `const ON_AIR_MS = 9 * 3600_000`
  - `parseShows(raw: unknown): ShowsData` — drops rows missing city/venue/tz or with unparseable `start`; sorts by `t`.
  - `upcoming(shows: Show[], now: number): Show[]` — shows with `t + ON_AIR_MS > now`.
  - `onAir(shows: Show[], now: number): Show | undefined` — `t <= now < t + ON_AIR_MS`.
  - `interface Station { city: string; shows: Show[] }`
  - `stations(shows: Show[]): Station[]` — consecutive shows merge when same `city` and `t` gap ≤ 2 days.
  - `interface Geom { needle: number; cap: number; end: number }`; `const WIDE: Geom = { needle: 14, cap: 34, end: 91 }`; `const NARROW: Geom = { needle: 10, cap: 22, end: 84 }`
  - `xOf(t: number, now: number, up: Show[], g: Geom): number` — percent across the band (algorithm below).
  - `glow(ms: number): number` — count of thresholds `[7d, 3d, 1d, 3h, 0]` with `ms <= threshold`, divided by 5 (on air → pass `0` → 1).
  - `readout(ms: number): string` — `"17 d 12:56:38"`; under a day `"12:56:38"`; never negative.
  - `heading(up: Show[]): string` — one country and one month → `"India, December 2026"`; otherwise `"Upcoming shows"`.
  - `dayLabel(s: Show): string` — e.g. `"Sat 5 Dec"` in the show's `tz` (`en-GB`, weekday short, day numeric, month short).

`xOf` algorithm (the tests pin it):

```ts
const lg = (ms: number) => Math.log2(1 + Math.max(ms, 0) / (6 * 3600_000));
// next = up[0]; xn = g.needle + Math.min(g.cap, 8 * lg(next.t - now))
// t <= next.t: g.needle + (xn - g.needle) * (lg(next.t - now) ? lg(t - now) / lg(next.t - now) : 0)
// t >  next.t: last = up.at(-1).t; last > next.t ? xn + (t - next.t) / (last - next.t) * (g.end - xn) : xn
// up empty: g.needle
```

- [ ] **Step 1: Write `public/data/shows.json`**

`checked: "2026-11-18"`; five shows, all `country: "India"`, `tz: "Asia/Kolkata"`, 15:00 local:
Delhi / `Leisure Valley Ground, Gurugram` / `2026-12-05T15:00:00+05:30`; Mumbai / `Mahalaxmi Race Course` / `2026-12-08…` and `2026-12-09…`; Bengaluru / `NICE Grounds` / `2026-12-12…` and `2026-12-13…`.

- [ ] **Step 2: Write the failing test `scripts/shows.test.mjs`**

Import from `../src/lib/shows.ts`, load `public/data/shows.json` via `readFileSync`, `fail()` + exit 1 like `scripts/rotation.test.mjs`. Assertions:

```js
const { shows } = parseShows(json);
const D = 86400_000, H = 3600_000, delhi = shows[0].t;
// parse drops bad rows
assert(parseShows({ checked: "x", shows: [{ city: "A", venue: "V", tz: "UTC", start: "nope", country: "C" }, ...json.shows] }).shows.length === 5);
// on-air boundaries
assert(onAir(shows, delhi - 1) === undefined && onAir(shows, delhi) === shows[0] && onAir(shows, delhi + 9 * H) === undefined);
assert(upcoming(shows, delhi + 9 * H)[0].city === "Mumbai");
// grouping rules
assert(stations(shows).map((s) => `${s.city}${s.shows.length}`).join() === "Delhi1,Mumbai2,Bengaluru2");
const fake = (city, t) => ({ city, country: "X", venue: "V", tz: "UTC", start: "", t });
assert(stations([fake("A", 0), fake("B", D)]).length === 2 && stations([fake("A", 0), fake("A", 3 * D)]).length === 2);
// positions
const now = delhi - 17 * D, up = upcoming(shows, now);
assert(xOf(now, now, up, WIDE) === 14);
assert(Math.abs(xOf(delhi, now, up, WIDE) - 48) < 1e-9);          // capped: 14 + 34
assert(Math.abs(xOf(shows[4].t, now, up, WIDE) - 91) < 1e-9);
assert(xOf(delhi, delhi - H, up, WIDE) < 17);                     // gap opens near start
assert(xOf(shows[1].t, now, up, WIDE) > 48 && xOf(shows[1].t, now, up, WIDE) < 91);
// empty upcoming
assert(xOf(0, shows[4].t + D, [], WIDE) === 14 && upcoming(shows, shows[4].t + D).length === 0);
// copy
assert(readout(17 * D + 12 * H + 56 * 60e3 + 38e3) === "17 d 12:56:38" && readout(5 * H + 7e3) === "05:00:07" && readout(-5) === "00:00:00");
assert(glow(8 * D) === 0 && glow(2 * D) === 0.4 && glow(0) === 1);
assert(heading(shows) === "India, December 2026" && heading([...shows, fake("Paris", Date.parse("2027-01-10"))]) === "Upcoming shows");
// day labels use show tz
assert(dayLabel(shows[0]) === "Sat 5 Dec");
console.log("✓ shows");
```

- [ ] **Step 3: Run it — expect failure**

Run: `node scripts/shows.test.mjs` → Expected: error, module `src/lib/shows.ts` not found.

- [ ] **Step 4: Implement `src/lib/shows.ts`** with the interfaces above. No DOM access (it runs in node). `heading` derives month/year in the first show's `tz`.

- [ ] **Step 5: Run it — expect pass**

Run: `node scripts/shows.test.mjs` → Expected: `✓ shows`.

- [ ] **Step 6: Extend `scripts/verify.mjs`**

If `public/data/shows.json` exists: `fail` for any row missing city/country/venue/tz or with `start` not matching `/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?[+-]\d\d:\d\d$/`; `warn` (`shows.json: every show has ended — add new dates or empty the list`) when all `Date.parse(start) + 9h < Date.now()`.
Run: `node scripts/verify.mjs` → Expected: `✓ data verified`, no shows warning.

- [ ] **Step 7: Commit** — `phase 11: show data and tuning band maths`

---

### Task 2: Search and albums read the new data

**Files:**
- Modify: `public/data/albums.json` (delete `tour`)
- Modify: `src/components/archive-rail.ts` (delete `TourDate`, `isTourDate`, `tour` in `AlbumsData`/`parseAlbumsData`, `msUntil`, `countdownParts`, `countdownHtml`, `buildTourHtml`, `plural`; keep `Album`, `parseAlbumsData` (albums only), `fmtOffset`, `esc`)
- Modify: `src/lib/search.ts:28,34,99-101`, `src/components/search.ts:13-26`, `scripts/search.test.mjs:18`, `scripts/verify.mjs:100-102`

**Interfaces:**
- Consumes: `parseShows`, `dayLabel`, `Show` from Task 1.
- Produces: `Sources.tour: Show[]` (replaces `Tour`); the "On tour" doc per show: title `city`, subtitle `venue`, meta `dayLabel(s)`, action `{ type: "scroll", target: "#tour" }`, keywords `[s.start.slice(0, 10), "tour", s.country]`. Drop the wrong `"USB002 tour"` label.

- [ ] **Step 1: Update `scripts/search.test.mjs`** to build `tour: parseShows(read("shows.json")).shows`, and add `has("mahalaxmi", (d) => d.group === "On tour" && d.title === "Mumbai", "venue")`.
- [ ] **Step 2: Run it** — `node scripts/search.test.mjs` → Expected: FAIL (`"mahalaxmi" should find venue`).
- [ ] **Step 3: Implement** the search changes; `loadSources` fetches `/data/shows.json` through `parseShows` (failure → `[]`). Remove the tour code from `archive-rail.ts` and the `albums.json` tour check in `verify.mjs`.
- [ ] **Step 4: Run** `node scripts/search.test.mjs && node scripts/verify.mjs && npx tsc --noEmit -p .` → Expected: all pass, no type errors.
- [ ] **Step 5: Commit** — `phase 12: search and data use shows.json`

---

### Task 3: `<show-band>` element in the shows section

**Files:**
- Create: `src/components/show-band.ts`
- Modify: `src/components/Archive.astro` (markup `<show-band id="tour">`, styles; script imports `./show-band.ts`; old `.ar-tour*` / `.ar-cd*` CSS removed)

**Interfaces:**
- Consumes: everything from Task 1; `onPulse(fn: (b: Beat) => void)` and `Beat.kick` from `src/lib/pulse.ts`.
- Produces: custom element `show-band` (no attributes).

Behaviour (from the spec; values pinned):
- Fetch `/data/shows.json` → `parseShows`. Fetch error → `<p class="meta" role="alert">The show dates could not be loaded. Check your connection and reload the page.</p>`.
- Structure: `<section aria-labelledby>` with `h2.section-title` = `heading(up)`; head (kicker with `.dot`, city, readout `aria-live="off"`, serif sub-line `"{dayLabel}, 3 pm local · {venue} · {viewer weekday + time} your time"` where "3 pm" comes from formatting `start` in `tz`); band (`role="group" aria-label="Upcoming shows"`) with day ticks, weekly ticks taller, one `<button class="st">` per `Station` (`aria-label` `"{city}, {dayLabel of each night joined with ' and '}"`, one `<i>` dot per night, label alternating rows by station index), fixed needle with `now`.
- Geometry `NARROW` when `innerWidth < 520`, else `WIDE`; rebuild DOM only when the upcoming set changes or on resize (`passive` listener, AbortController on disconnect). Every second: update readout, kicker, positions (`left` style), `--glow` on the focused station.
- On air (`onAir`): kicker `On air now`, readout `On air · {h} h {m} min in`, `.on` class pulses the dot.
- Tune: station click/Enter → focus that show, kicker `Tuned to`, revert after 6000 ms.
- Beat: `onPulse` lifts ticks within 30% of the needle by `1 + kick * nearness * 0.35` via a CSS variable on each tick (transform `scaleY`, not height); subscribe once.
- Empty (`up.length === 0`): heading `Upcoming shows`, `<p class="none">No shows announced yet.</p>`, resting band (ticks only, no stations), no 1 s timer.
- CSS: port from the approved mockup `.verify/band4-*.png` look (band mask-image edges, needle glow, `--accent` dots), theme vars only; `@media (max-width: 520px)` single-column head.

- [ ] **Step 1: Implement `show-band.ts`** and wire it into `Archive.astro`.
- [ ] **Step 2: Gates** — `npx tsc --noEmit -p . && npm run build && node scripts/verify.mjs && node scripts/shows.test.mjs && node scripts/search.test.mjs` → all pass.
- [ ] **Step 3: Screenshots** — load `http://127.0.0.1:4321/#tour` at 390×844, 768×1024, 1440×900 for four states by overriding `Date.now` in an init script: real now (counting), `2026-12-04T19:00+05:30` (tomorrow), `2026-12-08T16:12+05:30` (on air, Mumbai), `2026-12-14T12:00+05:30` (none). Save to `.verify/shows-{state}-{w}.png`; read each and check: no label overlap, no clipping, no horizontal page scroll, heading correct, readout ticking.
- [ ] **Step 4: Hidden-tab check** — in the same script, set `document.hidden` via `page.evaluate` visibility emulation (or `page.bringToFront` on another page) and confirm the 1 s timer callback count stops increasing.
- [ ] **Step 5: Commit** — `phase 13: shows section is a live tuning band`
