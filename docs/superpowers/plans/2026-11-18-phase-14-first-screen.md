# Phase 14 — First screen and quick fixes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-time phone visitor sees one obvious "tune in" target, reads plainly what is
playing and where they are in it, never sees YouTube's own error card, and can read the hero
text over bright footage.

**Architecture:** Changes stay inside existing components. Pure logic goes into `src/lib/`
(`live.ts`, `shows.ts`), where the existing `scripts/*.test.mjs` style (node plus `assert`,
importing `.ts` directly) can test it. Browser-level behaviour (tune-in target, error state)
is checked by one new playwright-core script against the dev server. The headless shell
cannot play YouTube, which conveniently exercises the error path.

**Tech Stack:** Astro 5, vanilla TS custom elements, Tailwind v4 / plain CSS, Node 24,
playwright-core via the cached headless shell (`scripts/shot.mjs` pattern).

**Spec:** `docs/superpowers/specs/2026-11-18-india-launch-design.md` (Phase 14). Also `docs/SPEC.md`, `AGENTS.md`.

## Global Constraints

- No new dependencies. Runtime deps stay `astro`, `tailwindcss`.
- Data stays in `public/data/*.json`, fetched at runtime.
- Components never hardcode colours. Use theme custom properties.
- Embed official YouTube only. Never hide the embed by removing it, only visually (rights:
  embed only, no proxying).
- Accessibility: keyboard operable, accessible names on controls, honour `prefers-reduced-motion`.
- Phone first: judge 390×844 first, then 1440×900 must not regress.
- Copy uses fan words: "set", "tracklist", "back to live". Never "Programme", "into the
  video" or "Running order" in visible text.
- **One commit for the whole phase** (`phase 14: …`), made in Task 6 after the gate. This is
  the AGENTS.md rule and overrides per-task commits. Delegates edit files and never run git.

## Review Focus

1. **Keyboard-only first visit:** Tab to "Tune in", press Enter. Sound turns on, and the
   target disappears without stealing focus to `<body>`. *Test: Task 3, check script.*
2. **YouTube blocked or video not embeddable:** the iframe is visually hidden from the first
   error. The ambient field stays. After a later successful play, it is visible again.
   *Test: Task 4, check script.*
3. **Elapsed time over 1 hour, and under 1 minute** in the "you are here" line, plus the
   USB002 108-hour programme. *Test: Task 2, `hereText` cases.*
4. **Viewer in India** (show zone equals viewer zone, including the legacy `Asia/Calcutta`
   alias) hides "your time". *Test: Task 5, `sameZone` cases.*
5. **Catalogue item without `place`:** the hero falls back to today's behaviour (the full
   title) with no blank name. *Test: Task 1, `videoProgram` fallback case.*

---

### Task 1: Hero names untracked sets by place

**Files:**
- Modify: `src/lib/catalogue.ts` (add `place?: string` to `CatalogueItem`, parse it like `song`)
- Modify: `src/lib/live.ts:4-16` (`videoProgram`)
- Modify: `public/data/catalogue.json` (add `place` to all 15 items)
- Modify: `scripts/verify.mjs` (catalogue check: `place`, if present, is a non-empty string ≤ 32 chars)
- Create: `scripts/live.test.mjs`

**Interfaces:**
- Produces: `CatalogueItem.place?: string`. `videoProgram(v)` returns `venue = v.place ?? v.channel`. Its single entry has `title = v.song ?? v.place ?? v.title`, and `artist = v.title` when `place` is used and `song` is absent.
- `now-playing.ts` `nameOf` needs no change. It already renders `title` as the big name and `artist` as the serif line.

- [ ] **Step 1: Write the failing test** in `scripts/live.test.mjs`
```js
import { videoProgram } from "../src/lib/live.ts";
const base = { youtubeId: "9Stt4wq3KCE", title: "Overmono, Fred again.. and Lil Yachty at The Lot Radio", kind: "set", duration: 4381, channel: "The Lot Radio" };
const p = videoProgram({ ...base, place: "The Lot Radio" });
assert(p.entries[0].title === "The Lot Radio" && p.entries[0].artist === base.title && p.venue === "The Lot Radio", "place becomes the name, title the serif line");
const q = videoProgram(base);
assert(q.entries[0].title === base.title && q.entries[0].artist === undefined && q.venue === "The Lot Radio", "no place: unchanged");
const r = videoProgram({ ...base, place: "X", song: "Delilah" });
assert(r.entries[0].title === "Delilah", "song still wins");
```
(Use the same `fail`/`assert` helpers as `scripts/shows.test.mjs`. End with `console.log("✓ live")`.)

- [ ] **Step 2: Run it.** `node scripts/live.test.mjs`. Expected: FAIL, "place becomes the name…".
- [ ] **Step 3: Implement** the `place` parse and the `videoProgram` change as specified in Interfaces.
- [ ] **Step 4: Add `place`** to every item in `catalogue.json`. These are short, poster-style names, ≤ 32 chars, e.g. "The Lot Radio", "Times Square", "Tiny Desk", "Glastonbury 2023", "Naples", "Rome", "Studio Live", "Studio Live 2", "Studio Live 3", "Actual Life 2, piano", "Actual Life 3, piano", "Los Angeles", "Mexico City", "Palacio de los Deportes". Facts only, taken from the existing title.
- [ ] **Step 5: Run.** `node scripts/live.test.mjs && node scripts/verify.mjs`. Expected: `✓ live`, `✓ data verified`.

### Task 2: "You are here" line replaces "0:00 into the video"

**Files:**
- Modify: `src/lib/live.ts` (add `hereText`)
- Modify: `src/components/live-status.ts` (render `hereText` in `.ls-clock`, drop the `.ls-in` "in/into the video" span)
- Modify: `src/components/LiveStatus.astro` (keep the `.ls-long` mobile hide for the place part)
- Test: `scripts/live.test.mjs`

**Interfaces:**
- Consumes: `TrackInfo.venue` (now `place ?? channel` for videos, from Task 1). For station programmes, `Program.venue`, e.g. "Boiler Room, London".
- Produces: `hereText(sec: number, place: string | undefined): { short: string; long: string }`
  - `short`: `"just started"` if sec < 60, `"23 min in"`, `"1 h 12 min in"`, `"108 h in"` (when minutes are 0 in the hour form, drop them).
  - `long`: `short` with " in" replaced by ` into ${place}` when `place` is set, e.g. `"23 min into Boiler Room, London"`, and `"just started at ${place}"`.
- Updates at most once per minute of change (compare the `short` string before writing to the DOM).

- [ ] **Step 1: Add failing cases** to `scripts/live.test.mjs`
```js
import { hereText } from "../src/lib/live.ts";
const h = (s, p) => hereText(s, p);
assert(h(30, "Boiler Room, London").long === "just started at Boiler Room, London" && h(30).short === "just started", "<1 min");
assert(h(23 * 60 + 59, "Boiler Room, London").long === "23 min into Boiler Room, London", "minutes floor");
assert(h(3600 + 12 * 60).short === "1 h 12 min in" && h(7200).short === "2 h in", "hours");
assert(h(388800 - 1).short === "107 h 59 min in", "USB002 scale");
assert(h(-5).short === "just started", "negative clamps");
```
- [ ] **Step 2: Run.** `node scripts/live.test.mjs`. Expected: FAIL, `hereText` not exported.
- [ ] **Step 3: Implement** `hereText`. In `live-status.ts`, `.ls-clock` shows `long` with the place part in `.ls-long`, so mobile under 480px shows `short`. Keep the `clock()` export (others may use it; grep before removing).
- [ ] **Step 4: Run.** `node scripts/live.test.mjs`. Expected: `✓ live`.

### Task 3: One-tap "Tune in" target

**Files:**
- Modify: `src/components/Player.astro` (replace `.rp-hint` span with a `.rp-tune` button outside `.rp-controls`, plus its CSS)
- Modify: `src/components/player.ts:208-215` (`setMuted` removes `.rp-tune` instead of `.rp-hint`. The `:has(.rp-hint)` CSS selectors move to `.rp-tune`.)
- Create: `scripts/ui.check.mjs`

**Interfaces:**
- Markup: `<button class="rp-tune" id="rp-tune" type="button">Tune in</button>` as the first child of `.rp-bar`. Accessible name: "Tune in with sound".
- Behaviour: the existing window click/keydown `soundOn` already unmutes. The button needs no handler of its own beyond being focusable. After unmute, the button is removed and focus goes to `#rp-sound` if focus was on the button.
- Look: on phone, full-width pill at least 56px tall; on desktop, auto width. Accent fill via theme tokens. A slow pulse on the accent glow, none under `prefers-reduced-motion`. The controls pill then holds only icons.
- `scripts/ui.check.mjs <url>`: launches the cached headless shell like `shot.mjs`, runs the checks listed in Tasks 3 and 4, prints `✓ ui` or exits 1 with the failed check.

- [ ] **Step 1: Write the check** for 390×844. Before any input, `#rp-tune` is visible and `radio-player[data-muted="true"]`. Focus `#rp-tune` and press Enter. Then `#rp-tune` is gone, `data-muted="false"`, and `document.activeElement.id === "rp-sound"`.
- [ ] **Step 2: Run.** `node scripts/ui.check.mjs http://127.0.0.1:4321`. Expected: FAIL, `#rp-tune` not found. (Dev server: see STATUS.md. Start it detached if `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4321` is not 200.)
- [ ] **Step 3: Implement** markup, CSS and the `setMuted` change.
- [ ] **Step 4: Run** the check. Expected: `✓ ui` (Task 3 checks).

### Task 4: Clean error state and hero legibility

**Files:**
- Modify: `src/components/player.ts` (`onError` ~line 147 sets `this.dataset.novideo = ""`. The `e.data === 1` branch ~line 129 deletes it.)
- Modify: `src/components/Player.astro` (CSS: `radio-player[data-novideo] .rp-screen iframe { visibility: hidden; }`, and the `::after` gradient's middle stop goes from 8% to 30%)
- Modify: `src/pages/index.astro` (`.hero-name` gets `text-shadow: 0 1px 18px var(--glass-drop)`)
- Test: `scripts/ui.check.mjs`

**Interfaces:**
- Consumes: Task 3's `scripts/ui.check.mjs`.
- `data-novideo` is the only new state. The 3-error friendly message logic is unchanged.

- [ ] **Step 1: Add check:** within 10 s of load in the headless shell (YouTube fails there), `radio-player` has `data-novideo` and the computed `visibility` of `.rp-screen iframe` is `hidden`. The `.ambient` element is still visible.
- [ ] **Step 2: Run.** Expected: FAIL on `data-novideo`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the check. Expected: `✓ ui`.
- [ ] **Step 5: Legibility screenshot.** In a real (non-headless) browser, or via a tunnel on a phone, view Boiler Room near the strobe section (`?` deep links don't exist yet, so use the dial to cue Boiler Room around 30:00). Confirm that the hero name and memory line read clearly. If not, raise the middle stop toward 40% and re-check. Record the final value in the commit message.

### Task 5: Small fixes and fan words

**Files:**
- Modify: `src/components/Dial.astro:75` (no `-webkit-box-reflect` under 640px)
- Modify: `src/components/Player.astro` (`.rp-keys` `<p>` becomes `<details class="rp-keys"><summary aria-label="Keyboard shortcuts">?</summary><p>…same text…</p></details>`. It stays hidden on touch as today.)
- Modify: `src/lib/shows.ts` (add `sameZone`), `src/components/show-band.ts:16` (`subLine` omits "· … your time" when `sameZone`)
- Modify: `src/components/Archive.astro:78` (`.sb-hint` colour `--fg-faint` → `--fg-dim`), and `.rp-keys` colour in `Player.astro` likewise. `--fg-dim` is 62% fg on bg, at least 4.5:1. `--fg-faint` (30%) is not.
- Modify: `src/components/dial.ts:11,54,118` (copy: "Running order" → "Tracklist", sr-only "Programme" → "Set"), `src/components/Tracklist.astro:5` (`aria-label="Tracklist"`)
- Test: `scripts/shows.test.mjs`

**Interfaces:**
- Produces: `sameZone(s: Show, viewerTz?: string): boolean`. True when the wall-clock time at `s.t` formats identically in `s.tz` and `viewerTz`. `viewerTz` defaults to `Intl.DateTimeFormat().resolvedOptions().timeZone`.

- [ ] **Step 1: Add failing cases** to `scripts/shows.test.mjs`
```js
assert(sameZone(shows[0], "Asia/Kolkata") && sameZone(shows[0], "Asia/Calcutta"), "India viewer");
assert(!sameZone(shows[0], "Europe/London") && !sameZone(shows[0]), "non-India viewer (TZ=UTC)");
```
- [ ] **Step 2: Run.** `node scripts/shows.test.mjs`. Expected: FAIL, `sameZone` not exported.
- [ ] **Step 3: Implement** `sameZone` and every file change listed above.
- [ ] **Step 4: Copy sweep.** `grep -rn "Programme\|Running order\|into the video" src` returns only code identifiers and comments, with no visible strings and no aria-labels.
- [ ] **Step 5: Run.** `node scripts/shows.test.mjs`. Expected: passes.

### Task 6: Phase gate, commit, deploy

**Files:**
- Modify: `STATUS.md` (latest commit, phase 14 shipped, new check scripts in the Verify block)
- Modify: `tasks/todo.md` (phase 14 items ticked, review note)

- [ ] **Step 1: Gate.** All must pass:
```bash
npm run build
node scripts/verify.mjs && node scripts/verify.mjs --selftest
for t in scripts/*.test.mjs; do node "$t" || exit 1; done
node scripts/ui.check.mjs http://127.0.0.1:4321
```
- [ ] **Step 2: Screenshots** with `node scripts/shot.mjs http://127.0.0.1:4321 .verify/p14-mobile.png 390 844` and `… .verify/p14-desktop.png 1440 900`. Read both. Check: the tune-in target is the most obvious thing on screen, the YouTube card is not visible, the hero shows "The Lot Radio" style names for sets, there is no reflection under the mobile card, and no horizontal scroll.
- [ ] **Step 3: Commit.**
```bash
git add -A src scripts public/data styles STATUS.md tasks/todo.md
git commit -m "phase 14: one-tap tune in, plain 'you are here', clean error state, fan words"
```
- [ ] **Step 4: Deploy** per AGENTS.md (`npm run build && npx wrangler@3.99.0 pages deploy dist --project-name again-radio`). This is the first use of this command. If the project name or auth fails, stop and report. Don't guess other flags.
- [ ] **Step 5: Live check.** `node scripts/shot.mjs https://again-radio.pages.dev .verify/p14-live.png 390 844` and read it. If it is broken, redeploy the previous commit's build and report.
