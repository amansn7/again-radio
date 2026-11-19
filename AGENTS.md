# Project instructions — AGAIN RADIO

Read `STATUS.md` first for current state, open work and traps. Read `docs/SPEC.md` before
touching anything. It is the contract.

Current goal: **India launch**. Phases 14–17 (first screen, search, moment sharing,
tour mode) are live before Delhi on 5 Dec. Design:
`docs/superpowers/specs/2026-11-18-india-launch-design.md`. Source review:
`docs/REVIEW-ux.md`. Next: tour execution and show nights (`docs/show-night.md` /
`public/data/setlists.json`). Anything in the design's Non-goals waits until after the tour.

- Phone first. 390×844 is the primary screenshot. 1440×900 must not regress.
- Facts shown to fans (samples, setlists, show times, gates) carry a source URL in the data,
  or the UI omits them.

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
- Hotlink artwork (Cover Art Archive / iTunes / official YouTube thumbnails `i.ytimg.com` for bootlegs and sets). Never store or cache images.
- Write memory copy yourself. Never copy sentences from interviews or press.
- Keep the "fan project, not affiliated" footer.

## Commands

```
npm run build                       # must exit 0
npm run preview                     # local preview for screenshots
node scripts/verify.mjs             # data + structure checks
node scripts/verify.mjs --selftest  # pure-logic checks
for t in scripts/*.test.mjs; do node "$t"; done   # unit test suite
node scripts/ui.check.mjs http://localhost:4321   # UI check (needs dev server)
```

Screenshots — `npx playwright screenshot` **does not work here**: playwright 1.65 refuses
to install chromium on macOS 12 and the cached headless shell is an older revision. Use
the repo-local helper instead, which drives the cached shell:

```
node scripts/shot.mjs http://localhost:4321 .verify/desktop.png 1440 900
node scripts/shot.mjs http://localhost:4321 .verify/mobile.png 390 844
```

Then read the PNGs with the Read tool and judge them honestly. Fix what looks wrong.

## Delegation mechanics

The shell tool kills its whole process group when a call times out, so a bare `cmd &`
dies with it. Never background with `&`. Detach instead — it starts a new session:

```bash
python3 scripts/detach.py .orchestrator/logs/<unit>.log sh -c \
  'agy --print "Read .orchestrator/briefs/<unit>.md and execute it." \
   --model claude-sonnet-4-6 --mode accept-edits; echo "EXIT:$?"'
```

It prints a pid. Poll it without blocking:

```bash
ps -p <pid> > /dev/null && echo running || echo done
```

For long synchronous commands pass a generous `timeout` to the shell tool
(600000 ms): `npm install`, `npm run build`, `node scripts/shot.mjs`.

If a delegate's log ends in `error: interrupted`, it was killed by a timeout —
relaunch it with `scripts/detach.py`.

**Delegates do not commit.** The orchestrator owns every commit, so the diff and the
message can be checked. Tell them in the brief: "edit files, do not run git".

**Delegates do not download assets.** No web fonts, no images, no vendored files into
`public/`. System font stacks only; artwork is hotlinked.

**Audit `git status` before committing.** Ensure untracked files and data are reviewed
prior to phase or feature commits.

## Commit style

`phase N: <what shipped>` — one commit per verified phase, or scoped conventional
commits (`data:`, `dial:`, `tune-in:`, `fix:`, `test:`) for focused improvements.
Local only. Never `git push`.

## Deploy

Each phase ships live once its gate passes and it is committed. Only the orchestrator
deploys. Delegates never do.

```
npm run build && npx wrangler@3.99.0 pages deploy dist --project-name again-radio
```

wrangler 3.99.0 is pinned because newer versions refuse to start on macOS 12.6. After a
deploy, screenshot https://again-radio.pages.dev at 390×844 and check it. If the live site
breaks, redeploy the previous commit's `dist` before fixing forward. The presence Worker is
not redeployed unless a phase changes it.
