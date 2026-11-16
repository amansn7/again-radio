# AGAIN RADIO — design language (v2)

Read with `docs/SPEC.md`. Where this file and an older brief disagree, this file wins.

## Thesis: one voice, then a room

Fred again..'s practice runs in one direction. It starts with something private and small:
a voice note, a stranger filmed on a phone, a friend's name, the span of days an album was
lived in. Then it is carried into a room full of people until a thousand strangers are
singing a line that was never meant for them. The intimate becomes communal without stopping
being intimate.

The station is built the same way. Every surface starts as a **fragment** (a name, a date
range, one line of memory) and is carried into a **room** (the live, shared, 24-hour
broadcast that everyone hears at the same moment). The design language has four principles,
and every component must be able to say which one it serves.

1. **Fragments, not feeds.** Content arrives one piece at a time: a name, a line, a date.
   Nothing is listed when it can be placed. Generous space around each fragment; asymmetric
   placement, like photos laid on a table, not cards in a grid.
2. **Words are light.** At his shows the words of a sample are thrown huge onto the walls as
   they are sung. Here the name of the person in the track is the largest thing on the page,
   and the memory line arrives word by word, as if projected. Type is the image.
3. **The room breathes.** One living material sits under everything: **the fabric**, a field
   of fine threads that rises and settles with the music. It is the only ambient motion, and
   it is slow. Everything else moves only when the listener does something or when the track
   changes.
4. **Everyone hears the same moment.** It is a radio, not a playlist. Live sync, a visible
   clock, "Back to live" when you wander. No fake listener counts; presence is shown by time,
   not by numbers.

## The fabric (signature motion)

A canvas of ~60–90 horizontal threads (fewer on small screens), each a smooth polyline,
displaced by slow 2D noise. Colour comes from the artwork palette, graded across the threads.

- **Breath**: amplitude swells and settles over one phrase (16 beats at the entry's BPM, or a
  ~9s cycle when BPM is unknown). Ease in and out; never a hard pulse.
- **Beat**: on each beat a faint travelling ripple, barely visible. Felt, not seen.
- **Track change** (the one orchestrated moment): a single wave travels outward from the
  name block across the fabric while the palette crossfades over 2.4s.
- **Diary**: threads are ink on paper, like the ruled lines of a notebook drawn by hand
  (low contrast, normal compositing, `--bg` shows through).
- **Rave**: threads are light, like LED strands in a dark room (additive `lighter`
  compositing, soft glow, deep ground).
- Hidden tab: loop stops. Reduced motion: one static frame, no ripple.
- Publishes `--art-1 --art-2 --art-3 --art-accent` on `<html>` whenever the palette changes.

## Two themes = two halves of the thesis

Theme ids stay `diary` and `sleek` (data + verify depend on them). Visible labels:
**Diary** and **Rave**. `auto` keeps the hour-block shuffle.

| | `diary` → **Diary** (the fragment) | `sleek` → **Rave** (the room) |
|---|---|---|
| Medium | the back of a photograph, a notebook page, a voice memo | the room at the show, lights on the crowd, the screen above the decks |
| Ground | paper tinted by the artwork | the artwork deepened almost to black |
| Fabric | ink threads, notebook lines | light threads, additive glow |
| Name type | Instrument Serif, sentence case, tight leading | Instrument Sans 600, sentence case, tracking -0.035em |
| Video | a print: paper border (`--frame-pad`, thicker bottom), soft paper shadow, camera date stamp burned into the corner | a screen: borderless, `--frame-radius`, a soft bloom of the art colour behind it |
| Memory | serif italic caption, words fade in like ink drying | a voice note: slim waveform + the line as a transcript, words light up like projected captions |
| Date | camera date stamp: mono, orange-red imprint (`--stamp`), e.g. `'22 7 29` | small sans, tabular-nums, dim |
| Name enters | **develops**: opacity 0→1, blur 6px→0, sepia→none, 1.2s | **arrives**: per-letter opacity + 0.35em rise, 28ms stagger, 700ms |
| Texture | paper grain (multiply) | fine grain (overlay) + vignette |

Every component styles itself from tokens, then adds theme flourishes with
`:root[data-theme="diary"] …` / `:root[data-theme="sleek"] …` in its own
`<style is:global>` block. Both variants must exist for every component.

## Tokens (`styles/theme.css` owns them; nobody else defines colours)

Art (runtime, from the fabric; registered with `@property` so the whole page crossfades):
`--art-1` dominant, `--art-2`, `--art-3`, `--art-accent` most saturated.

Per theme: `--bg --bg-2 --fg --fg-dim --fg-faint --line --accent --on-accent --card --card-fg --stamp`,
type `--font-name --name-weight --name-tracking --font-body --font-serif --font-mono`,
shape `--radius --frame-pad --frame-pad-bottom --frame-radius --frame-shadow`.
`--accent` is derived from `--art-accent`, adjusted for contrast on that theme's ground.
Never hardcode a colour in a component. Derive shades with
`color-mix(in oklab, var(--x) N%, transparent)`.

Motion: `--ease-out: cubic-bezier(.16,1,.3,1)`, `--ease-in-out: cubic-bezier(.65,0,.35,1)`,
`--dur-1: 180ms` (feedback), `--dur-2: 420ms` (state), `--dur-3: 1200ms` (track change).

## Layout

Desktop (≥1024px), content max 1440px, side padding `clamp(1.25rem, 4vw, 4rem)`.
The first viewport (1440×900) holds everything needed to use the radio.

```
top bar     again radio              ● Live  01:33, night            Diary  Rave  Auto
hero        [ name block, 6fr ]                       [ video, 5fr        ]
            Nathan                                    [                   ]
            still breathing                           [                   ]
            memory line, word by word (≤ 38ch)        [ Tune in   ⏸   🔈   ]  (SVG icons)
            Actual Life 3, stamp / waveform                    Boiler Room: London, 29 Jul 2022
tracklist   ▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯▯▯ (one segment per entry, width ∝ duration)
            0:41 of 2:18                                      Next  Kammy (like i do)
ribbon      the 24 hours, quiet; current block named, current hour marked
--- below the fold, solid --bg over the fabric ---
running order   programme tabs + the selected programme's full tracklist, every row playable
archive         2019 → 2026 timeline, hotlinked covers, date ranges as the subtitles
every show      USB002 rail, 20 shows, each cues the player
on tour         India countdown, large tabular numerals
footer          rights line
```

Mobile (<768px): one column — top bar, video, transport, name block, tracklist, ribbon,
then the rest. No horizontal page scroll. The name always fits its column.

## Typography

- Sentence case everywhere. No tracked-out ALL-CAPS labels, no middle-dot meta strings
  (use commas or line breaks), no `→` in buttons, no emoji anywhere (favicon included).
- Mono has exactly one role: the Diary camera date stamp. Numbers elsewhere use
  Instrument Sans `font-variant-numeric: tabular-nums`.
- Name: `clamp(3.25rem, 7vw, 7.25rem)`, fitted with container query units so the longest
  word never overflows. It is the only large thing on the page.
- Body 1rem/1.6. Memory line `clamp(1.125rem, 1.5vw, 1.375rem)`, max 38ch.

## Motion

- One orchestrated moment per track change: fabric wave + name + memory words + palette.
- Ambient motion only in the fabric (and the live dot, 2.4s breath).
- Response motion at `--dur-1`/`--dur-2`: hover lifts, focus rings, pressed `scale(.97)`.
- Animate `transform`, `opacity`, `filter` only.
- `prefers-reduced-motion: reduce`: no ambient motion; track change is an instant swap.

## Function — it must behave like a radio

- **Live**: rotation loops from a fixed epoch (`2026-01-01T00:00:00Z`);
  position = (now − epoch) mod total rotation length. Everyone hears the same moment.
- **Tune in**: video autoplays muted at the live position. One primary button, "Tune in",
  unmutes and resyncs. After that: play/pause, mute, and "Back to live" once you jump away.
- **Jump**: tracklist segments, running-order rows, programme tabs, USB002 shows all
  dispatch `radio:cue` `{ program, offset }`. Jumping leaves live.
- **Keyboard** (focus not in a text field): Space play/pause, M mute, ←/→ previous/next
  track, L back to live. A quiet one-line hint near the transport.
- Every async surface has a loading state (skeleton sized like the content) and an error
  state that says what happened and what to do.

## Events

`src/lib/events.ts` is the contract. The player is the only emitter of `radio:track`,
`radio:time`, `radio:state`. Anyone may dispatch `radio:cue` or `radio:live`.
