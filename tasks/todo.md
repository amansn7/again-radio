# AGAIN RADIO — build

Contract: `docs/SPEC.md`. Conventions: `AGENTS.md`.

## Phase 1 — Shell
- [x] astro scaffold + tailwind v4 + `npm run build` green
- [x] `styles/theme.css`: diary / sleek / auto themes as CSS custom properties
- [x] `src/pages/index.astro` layout skeleton (stage, now-playing rail, hour strip)
- [x] `scripts/verify.mjs` + `public/data/station.json`
- [x] theme toggle component (auto | diary | sleek), persisted

Shipped: three themes on `data-theme`, `<hour-strip>` (24h rail, current hour + live clock,
fits 390px), `<theme-toggle>` (radiogroup, roving focus, persisted in localStorage),
runtime bootstrap fetching `/data/station.json`. `scripts/shot.mjs` replaces
`npx playwright screenshot`, which cannot run on macOS 12.

## Phase 2 — Player + sync
- [x] `src/components/Player.astro` — YouTube IFrame API, `enablejsapi`, hidden chrome
- [x] `src/lib/schedule.ts` — binary search over sorted offsets
- [x] `src/lib/station.ts` — config load, rotation, advance on ENDED
- [x] `NowPlaying.astro` — art, title, artist, album stamp, progress
- [x] programs: boiler-room-london (19 entries, verified offsets), rooftop-live, alex-palace-bangalter
- [x] rotation advances, loops, handles interlude + id entries

Shipped: `<radio-player>` drives one official YouTube embed, emits `radio:track` /
`radio:time` / `radio:state`; `<now-playing>` renders hotlinked art, title, artist, album
stamp, programme line and entry-relative progress. `src/lib/schedule.ts` binary-searches the
entries; `src/lib/art.ts` hotlinks Cover Art Archive / iTunes (never stored). Three program
JSONs with verified offsets; rotation loops on ENDED.

## Phase 3 — Memory layer
- [x] `MemoryCard.astro` — phone-photo treatment, serif caption, mono date stamp
- [x] `src/lib/memories.ts` — curated lines for ~25 tracks + generated fallback
- [x] interlude idents (station voice between tracks)
- [x] crossfade on track change, zero layout shift

Shipped: `src/lib/memories.ts` composes each line from three inputs — the name in the title,
the album's date range as a mono stamp, and 37 original curated lines (plus four
deterministic, honest fallbacks for the rest; no interview or press prose, no invented
anecdotes). `<memory-card>` renders it as a caption card: mono micro-label, the name in
the display face, the line in the serif, the stamp bottom-right. Interlude entries render
the `AGAIN RADIO` ident instead; `id` entries render as unreleased. The caption
crossfades over 200 ms and every box is height-reserved so a track change moves nothing.

## Phase 4 — Canvas + themes
- [x] `src/canvas/field.ts` — gradient mesh sampled from cover art, drifting
- [x] beat clock at entry bpm (no PCM access from YouTube — this is the honest substitute)
- [x] auto theme shuffle per hour block, seeded by date+hour, crossfade
- [x] prefers-reduced-motion respected, pause when tab hidden

Shipped: `startField(canvas)` paints a drifting 5-blob gradient mesh from the track's
hotlinked artwork, mixed 45% toward the theme ground; a beat pulse locked to playback time
at the entry's published BPM (18 entries carry a corroborated tempo); one rAF loop that
stops on a hidden tab and paints a single static frame under `prefers-reduced-motion`.
The auto theme already shuffles by date+hour and crossfades.

## Phase 5 — USB002 + archive
- [x] `programs/usb002-every-show.json` from the 21 show chapters
- [x] `Archive.astro` — 2019→2026 rail, albums with date-range subtitles
- [x] India tour countdown (Delhi 5 Dec · Mumbai 9 Dec · Bengaluru 13 Dec 2026)

Shipped: `usb002-every-show.json` — the 108-hour programme cut into the 20 city blocks
Fred's own pinned chapter list marks, tiling 0→388800s exactly, each with the guest line
from the source. `<archive-rail>` renders the 2019→2026 catalogue, a horizontal USB002
show rail that cues the player at the right chapter via `radio:cue`, and a live India
tour countdown. `public/data/albums.json` holds the release timeline and the tour dates.

## Deferred — needs a human
- [ ] own 24/7 YouTube live channel (cleared audio, VPS, ffmpeg, systemd)
- [ ] Cloudflare Pages deploy
- [ ] live chat embed, listener promise wall, PWA
