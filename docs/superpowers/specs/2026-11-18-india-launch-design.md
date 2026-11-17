# India launch — design

Date: 2026-11-18 · Source review: `docs/REVIEW-ux.md` · Contract: `docs/SPEC.md`

## Intent

Have again radio ready for Indian fans in the window around Fred again..'s India shows
(Delhi 5 Dec, Mumbai 8–9 Dec, Bengaluru 12–13 Dec 2026). Fans arrive by every route at
once: our own posts, fan pages, WhatsApp groups, people at the venue. So two things carry
equal weight: **the first screen must win a stranger in one tap**, and **every moment must
be shareable as a link that previews well**.

**Done-by date: Mon 30 Nov 2026.** Phases 14–17 are live then. That leaves four days of
real-world use before Delhi. Phase 18 ships only if it fits before 4 Dec. Otherwise it waits.

## Goals

1. A first-time phone visitor on Jio/Airtel hears music within one tap. They see what is
   playing and why it matters in plain fan words.
2. Searching any well-known Fred track returns something useful: play it, jump to it, or
   open it on official YouTube.
3. Any moment (programme plus second) has a URL. Sharing it shows a good preview in
   WhatsApp, Instagram DMs and X.
4. The site knows about the tour. It shows a countdown before each show, practical info
   on show day, and afterwards a "what he played tonight" programme.
5. Each phase is verified and live before the next starts.

## Non-goals (this round)

- Collaborator constellation, ID tracker, crowd reactions, personal diary (review §4.2,
  4.4, 4.5, 4.9). Post-tour.
- Desktop-only polish beyond what the quick fixes cover.
- Any new runtime dependency.

## Anti-goals (failure even if it "works")

- Breaking a rights rule: re-hosting audio, storing artwork, copying press prose,
  inventing anecdotes.
- Shipping invented or unverified facts about samples, setlists or show logistics. Show
  times, gate times and setlists come from cited sources, or the UI omits them.
- A live site that is half-migrated on show day. Every phase must leave `main` deployable.
- A showcase that falls over on a slow phone or a network that blocks YouTube.

## Constraints

- Everything in `docs/SPEC.md` and `AGENTS.md`. Static Astro plus vanilla TS. Deps stay
  `astro` and `tailwindcss`. Data lives in `public/data/*.json`, fetched at runtime.
- Each phase passes the gate: `npm run build` exits 0, `node scripts/verify.mjs`,
  `node scripts/verify.mjs --selftest` and the existing `scripts/*.test.mjs` pass, and
  screenshots at 390×844 (primary) and 1440×900 look right.
- One local commit per phase: `phase N: <what shipped>`.
- Live site: Cloudflare Pages (`again-radio.pages.dev`). Presence Worker unchanged.

## Approaches considered

- **A: short phases, each verified and shipped live (chosen).** Value reaches fans early.
  A slip loses the tail of the work, not all of it. Independent parts inside a phase
  (disjoint files) may run in parallel.
- B: all features in parallel, merged once. Faster on paper. The work collides in
  `player.ts`, the hero and the cards, so it fails late, against a fixed date.
- C: one big release around 1 Dec. No time for real-user feedback. One late problem
  blocks everything.

## The phases

### Phase 14 — First screen and quick fixes (target Fri 20 Nov)
- **One-tap tune-in.** Before sound is on, the hero shows one large "tap to tune in" target
  over the video. After that, the transport collapses to its icon pill. The "Click anywhere
  for sound" label inside the pill goes away.
- **"You are here" line.** Replace "0:00 into the video" with plain words such as
  "23 min into Boiler Room, London · July 2022". Shorter variant on mobile.
- **Hero name for untracked sets.** When no track is known, the big name is the venue or
  city ("The Lot Radio"). The billing moves to the serif line.
- **Legibility.** Raise the mid stop of `.rp-screen::after` to about 30%, and/or a local
  scrim behind `.hero-name`. Judge on the bright Boiler Room and Ally Pally frames.
- **Error state.** On the first `onError`, hide the iframe so YouTube's card never shows
  through. Keep skipping as today. The friendly message stays after 3 failures.
- **Small fixes.** Dial reflection hidden under 640px. Shortcut hint moves into a `?`
  popover. "your time" hidden when the visitor's zone equals the show's zone. Hint text
  contrast at least 4.5:1.
- **Words.** Use fan vocabulary in visible copy: "set", "tracklist", "back to live". Drop
  "Programme" and "into the video".

### Phase 15 — Search finds the canon (target Mon 23 Nov)
- **New data: a song index.** Add `public/data/songs.json`: every released Fred again..
  track (title, release, year, featured artists, optional official `youtubeId`). Sources:
  MusicBrainz release groups for the artist MBID in the spec, cross-checked against the
  official YouTube channel. Facts only, no prose.
- **Search results for a song**, in this order: (1) the moments where it plays in
  any programme. Click to cue. (2) Otherwise a "Songs" result that opens the official video
  on YouTube in a new tab, with no embed swap. The listener stays on the radio. (3) It also
  appears under its release.
- **Acceptance:** `marea`, `adore u`, `leavemealone`, `ten`, `places to be`,
  `rumble`, `delilah` and `jungle` each return at least one result. `scripts/search.test.mjs`
  covers them.

### Phase 16 — Share the moment (target Thu 26 Nov)
- **Deep links.** `/?p=<program-id>&t=<seconds>` cues that programme at that second. Bad
  params fall back to live, silently. The radio still starts muted (autoplay rules), and
  the tune-in tap from phase 14 plays from the linked moment.
- **Share button** in the transport. It uses `navigator.share` where available, otherwise
  copies to the clipboard with a toast. The text reads: "Listening to <track>, <set>, on
  again radio" plus the link.
- **Previews.** Static Open Graph and Twitter tags. Query strings alone can't change OG tags
  on a static host, so every playable item gets a build-time page at `/p/<id>` that
  redirects into the deep link. That covers the 5 station programmes and every catalogue
  set (`video-<ytid>` ids). *(Builder's call: all of them, so any share previews well.)*
- **Preview images are PNG.** WhatsApp, Instagram and X don't render SVG previews. The
  1200×630 type-on-colour cards are rendered once by a script that uses the existing
  headless shell (`scripts/shot.mjs` pattern) and committed under `public/og/`. They are
  our own type with no artwork, so the "art is never stored" rule still holds. Items
  without a card fall back to `public/og/default.png`. Re-run the script when programmes
  are added. *(Builder's call.)*
- **Install.** A `manifest.webmanifest` with icons as an inline/SVG-derived PNG, generated
  at build time. Theme colour matches. With the existing `media-session.ts` this gives
  lock-screen controls. No service-worker caching of media.

### Phase 17 — Tour mode (target Mon 30 Nov)
- **Data.** Extend each show in `shows.json` with optional `gates`, `notes` (ours) and
  `source` (a URL). Omit any field we can't source.
- **Countdown hero.** From 7 days before the next show, the top bar shows a compact
  "Delhi in 4d 6h" chip linking to the India band. On show day: "Tonight · gates <time>".
- **No tour weighting.** *(Decided by the user.)* The rotation is unchanged during the
  tour. `weight` in `station.json` is unused today, and changing the mix on a date makes
  every listener jump.
- **"What he played tonight" is a list, not a playable set.** *(Decided by the user.)*
  After each show, add an entry to a new `public/data/setlists.json`: show id, source URL,
  and ordered track titles. It is built from a published setlist (setlist.fm or a cited fan
  source). The UI renders it as a readable tracklist under that show in the India band.
  Each song (1) cues the moment where it already plays in a station programme, else
  (2) opens its official video from `songs.json` on YouTube in a new tab, else (3) is
  plain text. Not added to the rotation. No player changes.
- **Show-night update is done by Claude.** *(Decided by the user.)* On the night (or next
  morning), the user opens a session and asks. Claude adds the setlist with its source,
  re-renders that show's preview card, runs the gate, commits and deploys as in AGENTS.md.
  Each show gets a share page at `/p/show-<date>-<city>` with its own card. Add a short
  checklist at `docs/show-night.md` so any session can follow the same steps.

### Phase 18 — Only if time allows (by Fri 4 Dec, otherwise post-tour)
- Programming by time of day (`rotation.ts` weights by `hourBlocks`). This means building
  weighting first, since `weight` is ignored today. Design it so the shared broadcast doesn't
  jump at block boundaries, or accept a jump at each boundary.
- "Who's in the song" for about 20 best-known tracks: a `sampled` field (name plus a
  source URL) in program entries. The memory card's serif line shows the person.

## Decided

- Approach A, phases 14–18 as above, in that order.
- Priority on phone (390×844) over desktop.
- Out of scope this round: everything listed in Non-goals.

## Left to the builder

- Exact copy wording, within the fan-vocabulary rule.
- Card and icon layout. The rendering method is fixed above.
- Show dates: `shows.json` (two nights each in Mumbai and Bengaluru) is the truth.
  `docs/SPEC.md` is updated to match. *(Builder's call.)*
- Show start times: the 15:00 IST in `shows.json` has no source. In phase 17, find one and
  add `source`. Until then the countdown counts to the date only ("Delhi in 4 days"), with
  no hours. *(Builder's call, per the sourced-facts rule.)*
- Visual design of the tune-in target, the share toast and the countdown chip, within the
  existing theme tokens.
- Whether parts of a phase run in parallel (disjoint files only).
