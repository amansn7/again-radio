# AGAIN RADIO — spec

A 24-hour, always-on fan radio station for Fred again..'s catalogue. The music is one
layer; the product is the **memory layer** — every track carries the fragment of life it
came from (the person it is named after, the album's date range, the voice note).

Not affiliated with Fred again.. Do not use his wordmark or logo as the brand.

## Non-negotiables

- Static site. Astro + vanilla TS island. Tailwind v4 for CSS.
- No UI framework (no React/Vue/Svelte), no state library, no backend, no database.
- Runtime deps: `astro`, `tailwindcss` only. Dev deps: `playwright` for screenshots.
- One `<iframe>` (YouTube), fixed full-viewport behind the whole page and always playing.
  It starts muted (browser autoplay rules); the first click or key anywhere turns sound on.
- Every visual is derived from the playing track's artwork. No stock hero images.
- One theme, Rave (`data-theme="sleek"`), with colours sampled from the artwork
  (`src/lib/palette.ts`) into registered `--art-*` properties that crossfade in CSS.

## Rights rules (hard)

- The site **embeds official YouTube content only**. Never re-stream, re-host, or proxy
  the audio. Never download it.
- **No audio analysis.** The embed is cross-origin and must not be proxied, so anything
  "reacting to the music" follows the playback clock on the track's beat grid
  (`src/lib/pulse.ts`, `bpm` from the entry, 124 when unknown).
- Artwork is **hotlinked, never stored**: Cover Art Archive or iTunes Search API.
  Never use Deezer images (their terms forbid storing, and they lack CORS).
- Memory copy is written original. Never copy prose from interviews, Wikipedia pull
  quotes, or press. Facts may be researched; sentences are ours.
- Footer carries: "Fan project. Not affiliated with Fred again.. All music © its owners."

## Stack layout

```
src/pages/index.astro
src/components/{Player,NowPlaying,MemoryCard,HourStrip,Archive}.astro
src/lib/{station,schedule,theme,art,memories,palette}.ts
public/data/station.json
public/data/programs/<id>.json
styles/theme.css
scripts/verify.mjs
```

## Data model

`public/data/station.json`

```json
{
  "name": "AGAIN RADIO",
  "tagline": "24 hours of a life in progress",
  "rotation": [{ "program": "programs/boiler-room-london.json", "weight": 1 }],
  "hourBlocks": [
    { "from": 4, "to": 10, "label": "dawn" },
    { "from": 10, "to": 16, "label": "day" },
    { "from": 16, "to": 22, "label": "dusk" },
    { "from": 22, "to": 4, "label": "night" }
  ]
}
```

`public/data/programs/<id>.json`

```json
{
  "id": "boiler-room-london",
  "title": "Boiler Room: London",
  "venue": "Boiler Room, London",
  "date": "2022-07-29",
  "youtubeId": "c0-hvjV2A5Y",
  "duration": 4305,
  "source": "set79 / MixesDB timestamps",
  "entries": [
    {
      "offset": 142,
      "duration": 113,
      "type": "track",
      "title": "Kammy (like i do)",
      "artist": "Fred again..",
      "album": "Actual Life 3 (January 1 - September 9 2022)",
      "bpm": 126,
      "memory": "Optional curated line. Omit to use the generated fallback."
    }
  ]
}
```

Rules: `entries` sorted by `offset` ascending, no overlaps, `offset + duration <= program.duration`.
`type` is `track | interlude | id`. `interlude` renders a station ident. `id` renders an
unreleased slot with generative art and no album art.

## Verified source data

| Asset | Value |
|---|---|
| USB002 EVERY SHOW (108h, 21 shows) | YouTube `GiXKukOtmeE` — show chapters in the video description |
| Boiler Room: London (1:11:45) | YouTube `c0-hvjV2A5Y` |
| Official channel | `UCXF6DMVLIVRr2OQAqyfEGeg` |
| MusicBrainz artist MBID | `bca46a0c-25c9-42ca-98c2-e64c8a5e337e` |
| Cover art | `https://coverartarchive.org/release-group/{mbid}/front-500` (CORS `*`, keyless) |
| Song art fallback | `https://itunes.apple.com/search?term=...&entity=song` (CORS `*`, keyless) |
| Tracklist sources | set79.com, mixesdb.com, getmusicmate.com, setlist.fm |
| India tour | Delhi 5 Dec 2026 · Mumbai 9 Dec 2026 · Bengaluru 13 Dec 2026 |

Boiler Room offsets (seconds, verified): Nathan 0 · Kammy 142 · Danielle 382 · Tanya 578 ·
Delilah 809 · BBY 1097 · Stay With Me 1360 · Haribo 1488 · Feelings 1592 · Strong 1895 ·
Turn On The Lights 2103 · Jungle 2343 · Lights Out 2541 · Kahan 2823 · Baby again 3026 ·
Rumble 3366 · Marnie 3663 · Angie 3963 · Clara 4023. Duration 4305.

## Memory lines

Compose from three inputs, in order:
1. The person in the title: `Title (parenthetical)` → the name. Fred names tracks after
   the people sampled in them.
2. The album's date range — rendered as a mono stamp, e.g. `JAN 1 — SEP 9 2022`.
3. A curated line for well-known tracks (write ~25). Everything else gets an honest
   generated fallback from era + source. Never invent a specific anecdote.

## Phases and acceptance

1. **Shell** — astro scaffold, tailwind, `styles/theme.css` with all three themes,
   hour strip, page skeleton, `scripts/verify.mjs`. Accept: builds, themes switch via
   `data-theme`, strip highlights the current hour.
2. **Player + sync** — YouTube IFrame API, `lib/schedule.ts` (binary search), NowPlaying,
   three program JSONs (boiler room, rooftop live, alex palace bangalter). Accept: the
   correct track shows for a given `getCurrentTime()`, progress advances, rotation
   advances on ENDED.
3. **Memory layer** — MemoryCard, interlude idents, curated + fallback lines.
   Accept: card changes with the track, crossfade, no layout shift.
4. **Canvas + themes** — art-derived gradient mesh, beat clock at entry bpm, auto
   shuffle, theme toggle persisted. Accept: 60fps at 1440×900, no jank on switch.
5. **USB002 + archive** — 108h program from show chapters, Archive rail 2019→2026,
   India countdown. Accept: chapters map to correct moments, archive scrolls smoothly.

Deferred (needs a human): own 24/7 YouTube live channel (cleared audio, VPS, ffmpeg,
systemd), Cloudflare deploy, live chat, promise wall, PWA.

## Definition of done (per phase)

`npm run build` exits 0, `node scripts/verify.mjs` exits 0, screenshots at 1440×900 and
390×844 look right, `tasks/todo.md` updated, local commit made.
