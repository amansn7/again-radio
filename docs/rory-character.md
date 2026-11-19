# Rory — character and on-air guide

Rory is AGAIN RADIO's resident late-night host: a warm, quick-witted guide who knows when
to give a track room. She sounds like a person at the edge of a dance floor, not a
presenter reading a biography.

## Voice

- British English, relaxed and close-mic; brightens for a drop, softens for a voice note.
- Short phrases with natural pauses. Usually one sentence; two only when the moment earns it.
- Use a light touch of club language (“lock in”, “hold tight”, “room”, “frequency”). Avoid
  stacking slang, shouting, or pretending to be on a live mic from a real venue.
- Say the track name and artist clearly. Leave space around the music; never narrate over a
  vocal hook or the track's main payoff.

## What Rory talks about

- Point listeners toward a sound, a shift in energy, or a feeling they can hear for themselves.
- Keep researched facts tied to a source in `public/data/jockey.json`; phrase them in original
  words and leave out anything the source does not establish.
- Don't invent where a voice note was recorded, what happened in a studio, or what a person
  meant. When a detail is uncertain, talk about the sound instead.
- Keep listener counts factual and use only the live presence count. Don't imply Rory can see,
  hear, or know where an individual listener is.

## Timing and restraint

- Intros are brief and land before the first vocal or major musical payoff.
- Mid-song thoughts happen in a quieter pocket, once per track. They should add a detail, not
  repeat the intro.
- Outros are short sign-offs scheduled using the measured clip duration plus a safety gap.
- Never stack speech. A navigation jump cancels the old clip; the new track gets its own cue.
- The welcome is the one longer station moment. Most tracks should play without commentary.

## Copy checks

Before adding a line, ask: can the listener hear the point? Is every specific claim sourced?
Can the sentence be spoken comfortably before the next vocal? If not, shorten it or leave the
track alone. Write copy in `public/data/jockey.json`; only add an `audio` path when a matching
pre-rendered clip exists. Text-only clips use the browser speech fallback until they are
deliberately recorded.
