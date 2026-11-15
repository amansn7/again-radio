# Lessons

Rules learned from corrections. Append one line per mistake — specific, actionable.

- 2026-11-15 — backgrounding a delegate with `&` got it killed when the shell tool hit
  its timeout (process-group kill). Rule: always launch long delegates through
  `scripts/detach.py`, which starts a new session, and poll with `ps -p`.
- 2026-11-15 — `hourBlocks` coverage loop with `to: 24` never terminated (mod-24 wrap).
  Rule: bound every hour loop by a computed span, never by `h !== to`.
