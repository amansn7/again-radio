# "New on the channel" — design (2026-11-20)

## Intent
When Fred again.. posts new music on the official YouTube channel (e.g. `yWp0keR3l9Q`, "Fred
again.., Jozzy & Jim Legxacy - ten (Official Indian Lyric Visualiser)"), AGAIN RADIO picks it
up by itself and plays it on air, without anyone running a script or rebuilding by hand.

## Goals
- New official music uploads are proposed within about a day, and go on air once the owner
  merges and deploys.
- They play in their own rotating program, "New on the channel", which takes its turn on the
  shared clock like any set. Newest song first each time the program comes round; the rest in a
  per-cycle shuffle (same for every listener, as the rest of the station).
- Every addition is a pull request that passed `verify.mjs` and a build before the owner sees it.

## Non-goals
- Squeezing *new* songs in between sets (rejected option B), or search-only (option C). Older
  songs do end up between sets, by design (see Graduation).
- Re-hosting or downloading anything: official embeds only (Rights in `AGENTS.md`).
- Rory intros for new songs (no credits until 19–20 Dec); Rory simply doesn't introduce them.
- Tracking other channels (labels, Boiler Room, NPR).

## Anti-goals
- A non-music upload (Short, trailer, film, interview, stream summary) going on air.
- A bad run (YouTube layout change, network error) breaking or emptying the live site.
- The bot silently rewriting existing programs or the hand-curated catalogue entries.

## Constraints
- Static Cloudflare Pages site; data is files in `public/data`, fetched at runtime.
- Today every program is one YouTube video; a rotation slot is "a stretch of one video"
  (`src/lib/rotation.ts`), and the player already moves slot to slot with `loadVideoById`.
- Rotation order is `cycleOrder(n, cycle)`: a seeded shuffle of slots per cycle, so all
  listeners share the broadcast. Adding slots reshuffles the clock (already true today when
  the catalogue grows).
- No new npm dependencies. Deploy uses `wrangler@3.99.0` (pinned for macOS 12; fine on Linux).
- Channel id `UCXF6DMVLIVRr2OQAqyfEGeg`. `scripts/catalogue.mjs` already crawls the channel
  and classifies videos (`classify()`); it is run by hand today.

## Approaches
- **A. Daily GitHub Action (picked).** Data stays reviewed files in the repo, `verify.mjs` gates
  every change, free. Cost: up to a day's delay, plus the owner's merge and deploy.
- B. Cloudflare Worker cron writing to KV. Live within the hour, but a second source of truth
  outside the repo that skips the checks.
- C. Cron on the owner's Mac. Simplest, but only runs while the Mac is awake.

## Design
### 1. Detection — `scripts/new-music.mjs`
- Read the channel's upload feed `https://www.youtube.com/feeds/videos.xml?channel_id=…`
  (latest ~15 uploads, no key). Run daily, so 15 is ample.
- For each id not already known (in `public/data/new-music.json` or any program/catalogue):
  - Skip Shorts (`/shorts/<id>` resolves without redirect to a watch page).
  - Get duration and upload date from the watch page (as `catalogue.mjs` does) and confirm the
    channel via oEmbed `author_url`.
  - Keep only music: `classify()` says `song` or `video`, duration 60–600 s, title not matching
    film/trailer/interview/summary words. Reuse `classify()` and `clean()` by moving them to a
    shared module rather than copying.
- Append kept items to `public/data/new-music.json`:
  `{ youtubeId, title (raw), song (cleaned), duration, published, addedAt }`.
- Never edits programs, `catalogue.json` or `station.json`.
- **First run (owner's call):** the feed only holds ~15 uploads, so the first run also reads the
  channel's Videos tab (as `catalogue.mjs` does) and adds every music upload from the last 90
  days. "ten" (`yWp0keR3l9Q`) must be among them. Later runs use the feed only.

### 2. On air — rotation block
- `loadSlots()` also loads `new-music.json`. Each item becomes a one-video program via
  `videoProgram()` with venue "New on the channel" and art `i.ytimg.com/vi/<id>/hqdefault.jpg`.
- In `buildSlots`/`cycleOrder`, the new-music slots form **one unit** in the per-cycle shuffle,
  so they air back to back as a block. Inside the block: newest first, then a seeded shuffle by
  cycle. No player change is needed: slot-to-slot advance already loads the next video.
- The block holds the 20 newest songs (≈ an hour; Claude's call, owner can change the number).
- **Graduation (owner's call):** a song pushed out of the block by newer ones moves into the
  general rotation as its own short slot (all its versions, one picked per cycle as above),
  shuffled between sets like any other slot. Its venue label becomes "From the channel".
  Nothing ever leaves the air. As songs graduate the clock grows by a few minutes each;
  `cycleOrder`'s seam rule still applies.
- Labels: program title "New on the channel", each entry titled with the cleaned song name.
- **Versions (owner's call):** several uploads of one song (e.g. a lyric visualiser, later the
  official video) keep every version in `new-music.json`, grouped by cleaned song name. The block
  has one slot per song; which version plays is picked by the cycle's seeded random, so every
  listener hears the same version in a given cycle and it varies from cycle to cycle. A song's
  place in "newest first" uses its newest upload.

### 3. Schedule — `.github/workflows/new-music.yml`
- **Owner's call: the bot never publishes.** It proposes; the owner merges and deploys as today.
- Cron once a day (and `workflow_dispatch` for manual runs). Ubuntu, Node LTS.
- Steps: checkout → `node scripts/new-music.mjs` → if `new-music.json` changed:
  `node scripts/verify.mjs` → `npm ci && npm run build` (proves it builds) → push branch
  `bot/new-music` and open (or update) one pull request titled "New on the channel: <titles>",
  listing each song with its YouTube link so the owner can check it is real music.
- No deploy, no push to `main`, no Cloudflare secrets in GitHub. Only `GITHUB_TOKEN` with
  `contents: write` and `pull-requests: write`.
- GitHub notifies the owner of the PR; a failed run fails the workflow (GitHub emails the owner).
- After merging, the owner pulls and deploys with the usual command.

### 4. Checks
- `verify.mjs` validates `new-music.json` (ids, durations, channel, no duplicates with programs).
- Unit tests: music filter on real titles (ten visualiser kept; a Short, a trailer, a 2-hour
  set dropped); block ordering (block contiguous, newest first, same order for a given cycle);
  the 21st-newest song is a standalone slot outside the block; version pick is stable per cycle.
- Feed parsing tested on a saved feed fixture, not the network.

## Left to the builder
- How `cycleOrder` treats a unit (wrapping indices vs. a nested order); keep the seam rule.
- Exact Shorts detection and title filters, guided by the fixtures.
- Workflow details (caching, Node version), commit author identity for the bot.
