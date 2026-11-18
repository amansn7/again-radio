# STATUS — AGAIN RADIO

Updated 2026-11-18. Contract: `docs/SPEC.md`. Plan: `tasks/todo.md`. Conventions: `AGENTS.md`.

## Where it stands

Current goal: India launch (design `docs/superpowers/specs/2026-11-18-india-launch-design.md`).
Phases 14 (first screen), 15 (search finds the canon) and 16 (share the moment) shipped;
next: phase 17 (tour mode). New sets need `node scripts/og.mjs` + rebuild for their share card.

Recent interaction polish: the cursor feeds light toward the orb on desktop; the show band
sweeps light from the now marker toward the next concert; the socials and support panels
share a consistent height. These details respect reduced-motion preferences.

Phase 0–6 shipped and verified; design v3 is deployed live on Cloudflare Pages
(https://again-radio.pages.dev) with Cloudflare Worker + Durable Object for real-time
presence (again-radio-presence.again-radio-listeners.workers.dev).

Latest commits:

```
b86ce6b Add motion to show band and polish cursor
3d24c8f Add orb cursor feed and align footer panels
5b105bc Polish orb motion, text fit, and footer sizing
c66f97a Improve startup and align footer actions
782ffba Start dial motion immediately and cue orb interaction
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
