# Project instructions — AGAIN RADIO

Read `docs/SPEC.md` before touching anything. It is the contract.

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
```

Screenshots (chromium is already cached):

```
npx playwright screenshot --viewport-size=1440,900 http://localhost:4321 .verify/desktop.png
npx playwright screenshot --viewport-size=390,844 http://localhost:4321 .verify/mobile.png
```

Then read the PNGs with the Read tool and judge them honestly. Fix what looks wrong.

## Commit style

`phase N: <what shipped>` — one commit per verified phase, local only.
Never `git push`. Never deploy.
