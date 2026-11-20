# Lessons

Rules learned from corrections. Append one line per mistake — specific, actionable.

- 2026-11-15 — backgrounding a delegate with `&` got it killed when the shell tool hit
  its timeout (process-group kill). Rule: always launch long delegates through
  `scripts/detach.py`, which starts a new session, and poll with `ps -p`.
- 2026-11-15 — `hourBlocks` coverage loop with `to: 24` never terminated (mod-24 wrap).
  Rule: bound every hour loop by a computed span, never by `h !== to`.
- 2026-11-15 — Astro component `<style>` blocks are scoped, so a custom element that builds
  its DOM with `innerHTML` at runtime gets **no styles** (the scoping attribute is never
  added). Rule: custom elements that render at runtime must use `<style is:global>`.
- 2026-11-15 — Astro does not forward props to a component's root element unless it spreads
  them, so `<ThemeToggle data-blocks="…" />` silently dropped the attribute. Rule: root
  element of a component that takes attributes must spread `{...Astro.props}`.
- 2026-11-15 — `npx playwright screenshot` fails here: playwright 1.65 refuses to install
  chromium on macOS 12 and the cached headless shell is an older revision. Rule: use
  `node scripts/shot.mjs <url> <out.png> <w> <h> [theme]`, which drives the cached shell.
- 2026-11-16 — delegates committed on their own (`git commit`) and one downloaded web
  fonts into `public/fonts/` without being asked. Rule: put "edit files, do not run git"
  and "no downloaded assets" in **every** brief, and audit `git status` for untracked
  files before each phase commit.
- 2026-11-16 — `loading="lazy"` on an `<img>` that is not yet in the DOM never loads, so
  the artwork silently stayed blank. Rule: set `src` only after the element is in the
  document, or drop `loading="lazy"`.
- 2026-11-16 — stacking 20 USB002 shows inside one year column made the archive rail
  2000px tall. Rule: a list of items belongs in its own horizontal rail, not stacked in a
  column that is meant to be one item deep.
- 2026-11-17 — answered "improve visual appeal" with a timid polish pass; the user called the
  UI basic and non-functional. Rule: start from the subject (the artist's practice, his
  shows, his materials) and the product's core verb (a radio = live, shared, tune in), write
  a design language first, and make every theme a different medium, not a colour swap.
- 2026-11-17 — the auto-mode classifier denies launching `agy ... --dangerously-skip-permissions`
  (and a batch loop of agy launches). Rule: launch agy with `--mode accept-edits` one at a
  time, or use native Claude subagents (Agent tool, model + effort per unit).
- 2026-11-16 — a `const` declared later in a function body shadowed an outer one and the
  guard above it hit a temporal dead zone ("Cannot access 'x' before initialization").
  Rule: one binding per name per scope; do not shadow.

## 2026-11-18 — questions
- Correction: user wants every question asked with concrete options and a recommended answer, never a bare open question. Rule: options + trade-offs + "I'd pick X" every time.

## 2026-11-20 — orb tap hijacked by the jockey
- A new feature attached a second click handler to an existing control (the orb "make it dance" button dispatched `radio:jockey:ask`). Before wiring a feature to a control, grep every existing handler on that element and keep its one job.
- Unit tests that re-implement logic prove nothing. For timing/audio features, drive the real page (`scripts/jockey.e2e.mjs`) and assert on recorded state over time.
- A stuck `fader.fading` silently froze all navigation for ages; any ramp that can be replaced must not own the only completion callback.

## 2026-11-20 — credit budgets
- The ElevenLabs balance lags by minutes and the per-character rate varied 0.4–0.7. Size a spend from text length at the worst observed rate, record in batches, and read the settled balance before topping up.
- `--reserve` applies to every account. Lowering it to squeeze one account let the generator bill the other account too. To spend from one account only, keep the reserve and pass a smaller batch instead.
