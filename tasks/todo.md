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
the album's date range as a mono stamp, and 36 original curated lines (plus four
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

## Design pass
- [x] self-hosted Instrument Sans / Instrument Serif (`public/fonts`, preloaded)
- [x] field: deepen artwork palette toward night, additive glow, 2.4s palette crossfade
- [x] stage atmosphere: radial vignette into `--bg`, grain overlay
- [x] transport switches to on-media colours; no theme contrast failures

## Design v2 — "one voice, then a room" (contract: `docs/DESIGN.md`)
- [x] design language, art-derived tokens (`@property` crossfade), event + catalogue contracts, hero layout
- [x] remote access: cloudflared quick tunnel + `server.allowedHosts` for `.trycloudflare.com`
- [ ] d2-fabric — breathing thread field, ink (Diary) / light (Rave), publishes `--art-*`
- [ ] d2-engine — live wall-clock sync, Tune in, Back to live, cues incl. single videos, keyboard
- [ ] d2-hero — the name (fitted, develops / arrives), memory (ink / voice note), tracklist bar
- [ ] d2-data — verified catalogue of every official upload (`public/data/catalogue.json`)
- [ ] d2-search — index over songs, set moments, shows, releases, tour; dialog UI
- [ ] d2-below — running order, archive with covers, every show, India countdown
- [ ] d2-chrome — live status, Diary/Rave/Auto switch, quiet 24h ribbon
- [ ] integrate, screenshots both themes 1440 + 390, fix, commit

## Deferred — needs a human
- [ ] own 24/7 YouTube live channel (cleared audio, VPS, ffmpeg, systemd)
- [ ] Cloudflare Pages deploy
- [ ] live chat embed, listener promise wall, PWA

## Redesign v3 (2026-11-17)

- [x] T1 Remove glass panel behind waveform + memory text (unit W)
- [x] T2 Liquid Glass engine ported from pastebin isg9YcH2 to vanilla TS; apply to hero surfaces (unit G, opus/high)
- [x] T3 Waveform -> particle swarm in Sonic Waveform language (21st.dev, pointer ripple), beat clock driven (unit W, sonnet/high)
- [x] T4 Unified section: running order + shows + albums with choices, Warp Carousel ring (unit C, opus/high)
- [x] T5 Cards use album art / concert art (YouTube thumbnail) / song art (unit C)
- [x] T6 Live listener ticker — Worker + Durable Object, live locally via wrangler 3.99.0 + Vite proxy; production deploy + route need user login
- [x] T7 Search results with parallax; choosing one flies into the radio and plays (unit S, sonnet/medium)
- [x] T8 Mobile background playback — best effort in player.ts (re-play if the embed pauses within 2s of hiding); untested on a phone
- [ ] T9 Integrate, gates, screenshots, tunnel check (orchestrator)

Notes: React/shadcn pastes are ported, not installed (SPEC: no framework, no deps). 21st.dev sources are behind login;
porting from listing descriptions.

## Round 2 (2026-11-17 evening)

- [x] N1 Siri orb built (MIT SmoothUI port), video-complement colours; placement by unit X
- [x] N2 15 official performances in catalogue.json (+ rooftop-naples programme); Coachella full set not embeddable (login-only)
- [ ] N3 Hero UX: kinetic glass name, text hierarchy, orb placement (unit X, fable/high)
- [ ] N4 Dial art loads fast: precomputed art URLs (unit A) + right-sized images, prefetch, preconnect (unit C)
- [ ] N5 Active timer, designed with the live ticker (unit X)
- [x] N6 Dial card crops art horizontally -> square / 16:9 frames (unit C)
- [ ] N7 Deploy to workers.dev: one Worker = dist assets + presence DO (orchestrator, after gates)

## Phase 14 — First screen and quick fixes (India launch, plan `docs/superpowers/plans/2026-11-18-phase-14-first-screen.md`)
- [x] Sets without a tracklist named by `place` in the hero (`catalogue.json` `place`, `videoProgram`)
- [x] "You are here" line: `hereText` replaces "0:00 into the video"
- [x] One-tap "Tune in" button, keyboard operable, removed once sound is on
- [x] YouTube's error card hidden from the first error (`data-novideo`); mid scrim 30%, hero text shadow
- [x] Dial reflection off under 640px, shortcuts behind `?`, "your time" hidden for same-zone viewers, hint contrast, "Tracklist"/"Set" copy
- [x] Gate green; new `scripts/live.test.mjs`, `scripts/ui.check.mjs`

Review: legibility over bright real footage could not be judged headless (YouTube does not play
there); check on the live site and raise the 30% stop in `Player.astro` if needed.

## Phase 15 — Search finds the canon (India launch)
- [x] `public/data/songs.json`: 162 released tracks from MusicBrainz (`node scripts/songs.mjs` rebuilds; remixes/edits/extended skipped, album beats single as the release)
- [x] Songs not on air are "Songs" results that open a YouTube search in a new tab (marked ↗); songs on air stay as their moments
- [x] Releases match their tracks ("marea" also finds Actual Life)
- [x] `verify.mjs` validates songs.json; search test covers marea, adore u, leavemealone, ten, places to be, rumble, delilah, jungle; ui.check covers the link-out row

Review: no official-video IDs yet (no keyless source); link-out is a YouTube search for "Fred again.. <title>".

## Phase 16 — Share the moment (India launch)
- [x] Deep links `/?p=<id>&t=<s>` open that moment off live, still muted until Tune in; bad links fall back to live; URL cleaned after load
- [x] Share button in the transport: share sheet where there is one, else copies "Listening to <track>, <set>, on again radio <link>" with a toast
- [x] `/p/<id>` page per set (20: 5 programmes + 15 catalogue sets) with OG/Twitter tags, forwarding to the moment (keeps `t`)
- [x] Preview cards `public/og/*.jpg` (1200×630, ~43 KB, our type and colour only) and icons rendered by `node scripts/og.mjs`
- [x] `manifest.webmanifest` + icons: install to home screen; no service worker
- [x] `scripts/share.test.mjs`; ui.check covers share page forwarding (lands on Feelings at t=1592) and clipboard share

Review: re-run `node scripts/og.mjs` and redeploy when sets are added, or the new set shares with the default card.

## Phase 17 — Tour mode & visual polish (India launch)
- [x] Extend shows data with countdowns, venues, and tour hints (`public/data/shows.json`)
- [x] Frosted tour hint and dial card reflection trimming on mobile (`src/components/Archive.astro`, `src/components/Dial.astro`)
- [x] Official USB002 cover art and polished tour card art (`public/data/albums.json`, `src/components/dial-data.ts`)
- [x] Custom liquid glass show selector matching station aesthetic (`src/components/Dial.astro`, `src/components/dial-select.ts`)
- [x] Disco ball animation trigger on tune in (`src/components/tune-in.ts`)
- [x] Tabular slot layout and fixed width for countdown digits (`src/components/show-band.ts`)
- [x] Guard player calls before ready and rescue iframe focus on focusin (`src/components/player.ts`, `src/components/player-wake.ts`)
- [x] Full rotation: all 19 shows and 17 albums with full tracklists in radio rotation (38 slots, 36.4 h cycle)
- [x] Allow official YouTube thumbnails (`i.ytimg.com`) for bootleg sets without commercial artwork (`src/lib/art.ts`, `src/lib/station.ts`, `scripts/verify.mjs`)

## Phase 18 — AI Voice Radio Jockey: Rory
- [x] Character definition, female UK broadcaster persona (Rory), voice profile with ElevenLabs Lily (`pFZP5JQG7iQjIQuC4Bku`)
- [x] Knowledge base with verified facts and citation sources (`public/data/jockey.json`)
- [x] Pre-rendered broadcast audio clips for core sweepers, track intros, transitions, and facts (`public/audio/jockey/*.mp3`, `scripts/generate-jockey-audio.mjs`)
- [x] Real-time audio ducking engine (`src/lib/jockey-ducker.ts`) smoothly ramping YouTube volume to 22% during voice and swelling to 100% on cue
- [x] Talk-over timing ("hitting the post") wrapping intro speeches before song vocals/drops
- [x] Transport bar toggle button, vocal luminescence on Siri orb, and synchronized liquid glass live captions (`Player.astro`, `Orb.astro`, `orb.ts`)
- [x] Unit test suite (`scripts/jockey.test.mjs`) and verify integration (`scripts/verify.mjs`)

## Production-credit catalogue reconciliation (snapshot 2026-11-18)
- [x] Record scope and evidence rules in a separate `public/data/production.json` ledger; keep radio rotation and the existing 162-title MusicBrainz artist catalog separate
- [x] Reconcile all 162 current artist-catalog entries into track-credit verified, explicit non-producer exclusion, or unresolved, with unresolved titles retained in the ledger
- [x] Add 135 verified artist-catalog track credits, one reviewed exclusion (“Roze (Forgive)”), and 26 unresolved credits
- [x] Add three verified producer-only tracks found in this pass: Roots Manuva “Fighting For?”, Charli xcx “After the Afterparty”, and Ed Sheeran “Bad Habits”
- [x] Keep three leads separate from verified counts: *Someday World* track mapping, *Bleeds* unspecified assistance, and Maisie Peters “Elvis Song” (secondary source only)
- [ ] Extend producer-only research across earlier aliases and external artist catalogs; this pass is not an all-career completeness claim
- [ ] Add verified producer-only records to listener search after deciding their display and playback behavior
- [ ] Add playable tracks to rotation only when official YouTube embed IDs and required track facts have sources

Coverage: 138 verified total (135 matching the existing 162-title artist catalog, plus 3 producer-only); 26 artist-catalog entries still need track-level production-credit checks, and one entry is explicitly excluded. This is a reconciled snapshot of the current catalog, not a complete all-career production discography.
