# Rory's choices on first tune-in — design (approved 2026-11-20)

## Intent
Let a listener decide what Rory (the RJ) does, after hearing what Rory sounds like.
Before this, Rory was on by default and nothing in the UI could turn Rory off.

## Approaches
- **A. Welcome is the example, then ask (picked).** Tune-in stays one tap straight into sound; the
  existing welcome clip is the sample. Cost: someone who wants music only hears ~4 s of Rory once.
- B. Ask before Rory speaks, with a "Hear Rory" button. Rejected: puts a settings step in front of
  the tune-in moment.

## Design
- Kinds (`src/lib/rory-kinds.ts`): welcome ("Says hello"), intros incl. set transitions
  ("Introduces songs"), outros ("Names what just played"), thoughts ("Shares thoughts mid-song"),
  fillers = shout-outs, facts, station IDs ("Gives shout-outs and facts"). Stored in
  `again-radio:jockey-kinds`; the old `again-radio:jockey=false` carries over as none.
- One panel (`rory-panel.ts`) above the controls, two ways in:
  - First tune-in (no `again-radio:jockey-asked`): opens after the welcome ends, quoting the line
    just heard. If Rory never spoke, it opens after 6 s of audible music. It never takes focus,
    closes by itself after 15 s untouched (pointer or focus inside cancels that), and is asked once.
  - Mic button in the controls: opens it any time (focus moves to the first choice), morphing
    out of the button and back into it.
- Choices are real checkboxes styled as chips and apply as they're ticked. Unticking the kind
  Rory is saying stops it at once. "Select all" / "Clear all" toggles everything. The primary
  button names the result: Keep Rory (all) / Keep these (some) / Music only (none).
- Closes on: primary button, Escape, the mic, a tap elsewhere (instant, so that tap still works).
- Mic shows accent when anything is on, struck through when nothing is. Its accessible name says
  on / some / off.
- Turning Rory back on from nothing unlocks audio inside that click (iOS).
- Reduced motion: no rise, no morph, no chip transitions.

## Non-goals
New audio, re-asking, settings page.

## Checks
`jockey.test.mjs` (stored-kinds parsing); `jockey.e2e.mjs` scenario 10 (panel, kinds, focus,
outside tap); screenshots 390×844 and 1440×900.
