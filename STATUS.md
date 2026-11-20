# STATUS — AGAIN RADIO

Updated 2026-11-20. Contract: `docs/SPEC.md`. Plan: `tasks/todo.md`. Conventions: `AGENTS.md`.

## Where it stands

Current goal: India launch (design `docs/superpowers/specs/2026-11-18-india-launch-design.md`).
Phases 14 (first screen), 15 (search finds the canon), 16 (share the moment), and 17 (tour mode
& visual polish) are shipped.

Recent interaction & catalog polish:
- **Liquid glass show selector**: custom `<dial-select>` with frosted glass textures and responsive layout.
- **Tune-in celebration**: animated disco ball trigger on sound unmute.
- **Full catalogue rotation**: all 19 live sets and 17 releases in continuous 24-hour broadcast rotation (38 slots, 36.4 h cycle).
- **Tour mode (Phase 17)**: frosted tour hints, trimmed reflections on mobile, official USB002 cover art, and tabular slot layout for countdown digits.
- **Player resilience**: guarded YouTube IFrame calls before player readiness and focus rescue on `focusin`.
- **Rory voice animation motion graphics morphing**: high-fidelity 4-state transformation (`idle` ↔ `morph-to-speech` ↔ `speech` ↔ `morph-to-orb`) using dynamic WebGL Siri wave progress morphing (`uProgress`), acoustic shockwave burst and implosion rings (`.o-morph-ring`), fluid aperture deformation, vocal luminescence aura (`.o-aura`), and harmonic palette harmonization.
- **YouTube Live Tracker & Auto-Start**: tracks Fred again..'s official channel (`UCXF6DMVLIVRr2OQAqyfEGeg`) for scheduled premieres/live streams via `worker/presence` `/live-stream` and `scripts/live-tracker.mjs`. Shows scheduled countdown pill in `<live-status>` and timeline pin in `<show-band>`, and automatically starts the live stream via YouTube IFrame with smooth crossfade when the broadcast begins.

Phase 0–17 shipped and verified; design v3 is deployed live on Cloudflare Pages
(https://again-radio.pages.dev) with Cloudflare Worker + Durable Object for real-time
presence (again-radio-presence.again-radio-listeners.workers.dev).

Latest commits:

```
3054027 tune-in: trigger disco ball animation on tune in
abec4b3 dial: custom liquid glass show selector matching aesthetic
b997745 fix: guard player calls before ready and rescue iframe focus on focusin
2971164 test: update ui check off-air search target
e9ebcb8 data: bring all 19 shows and 17 albums into radio rotation with full tracklists
fe8886f data: add USB002 REMIXES tracklist and fix missing collabs
d7156cd phase 17: frost tour hint and trim card reflections
```

## Verify (all green at last run)

```bash
npm run build            # exit 0
node scripts/verify.mjs  # ✓ data verified
for t in scripts/*.test.mjs; do node "$t"; done   # ✓ each
node scripts/ui.check.mjs http://127.0.0.1:4321   # ✓ ui (needs dev server)
```

Screenshots: `node scripts/shot.mjs <url> <out.png> [w] [h] [theme]` → `.verify/*.png`, then
read the PNGs and judge honestly.

## Run it

- Dev server (live reload) detached on http://127.0.0.1:4321, log `.orchestrator/logs/dev.log`.
  Restart: `python3 scripts/detach.py .orchestrator/logs/dev.log npx astro dev --host 127.0.0.1 --port 4321`
- Public URL: `cloudflared tunnel --url http://127.0.0.1:4321` (detached, log
  `.orchestrator/logs/tunnel.log`). Quick-tunnel URLs change on every restart; HMR works through it.
- Long commands / background work must use `scripts/detach.py` + `ps -p <pid>` polling
  (a bare `&` dies with the shell tool's process-group kill).

## Open work

1. **Remote access & Deploy — Shipped.**
   - Cloudflare Pages: live at https://again-radio.pages.dev.
   - Presence Worker: live at again-radio-presence.again-radio-listeners.workers.dev.
2. **24/7 YouTube live channel — blocked on rights, not code.** Streaming the catalogue
   continuously is unlicensed; the encoder (ffmpeg + launchd/systemd) can be built only for
   audio the operator owns or licenses. Do not build a re-stream of the embeds.
   Needs a human decision: licensed audio vs. keep embeds.

## Traps learned

- `git clean -fd` in this repo deletes untracked content files (it once wiped
  `public/fonts/`). Commit new assets before handing off to another agent.
- `npx playwright screenshot` cannot run on this machine; use `scripts/shot.mjs`.
- Never re-stream or download YouTube audio; embeds only. Art is hotlinked, never stored.
- Field colours must stay derived from artwork and deepened toward night; a flat wash
  reading as "pastel slab" was rejected.
- Hero legibility on bright frames (USB002 yellow wall): a dark pool/shadow behind the hero
  text was tried and rejected as not nice. Current answer is the 55% mid scrim; leave it.
- The transport row sits on the dark stage: it uses fixed on-media colours, not theme vars.
