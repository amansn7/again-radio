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
