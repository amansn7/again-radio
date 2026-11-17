# AGAIN RADIO: UI/UX review and next-level roadmap

Reviewed 2026-11-18 against `main` (c1871e5), local dev build, 1440×900 and 390×844.
Method: full-page screenshot tour, search flow, keyboard hints, data audit of
`public/data/*`, code read of player, search, memories and station logic.

> Caveat: the headless browser here cannot play YouTube, so the shots show YouTube's
> "video unavailable" card. oEmbed returns 200 for all 20 video IDs, so the embeds are fine
> in a real browser. The failure state is still worth reviewing, because real users hit it
> on school, office or Jio/Airtel networks that block YouTube.

---

## 1. Verdict

The bones are excellent and unusually on-brand. Video as the room, the name-in-lights
title, the colour-sampled orb, the dial and the India countdown band all feel like
*Fred*: lo-fi footage, big lowercase type, life captured as it happens. The product
promise in `SPEC.md` is "the memory layer". That is the part that is thinnest today.
The app looks like a premium player. It doesn't yet feel like a diary.

| Area | Score | One line |
|---|---|---|
| Visual identity | 8/10 | Restrained, cinematic, art-derived colour. Right instinct. |
| First 10 seconds | 5/10 | Muted, generic copy, jargon ("0:00 into the video"), no reason to stay. |
| Memory layer (core promise) | 4/10 | 40 curated lines; sets outside the tracklist get a vague fallback. |
| Navigation and IA | 6/10 | Dial is lovely but hides the catalogue. Hour strip is decorative. |
| Search | 5/10 | Fast and pretty. Misses major tracks ("Marea" returns nothing). |
| Mobile | 7/10 | Holds together. Transport pill and error copy crowd the fold. |
| Shows / India band | 8/10 | Best section. Drifting band plus live countdown is a real idea. |
| Shareability / growth | 2/10 | No deep links, no share, no OG image, no PWA. |
| Accessibility | 7/10 | Skip link, key hints, reduced-motion. Contrast on hint text is low. |

---

## 2. UI findings (what you see)

### Hero
1. **Long set titles break the "name in lights" idea.** "Overmono, Fred again.. and Lil
   Yachty at The Lot Radio" sets at ~70px over two lines and reads like a filename.
   When there is no track, set the **venue or city** as the name ("The Lot Radio") and put
   the billing beneath it in the serif line, the way a gig poster does.
2. **Legibility over bright footage.** `.rp-screen::after` drops to 8% wash at 55% height,
   which is where the title and memory line sit. Boiler Room and Ally Pally frames are
   full of white strobes. Raise the mid stop to ~30%, or add a soft `text-shadow` /
   local radial scrim behind `.hero-name` only.
3. **The orb next to the memory line reads as a loading spinner or avatar.** It is
   beat-synced but carries no meaning. Make it the **person**: tint it from the sampled
   person's track art, and on hover show "Danielle Ponder · sampled". Or drop it and
   let the mono date stamp (`JAN 1 — SEP 9 2022`) carry the moment.
4. **Transport pill.** "Click anywhere for sound" sits in the pill and *also* behaves
   like a button. On mobile it wraps to two lines. Make it a single, bold first-run state:
   one large "tap to tune in" over the video. Once sound is on, collapse to icons.
5. **Hint line** ("Space pauses, M mutes…") sits at ~3:1 contrast and is always on.
   Show it once on first keypress, then move it into a `?` popover.

### Dial ("On the dial")
6. The reflected card underneath is nice on desktop. On mobile it eats ~120px below the
   fold for no information. Hide the reflection under 640px.
7. The `select` next to the segmented control duplicates navigation. Running order /
   Shows / Albums plus a programme dropdown means four ways to pick. Fold the dropdown into
   the Running order tab as a horizontal chip row of the five programmes.
8. One card visible at a time on desktop wastes 1440px. Show 5 to 7 in an arc so the user
   sees *where* in the set they are. That is the radio-dial metaphor done fully.
9. Card meta "0:00" for whole sets is noise. Show date and city ("FEB 2024 · BROOKLYN").

### Hour strip
10. Dawn/Day/Dusk/Night is drawn but `rotation.ts` ignores `hourBlocks`. Programming
    does not change with the hour. Either make it real (see §4.3) or remove the strip.
    A promise the UI makes and the station doesn't keep is worse than no promise.

### India band
11. Strongest piece. Two polish notes: "Sat 3:00 PM your time" repeats "3 pm local"
    for Indian visitors, so hide it when the time zones match. The "now" needle and the
    Delhi dot overlap visually at small widths.

### Failure state
12. On YouTube error the raw YouTube "unavailable" card shows through the hero at full
    strength (desktop shots), and our own message appears only after three failures.
    Hide the iframe (`visibility:hidden`) on the first `onError` and keep the art-derived
    ambient field so the page still looks intentional.

---

## 3. UX findings (how it feels)

1. **No reason to unmute.** A first-time visitor sees a muted page and a set title. Give
   the first screen one emotional hook before any control. Example: the memory line in
   large serif, "*You're 23 minutes into Boiler Room, July 2022. Danielle is about to
   come in.*" Radio is about *now*, so tell them what *now* is.
2. **Jargon.** "Live · 0:00 into the video", "Programme", "Running order",
   "Shift+L returns to live". Fans say *set*, *ID*, *drop*, *tracklist*. Use their words.
3. **Search misses the canon.** The index covers 15 sets, 5 programme tracklists and
   albums. "Marea (we've lost dancing)", "adore u", "leavemealone", "ten",
   "places to be" and "Victory" return nothing, and those are what people type first. If a
   track is not in any programme, still return it as an album result with "not on air
   right now · plays in X" or "watch on YouTube".
4. **Rotation can't be steered.** There's shuffle and a dial, but no "play only Actual
   Life 3", "only collabs" or "only the Boiler Room". Fans are completists. Offer filters as
   *stations* (see §4.3).
5. **Nothing to come back for.** No history, no "you were here at 02:14 when Marnie
   played", no streak, no notifications before shows. The memory layer should include the
   *listener's* memories.
6. **Presence is invisible.** The Durable Object counts listeners, but a number is
   cold. Fred's whole live identity is the crowd. See §4.4.

---

## 4. What would take it to the next level

Ordered by impact ÷ effort. Everything respects `SPEC.md` rights rules: embeds only, no
audio analysis, hotlinked art, original copy.

### 4.1 The sample graph: "who's in the song" (highest leverage, pure data)
Fred's signature is naming tracks after the voice inside them (Marea → The Blessed
Madonna, Delilah → Delilah Montagu, Danielle → Danielle Ponder). That *is* the memory
layer. Add to each entry:
```json
"sampled": { "name": "The Blessed Madonna", "source": "Instagram live / DJ set talk" },
"with": ["Four Tet", "Skrillex"]
```
UI: the person's name becomes the hero's serif line, the orb becomes their portrait
colour, and clicking opens a person page listing every track they appear in. Facts can be
researched. Sentences stay ours.

### 4.2 Collaborator constellation
A canvas map of the circle: Four Tet, Skrillex, Romy, Jamie xx, Brian Eno, Swedish House
Mafia, Headie One, Obongjayar, Baby Keem, The Streets, Lil Yachty, Overmono, Thomas
Bangalter. Edge = a track or a shared set. Tap a node → the dial filters to those moments.
It reuses `disco-gl.ts` / canvas skills already in the repo.

### 4.3 Make the hour strip real: stations by time of day
- **Dawn**: Actual Life 1 and the softer USB cuts, voice-note heavy.
- **Day**: rooftops and Lot Radio sets.
- **Dusk**: Boiler Room, Ally Pally.
- **Night**: USB002 every show, the 108-hour marathon.
It's a small change to `rotation.ts` (weight by block). It turns decoration into
programming and gives "24 hours of a life in progress" a literal meaning.

### 4.4 Crowd moments, not a counter
Use the existing presence DO to broadcast ephemeral, anonymous reactions with no storage:
"hands up" taps that ripple across the video for everyone listening, timed to the beat
grid in `pulse.ts`. Show "312 people are in this room with you" in Fred's
lowercase-notes voice. This is the Boiler Room 360° crowd, rebuilt for the web.

### 4.5 ID tracker: the culture of "track ID?"
Mark entries `type: "id"` (already in the spec) with *first played* and *released as*
dates. A timeline shows "played as ID at Boiler Room, July 2022 → released Oct 2022 on
Actual Life 3". This is what hardcore fans argue about in comments, and no one presents it
well.

### 4.6 Share the moment (growth, near-zero cost)
- Deep links: `/?p=boiler-room-london&t=1592` cues that programme at that second.
- `navigator.share` button: "I'm listening to *Feelings*, Boiler Room 2022, on again radio."
- Static OG image per programme, generated at build time from the title, no artwork stored.
- PWA manifest plus the existing `media-session.ts` gives lock-screen controls and an
  install prompt. Radio belongs on the home screen.

### 4.7 India tour mode (time-boxed, Dec 2026)
- From T-7 days, the rotation leans to the tour era and the hero shows the countdown.
- On show day: "doors in 2h", gate times, and a warm-up station.
- Post-show: "what he played tonight", once setlist.fm or fan sources publish, added as a
  new programme JSON. No rebuild needed, because data is fetched at runtime.
- Local-language touch: city names in Devanagari/Kannada on the band.

### 4.8 Notes-app memory card
Fred's visual language is the iPhone Notes screenshot, scribbled captions and
date-range titles. Restyle the memory card as a note: mono date stamp, lowercase,
cursor blink on change, written original. It's one component (`MemoryCard.astro`) and the
most "him" thing you can ship.

### 4.9 Personal diary (local only)
`localStorage`: "your night on again radio": tracks heard, first-heard dates, longest
session. Export as a shareable card. Store nothing server-side, which fits the presence
rule.

### 4.10 Watch-on-YouTube at the moment
Every card and memory gets "open at 26:32 on YouTube" (`&t=1592`). It's rights-friendly,
sends views to the official channel, and builds goodwill if the team ever sees the
project.

---

## 5. Priority plan

| # | Do | Effort | Why now |
|---|---|---|---|
| 1 | First-run hook: one "tap to tune in" state plus a "you are here" sentence | S | Fixes the 5/10 first impression |
| 2 | Search: index albums and singles as playable/linkable results | S | "Marea" is query #1 |
| 3 | Deep links, share, OG, PWA | S–M | Growth before the India shows (5 Dec) |
| 4 | India tour mode | M | Hard deadline: Delhi in 17 days |
| 5 | `sampled` / `with` fields, person pages | M | Delivers the core promise |
| 6 | Hour-based rotation | S | Makes an existing UI honest |
| 7 | Crowd reactions over presence DO | M | Signature feature |
| 8 | Notes-style memory card, legibility scrim, error state | S | Polish |
| 9 | Constellation, ID tracker | L | Depth for superfans |

## 6. Quick wins (< 1 hour each)
- Hide the iframe on the first `onError`.
- Raise the mid scrim stop to ~30%.
- Hide the dial reflection under 640px.
- Remove "your time" when the visitor's time zone equals the show's.
- Replace "0:00 into the video" with "23 min into Boiler Room".
- Move the shortcut hint into a `?` popover.
