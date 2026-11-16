# Project instructions — AGAIN RADIO

Read `STATUS.md` first for current state, open work and traps. Read `docs/SPEC.md` before
touching anything. It is the contract.

## How to work here

- Lazy is correct. Reuse what exists, use the platform, write the smallest thing that
  works. No abstraction with one implementation, no config for a value that never changes.
- One owner per file. Never edit a file another worker is editing.
- If a delegated unit fails twice, the orchestrator does it in-house.
- No new dependencies. If you believe one is required, stop and report instead.
- No comments unless they explain a non-obvious *why*.
- Files stay small. If a component exceeds ~150 lines, it is doing too much.

## Conventions

- TypeScript strict. No `any` unless parsing untrusted JSON at a boundary.
- Data lives in `public/data/*.json`, fetched at runtime, never bundled. A program edit
  must not require a rebuild.
- Times are seconds (integer). Dates are ISO strings. IDs are kebab-case.
- CSS: custom properties per theme in `styles/theme.css`; components never hardcode colours.
- Canvas work: one `requestAnimationFrame` loop, paused when the tab is hidden.
- Accessibility: the player is operable by keyboard, the toggle has an accessible name,
  motion respects `prefers-reduced-motion`.

## Rights (do not violate)

- Embed official YouTube only. Never download, re-host, or proxy the audio.
- Hotlink artwork (Cover Art Archive / iTunes). Never store or cache images.
- Write memory copy yourself. Never copy sentences from interviews or press.
- Keep the "fan project, not affiliated" footer.

## Commands

```
npm run build          # must exit 0
npm run preview        # local preview for screenshots
node scripts/verify.mjs # data + structure checks
node scripts/verify.mjs --selftest  # pure-logic checks
node scripts/schedule.test.mjs      # schedule lookup against the real tracklist
```

Screenshots — `npx playwright screenshot` **does not work here**: playwright 1.65 refuses
to install chromium on macOS 12 and the cached headless shell is an older revision. Use
the repo-local helper instead, which drives the cached shell:

```
node scripts/shot.mjs http://localhost:4321 .verify/desktop.png 1440 900
node scripts/shot.mjs http://localhost:4321 .verify/mobile.png 390 844
node scripts/shot.mjs http://localhost:4321 .verify/sleek.png 1440 900 sleek
```

The last argument optionally presets the theme (`auto | diary | sleek`).

Then read the PNGs with the Read tool and judge them honestly. Fix what looks wrong.

## Delegation mechanics

The shell tool kills its whole process group when a call times out, so a bare `cmd &`
dies with it. Never background with `&`. Detach instead — it starts a new session:

```bash
python3 scripts/detach.py .orchestrator/logs/<unit>.log sh -c \
  'agy --print "Read .orchestrator/briefs/<unit>.md and execute it. \
   --model claude-sonnet-4-6 --mode accept-edits --dangerously-skip-permissions; echo "EXIT:$?"'
```

It prints a pid. Poll it without blocking:

```bash
ps -p <pid> > /dev/null && echo running || echo done
```

For long synchronous commands pass a generous `timeout` to the shell tool
(600000 ms): `npm install`, `npm run build`, `npx playwright screenshot`.

If a delegate's log ends in `error: interrupted`, it was killed by a timeout —
relaunch it with `scripts/detach.py`.

**Delegates do not commit.** The orchestrator owns every commit, so the diff and the
message can be checked. Tell them in the brief: "edit files, do not run git".

**Delegates do not download assets.** No web fonts, no images, no vendored files into
`public/`. System font stacks only; artwork is hotlinked.

## Commit style

`phase N: <what shipped>` — one commit per verified phase, local only.
Never `git push`. Never deploy.
