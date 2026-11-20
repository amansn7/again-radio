# New on the Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New official music uploads on Fred again..'s YouTube channel are found daily, proposed as a pull request, and once merged play on air: the 20 newest songs as one "New on the channel" block in the rotation, older ones as standalone slots.

**Architecture:** A Node script reads the channel (upload feed; Videos tab on the first run), keeps music only, and appends to `public/data/new-music.json`. A daily GitHub Action runs it, checks and builds, and opens a PR. On the site, `src/lib/new-music.ts` turns the file into one-video programs, and `src/lib/rotation.ts` keeps the block's slots together as one unit in the per-cycle shuffle. The player already moves slot to slot, so it is untouched.

**Tech Stack:** Node 24 (runs `.ts` imports natively), Astro static site, `node:test`, GitHub Actions with `gh`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-20-new-on-channel-design.md`

## Global Constraints

- No new npm dependencies. Official YouTube embeds only; never download or re-host.
- Channel id `UCXF6DMVLIVRr2OQAqyfEGeg`. Feed: `https://www.youtube.com/feeds/videos.xml?channel_id=UCXF6DMVLIVRr2OQAqyfEGeg`.
- Music only: `classify()` gives `song` or `video`, duration 60–600 s inclusive, not a Short, title free of trailer/teaser/interview/documentary/film/summary/behind the scenes.
- First run (file absent): every music upload published in the last 90 days. Must include `yWp0keR3l9Q` ("ten").
- Block: the 20 newest songs (`BLOCK_SIZE = 20`), newest first, rest shuffled per cycle; older songs are standalone slots. Labels: "New on the channel" / "From the channel".
- Versions: all kept, one slot per song (key = cleaned song name, lowercased). **Version pick is seeded by week** (`floor((now − LIVE_EPOCH) / 604800)`), not by cycle: slot lengths must be fixed while a cycle is computed, and the player re-seeks on > 8 s drift (`DRIFT` in `player-yt.ts`). Update the spec's Versions line to say "per week".
- The bot never publishes: no deploy, no push to `main`, no Cloudflare secrets. PR from branch `bot/new-music`.
- Data shape: `{ "checked": "YYYY-MM-DD", "items": [ { youtubeId, title, artist, song, duration, published, addedAt } ] }`, items sorted by `published` descending.
- Commits: scoped conventional messages ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `git push` from the implementer.

## Review Focus

- YouTube returns a consent/error page or the network fails → the script exits non-zero and leaves `new-music.json` untouched (never empties it). Test in Task 2.
- `new-music.json` missing or malformed on the live site → `loadNewMusic()` returns `[]` and the rotation is exactly as before. Test in Task 3.
- A block of 0 or 1 songs → `cycleOrder` behaves as today / block of one has nothing to shuffle. Test in Task 4.
- A new video later goes private (lands in the player's `bad` set) → `slotAfter` skips that block slot like any other. Test in Task 4.
- Two uploads of the same song with different artist credits ("Fred again.., Jozzy & Jim Legxacy - ten (Official Indian Lyric Visualiser)" vs "Fred again.. & Jozzy - ten (Official Video)") → one song, two versions. Test in Task 3.

---

### Task 1: Shared channel helpers and the music filter

**Files:**
- Create: `scripts/lib/youtube-channel.mjs`
- Modify: `scripts/catalogue.mjs` (import the moved helpers instead of defining them)
- Test: `scripts/new-music.test.mjs`

**Interfaces:**
- Produces (all exported from `scripts/lib/youtube-channel.mjs`):
  - `CHANNEL = "UCXF6DMVLIVRr2OQAqyfEGeg"`, `H` (request headers), `html(url): Promise<string>`, `crawl(tab): Promise<{youtubeId,title,duration}[]>`, `classify(title, duration)`, `clean(title)` — moved verbatim from `catalogue.mjs`.
  - `splitTitle(title: string): { artist: string; song: string }`
  - `songKey(title: string): string`
  - `isMusic(v: { title: string; duration: number }): boolean`

- [ ] **Step 1: Write the failing tests** in `scripts/new-music.test.mjs`:

```js
test("splitTitle", () => {
  assert.deepEqual(splitTitle("Fred again.., Jozzy & Jim Legxacy - ten (Official Indian Lyric Visualiser)"),
    { artist: "Fred again.., Jozzy & Jim Legxacy", song: "ten" });
  assert.deepEqual(splitTitle("Fred again.. - Delilah (pull me out of this) [Official Video]"),
    { artist: "Fred again..", song: "Delilah (pull me out of this)" });
  assert.deepEqual(splitTitle("adore u"), { artist: "Fred again..", song: "adore u" });
});
test("songKey groups versions", () => {
  assert.equal(songKey("Fred again.., Jozzy & Jim Legxacy - ten (Official Indian Lyric Visualiser)"),
    songKey("Fred again.. & Jozzy - ten (Official Video)"));
});
test("isMusic", () => {
  assert.ok(isMusic({ title: "Fred again.., Jozzy & Jim Legxacy - ten (Official Indian Lyric Visualiser)", duration: 190 }));
  assert.ok(!isMusic({ title: "Fred again.. - ten (Official Video)", duration: 45 }), "under 60 s");
  assert.ok(!isMusic({ title: "Fred again.. Boiler Room London", duration: 4300 }), "a set");
  assert.ok(!isMusic({ title: "USB002 tour film (Official Trailer)", duration: 120 }), "a trailer");
  assert.ok(!isMusic({ title: "Fred again.. interview with Zane Lowe", duration: 500 }), "an interview");
});
```

- [ ] **Step 2: Run** `node --test scripts/new-music.test.mjs` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** Move the helpers out of `catalogue.mjs` unchanged. `splitTitle`: text before the first ` - ` is the artist (default `"Fred again.."` when there is none); the rest, with a trailing `(…)`/`[…]` containing official|video|visuali[sz]er|lyric|audio removed, is the song. `songKey` = `splitTitle(title).song.toLowerCase().trim()`. `isMusic` per Global Constraints.
- [ ] **Step 4: Run** the test file — Expected: PASS. `node --check scripts/catalogue.mjs` — Expected: no output.
- [ ] **Step 5: Commit** `refactor: share channel helpers; add the music filter`.

### Task 2: Detection script and data checks

**Files:**
- Create: `scripts/new-music.mjs`, `scripts/fixtures/channel-feed.xml`
- Modify: `scripts/verify.mjs` (validate `new-music.json`)
- Test: `scripts/new-music.test.mjs`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces:
  - `parseFeed(xml: string): { youtubeId: string; title: string; published: string }[]` (`published` = `YYYY-MM-DD`)
  - `run(opts: { fetchText: (url: string, init?: RequestInit) => Promise<{ status: number; text: string }>; today: string; dataDir: string; known: Set<string>; listVideos?: () => Promise<{ youtubeId: string; title: string; duration: number | null }[]> }): Promise<string[]>` — `listVideos` defaults to `() => crawl("videos")` and is used only on the first run — returns titles added; writes `<dataDir>/new-music.json` only when something was added or the file was absent.
  - CLI: `node scripts/new-music.mjs` uses real `fetch`, `public/data`, and known ids from every program + `catalogue.json`. Prints one added title per line; when `GITHUB_OUTPUT` is set, appends `added=<count>`.

- [ ] **Step 1: Save the fixture:** fetch the feed URL once into `scripts/fixtures/channel-feed.xml` (Node `fetch` in a one-off command; the file is public metadata).
- [ ] **Step 2: Write the failing tests:**
  - `parseFeed` on the fixture returns ≥ 1 item, every id matches `/^[\w-]{11}$/`, dates match `/^\d{4}-\d\d-\d\d$/`.
  - `run` with a fake `fetchText` (feed → 2 entries: one music id `aaaaaaaaaaa`, one Short `bbbbbbbbbbb`; `/shorts/bbbbbbbbbbb` → status 200, `/shorts/aaaaaaaaaaa` → 303; watch page for `aaaaaaaaaaa` contains `"lengthSeconds":"190"`, `"uploadDate":"2026-11-18"`, `"channelId":"UCXF6DMVLIVRr2OQAqyfEGeg"`) and an existing file → adds exactly `aaaaaaaaaaa` with `song`, `artist`, `addedAt === today`; second call adds nothing and leaves the file byte-identical.
  - A watch page whose `channelId` is another channel → not added.
  - `fetchText` that throws, or returns a page without `lengthSeconds` → `run` rejects and the existing file is byte-identical.
  - File absent → first run uses the injected `listVideos` (3 videos: published 10, 80 and 120 days before `today` per their watch pages) and keeps only the first two.
- [ ] **Step 3: Run** the tests — Expected: FAIL.
- [ ] **Step 4: Implement** `scripts/new-music.mjs`. Shorts: `fetchText("https://www.youtube.com/shorts/<id>", { redirect: "manual" })` status 200 ⇒ Short. Watch page: `"lengthSeconds":"(\d+)"`, `"uploadDate":"(\d{4}-\d\d-\d\d)` (fallback `"publishDate"`), `"channelId":"(UC[\w-]{22})"`. Missing fields ⇒ throw (Review Focus). Build all new items in memory, write once at the end, items sorted by `published` desc, `checked = today`.
- [ ] **Step 5: Extend `verify.mjs`:** if `public/data/new-music.json` exists, fail on: bad/duplicate `youtubeId`, id also used by a program or `catalogue.json`, empty `title`/`artist`/`song`, `duration` not an integer in 60–600, `published`/`addedAt` not `YYYY-MM-DD`.
- [ ] **Step 6: Run** `node --test scripts/new-music.test.mjs && node scripts/verify.mjs` — Expected: PASS, `✓ data verified`.
- [ ] **Step 7: Commit** `data: find new music on the official channel`.

### Task 3: New music on the site

**Files:**
- Create: `src/lib/new-music.ts`
- Modify: `src/components/search.ts` (search also covers new music)
- Test: `scripts/new-music.test.mjs`

**Interfaces:**
- Produces:
  - `interface NewMusicItem { youtubeId; title; artist; song; duration; published; addedAt }` (all `string` except `duration: number`)
  - `parseNewMusic(raw: unknown): NewMusicItem[]` — drops invalid items, never throws
  - `loadNewMusic(): Promise<NewMusicItem[]>` — `[]` on any fetch/parse failure
  - `BLOCK_SIZE = 20`
  - `songGroups(items: NewMusicItem[]): NewMusicItem[][]` — grouped by `song.toLowerCase().trim()`, groups ordered by newest `published` (tie: `addedAt`), newest first
  - `pickVersion(group: NewMusicItem[], week: number): NewMusicItem` — seeded by `week` and the song key, stable for a given week
  - `newMusicPrograms(items: NewMusicItem[], nowSec: number): { fresh: Program[]; graduated: Program[] }` — first `BLOCK_SIZE` groups → `fresh` (title/venue "New on the channel"), rest → `graduated` ("From the channel"). Program: `id: "new-<youtubeId>"`, `youtubeId`, `duration`, `date: published`, one `track` entry `{ offset: 0, duration, title: song, artist, art: "https://i.ytimg.com/vi/<id>/hqdefault.jpg" }`.
  - `newMusicCatalogue(items: NewMusicItem[]): CatalogueItem[]` — `kind: "song"`, `song`, `channel: "Fred again.."`, `published`.

- [ ] **Step 1: Write the failing tests:** `parseNewMusic({ items: [good, { youtubeId: "x" }] })` → 1 item; `parseNewMusic(null)` → `[]`. The two "ten" uploads form one group of two. 22 songs → 20 `fresh`, 2 `graduated`, `fresh[0]` is the newest. `pickVersion(group, 5)` equals itself on repeat; across weeks 0–20 both versions appear.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `src/lib/new-music.ts`, reusing `fetchJson` from `station.ts` and `LIVE_EPOCH` from `schedule.ts` for the week number. In `search.ts`, append `newMusicCatalogue(await loadNewMusic())` to the catalogue it already loads (inside the existing `Promise.allSettled`).
- [ ] **Step 4: Run** tests — Expected: PASS. Run `npm run build` — Expected: exit 0.
- [ ] **Step 5: Commit** `new music: programs, versions and search`.

### Task 4: The block in the rotation

**Files:**
- Modify: `src/lib/rotation.ts`
- Test: `scripts/rotation.test.mjs`

**Interfaces:**
- Consumes: `newMusicPrograms`, `loadNewMusic` (Task 3).
- Produces:
  - `Slot` gains `block?: true`.
  - `buildSlots(programs, videos, fresh: Program[] = [], graduated: Program[] = []): Slot[]` — `graduated` added like `videos`; `fresh` appended last, in order, each with `block: true`.
  - `cycleOrder(n: number, cycle: number, block: readonly number[] = []): number[]` — shuffle units (each non-block index, plus the block as one unit) with `rng(cycle + 1)`; expand the block as `[block[0], ...shuffled(block.slice(1), rng(cycle + 7919))]`; keep the seam rule on units.
  - `liveSlot(lengths, nowSec, epochSec = LIVE_EPOCH, block: readonly number[] = [])`; `slotAfter` and `onAirNow` derive `block` from `slots` (indices with `block`, array order).
  - `loadSlots()` also loads new music and passes `newMusicPrograms(items, Date.now() / 1000)`.

- [ ] **Step 1: Write the failing tests** (same `fail(...)` style as the file): with 5 normal slots + block `[5, 6, 7]`, for cycles 0–50 the block indices are contiguous in `cycleOrder`, start with `5`, every index appears exactly once, and the seam rule holds; `block = []` gives exactly the old order for cycles 0–50 (compare with a copy of today's function); a block of one is contiguous trivially; `slotAfter` with block slot `6` in `bad` goes from `5` to `7`; the real-data check includes `public/data/new-music.json` (if present) and every song airs.
- [ ] **Step 2: Run** `node scripts/rotation.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** in `rotation.ts`.
- [ ] **Step 4: Run** every unit test: `for t in scripts/*.test.mjs; do node "$t" || exit 1; done` and `node scripts/verify.mjs --selftest` — Expected: all pass. `npm run build` — exit 0.
- [ ] **Step 5: Commit** `rotation: new music airs as one block; older songs as their own slots`.

### Task 5: Daily workflow, first run, docs

**Files:**
- Create: `.github/workflows/new-music.yml`, `public/data/new-music.json` (by running the script)
- Modify: `README.md` (section under "Rory, the Host": "New on the channel"), `CHANGELOG.md` (Unreleased → Added), `docs/superpowers/specs/2026-11-20-new-on-channel-design.md` (Versions: per week, with the drift reason)

- [ ] **Step 1: Write the workflow:** triggers `schedule: cron "17 3 * * *"` and `workflow_dispatch`; `permissions: { contents: write, pull-requests: write }`; `ubuntu-latest`, `actions/setup-node` Node 24, `env: PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: 1`. Steps: checkout → `npm ci` → `node scripts/new-music.mjs` (id `find`) → if `steps.find.outputs.added != '0'`: `node scripts/verify.mjs`, all unit tests, `npm run build`, then `git switch -C bot/new-music`, commit as `github-actions[bot]`, `git push -f origin bot/new-music`, `gh pr create --base main --head bot/new-music --title "New on the channel: <titles>" --body <one line per song with https://youtu.be/<id>>` or `gh pr edit` when it exists. No deploy step, no secrets beyond `GITHUB_TOKEN`.
- [ ] **Step 2: Validate the YAML:** `node -e "require('fs').readFileSync('.github/workflows/new-music.yml','utf8')"` plus a careful read; `actionlint` if installed.
- [ ] **Step 3: First run locally:** `node scripts/new-music.mjs` — Expected: prints added titles including "ten"; `node scripts/verify.mjs` passes; `grep -c yWp0keR3l9Q public/data/new-music.json` → `1`.
- [ ] **Step 4: See it on air:** `npm run build`, preview, use search for "ten" and cue it; screenshot 390×844 and 1440×900 with `scripts/shot.mjs`; credit line reads "New on the channel". Run `node scripts/jockey.e2e.mjs http://localhost:4321` — Expected: all pass.
- [ ] **Step 5: Docs:** README section (what it does, that the bot only opens a PR, how to run it by hand), CHANGELOG entry, spec Versions line.
- [ ] **Step 6: Commit** `new music: daily pull request, first songs, docs`.
- [ ] **Step 7: Owner steps (report, do not do):** push; in GitHub repo Settings → Actions → General enable "Allow GitHub Actions to create and approve pull requests"; run the workflow once from the Actions tab; after merging a bot PR, pull and deploy as usual.
