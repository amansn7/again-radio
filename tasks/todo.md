# AGAIN RADIO — build

Contract: `docs/SPEC.md`. Conventions: `AGENTS.md`.

## Phase 1 — Shell
- [ ] astro scaffold + tailwind v4 + `npm run build` green
- [ ] `styles/theme.css`: diary / sleek / auto themes as CSS custom properties
- [ ] `src/pages/index.astro` layout skeleton (stage, now-playing rail, hour strip)
- [ ] `scripts/verify.mjs` + `public/data/station.json`
- [ ] theme toggle component (auto | diary | sleek), persisted

## Phase 2 — Player + sync
- [ ] `src/components/Player.astro` — YouTube IFrame API, `enablejsapi`, hidden chrome
- [ ] `src/lib/schedule.ts` — binary search over sorted offsets
- [ ] `src/lib/station.ts` — config load, rotation, advance on ENDED
- [ ] `NowPlaying.astro` — art, title, artist, album stamp, progress
- [ ] programs: boiler-room-london (19 entries, verified offsets), rooftop-live, alex-palace-bangalter
- [ ] rotation advances, loops, handles interlude + id entries

## Phase 3 — Memory layer
- [ ] `MemoryCard.astro` — phone-photo treatment, serif caption, mono date stamp
- [ ] `src/lib/memories.ts` — curated lines for ~25 tracks + generated fallback
- [ ] interlude idents (station voice between tracks)
- [ ] crossfade on track change, zero layout shift

## Phase 4 — Canvas + themes
- [ ] `src/canvas/field.ts` — gradient mesh sampled from cover art, drifting
- [ ] beat clock at entry bpm (no PCM access from YouTube — this is the honest substitute)
- [ ] auto theme shuffle per hour block, seeded by date+hour, crossfade
- [ ] prefers-reduced-motion respected, pause when tab hidden

## Phase 5 — USB002 + archive
- [ ] `programs/usb002-every-show.json` from the 21 show chapters
- [ ] `Archive.astro` — 2019→2026 rail, albums with date-range subtitles
- [ ] India tour countdown (Delhi 5 Dec · Mumbai 9 Dec · Bengaluru 13 Dec 2026)

## Deferred — needs a human
- [ ] own 24/7 YouTube live channel (cleared audio, VPS, ffmpeg, systemd)
- [ ] Cloudflare Pages deploy
- [ ] live chat embed, listener promise wall, PWA
