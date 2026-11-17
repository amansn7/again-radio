# Upcoming shows: the tuning band — design

Approved 2026-11-18. Short design (small change).

## Intent

The shows section answers one question for anyone, anywhere: **where is Fred playing next, and when?**
It replaces the hardcoded "India, December 2026" countdown block, whose data was also wrong
(three dates; there are five).

## Goals

- Upcoming shows only: city, venue, date. A timer to the next show that moves on by itself.
- The timer is a radio tuning band, cohesive with the station: fixed "now" needle, stations
  drift toward it in real time.
- Accurate data, easy to keep current by hand.

## Non-goals

Ticket links, on-sale or sold-out status, past shows, automatic feed fetching (no free feed exists;
Bandsintown needs a requested key, Songkick is closed).

## Anti-goals

- A countdown to the wrong moment (local midnight) or in the wrong timezone.
- A dead end after the last show ("The tour is over").
- A band that burns CPU: no full re-render per tick, no motion in a hidden tab.

## Approaches considered

1. **New `<show-band>` element + `public/data/shows.json` (picked).** Shows separate from releases;
   dial keeps reading albums only.
2. Keep dates in `albums.json`. One file fewer, but shows and releases stay mixed. Rejected.
3. Mockup-style `innerHTML` render every 250 ms. Rejected: wasteful; build once, update in place.

## Decisions

- **Data** `public/data/shows.json`: `{ "checked": "YYYY-MM-DD", "shows": [{ "city", "country", "venue", "start", "tz" }] }`.
  `start` is local ISO with offset (`2026-12-05T15:00:00+05:30`), `tz` an IANA zone for display.
  Seed: Delhi (Gurugram, Leisure Valley Ground) 5 Dec; Mumbai (Mahalaxmi Race Course) 8 and 9 Dec;
  Bengaluru (NICE Grounds) 12 and 13 Dec 2026; all 15:00 IST (Time Out; NME, Hollywood Reporter
  India, DJ Mag). Remove `tour` from `albums.json` and its parser.
- **Heading** derived from data (e.g. "India, December 2026"; mixed countries/months → "Upcoming shows").
- **Countdown** to `start`; readout `17 d 12:56:38`, under a day `12:56:38`. Sub-line: weekday date,
  "3 pm local", venue, and the start in the viewer's own time.
- **On air** from `start` until `start + 9 h`: kicker "On air now", readout "On air · 1 h 12 min in",
  then the band moves to the next show.
- **Band**: needle fixed at 14% (10% under 520 px). Gap from now to the next show is log-compressed
  (`log2(1 + ms / 6 h)`, capped at 34% / 22% of width); shows after it spaced evenly in time to the
  right end (91% / 84%). Day ticks, taller weekly ticks. Consecutive nights in one city (≤ 2 days apart)
  share one station with one dot per night; labels alternate two rows.
- **Glow**: the next station's glow grows with proximity (a week, three days, a day, three hours, on air).
  No signal bars.
- **Beat**: ticks near the needle lift with the station's beat via `src/lib/pulse.ts` (its rAF pauses
  when hidden and under reduced motion).
- **Tune**: stations are buttons; tap/Enter previews that show (kicker "Tuned to") for 6 s, then back.
- **Empty**: "No shows announced yet." in the serif italic, band at rest. Section stays in place.
- **Perf**: band built once per change of show set or viewport; positions/text updated in place;
  readout text once a second; no work while hidden.
- **Checks**: `scripts/shows.test.mjs` for the pure maths (positions, grouping, next / on-air);
  `verify.mjs` validates `shows.json` fields and warns when every show is past;
  screenshots 390 / 768 / 1440 for all four states; build green.

## Left to the builder

File split between `show-band.ts` (element) and a pure `src/lib/shows.ts` (parse, group, positions),
exact CSS tokens (theme vars only), accessible names for stations and the band.
