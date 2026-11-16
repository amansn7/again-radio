# STATUS — AGAIN RADIO

Updated 2026-11-17. Contract: `docs/SPEC.md`. Plan: `tasks/todo.md`. Conventions: `AGENTS.md`.

## Where it stands

Phase 0–5 shipped and verified; a design pass followed. Site is feature-complete for v1
(synced official YouTube embeds, 4 programmes, memory layer, hour strip, archive rail,
India tour countdown, 3 themes, generative field).

Latest commits:

```
acfd804 docs: record the design pass
13b8601 design: dim the field into a room, crossfade palettes, wire Instrument Sans/Serif, grain + vignette stage
80d6f42 fonts: self-host Instrument Sans + Instrument Serif (latin subset)
dc69abd docs: correct the curated line count
63bb624 phase 5: USB002 programme, archive rail, tour countdown, shared event contract
90e26a0 phase 3-4: memory layer, memory card, generative art field
```

## Verify (all green at last run)

```bash
npm run build            # exit 0
node scripts/verify.mjs  # ✓ data verified
node scripts/schedule.test.mjs  # ✓ schedule
```

Screenshots: `node scripts/shot.mjs <url> <out.png> [w] [h] [theme]` → `.verify/*.png`, then
read the PNGs and judge honestly.

## Run it

- Preview server currently detached on http://localhost:4321 (pid 86396,
  `.orchestrator/logs/preview.log`). Restart:
  `python3 scripts/detach.py .orchestrator/logs/preview.log npx astro preview --port 4321`
- Long commands / background work must use `scripts/detach.py` + `ps -p <pid>` polling
  (a bare `&` dies with the shell tool's process-group kill).

## Open work

1. **Remote access (next).** `cloudflared` exists at `~/.local/bin/cloudflared`; no
   `wrangler`, no Cloudflare credentials in env. Two paths:
   - Instant: `cloudflared tunnel --url http://localhost:4321` (ephemeral `trycloudflare.com`).
   - Proper: Cloudflare Pages (`npx wrangler pages deploy dist`) — needs one-time auth/token.
2. **24/7 YouTube live channel — blocked on rights, not code.** Streaming the catalogue
   continuously is unlicensed; the encoder (ffmpeg + launchd/systemd) can be built only for
   audio the operator owns or licenses. Do not build a re-stream of the embeds.
   Needs a human decision: licensed audio vs. keep embeds.
3. **Deploy** (Cloudflare Pages) — same credential dependency as 1.

## Traps learned

- `git clean -fd` in this repo deletes untracked content files (it once wiped
  `public/fonts/`). Commit new assets before handing off to another agent.
- `npx playwright screenshot` cannot run on this machine; use `scripts/shot.mjs`.
- Never re-stream or download YouTube audio; embeds only. Art is hotlinked, never stored.
- Field colours must stay derived from artwork and deepened toward night; a flat wash
  reading as "pastel slab" was rejected.
- The transport row sits on the dark stage: it uses fixed on-media colours, not theme vars.
