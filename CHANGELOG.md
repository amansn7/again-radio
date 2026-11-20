# Changelog

Notable changes to AGAIN RADIO are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and project versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- New on the channel: a daily GitHub workflow finds new official music uploads and opens a pull request; once merged, the 20 newest play as one block in the rotation, older ones as their own slots, versions picked per week. First songs: five Official Indian Lyric Visualisers, including "ten".
- Rory's choices: after the first welcome a panel asks what Rory does (says hello, introduces songs, names what just played, shares thoughts mid-song, gives shout-outs and facts), with select/clear all; a mic button in the controls reopens it. Before this, Rory could not be turned off from the UI.
- Rory intros for every song in the catalogue, a second alternate intro for 153 songs, back-announces for every song and mid-song thoughts for 154.
- Listener shout-outs matched to the live listener count, station IDs and sourced facts between songs, about every five minutes.
- Time-of-day welcomes that never repeat the last one heard.
- Two-account ElevenLabs synthesis with a per-account credit reserve and rate-limit waits (`scripts/generate-jockey-audio.mjs`).
- Jockey e2e test (`scripts/jockey.e2e.mjs`) that runs against real YouTube playback on the live domain.
- High-fidelity 4-state motion graphics morphing engine for Rory voice transitions (`idle` ↔ `morph-to-speech` ↔ `speech` ↔ `morph-to-orb`) in `<radio-orb>`.
- Real-time WebGL distance field morphing between resting orb singularity core and undulating sinusoidal Siri speech waveforms with optical wavefront expansion and implosion (`.o-morph-ring`).
- Dynamic track artwork palette absorption (`uC1`..`uC4`) for vocal ribbon hues, accompanied by a breathing celestial luminescence aura (`.o-aura`) and an elongated acoustic capsule underglow (`.o-body`).
- Dedicated test suite for Rory voice transition states in `scripts/orb-transition.test.mjs`.

### Fixed

- Tapping the orb starts the disco ball again instead of making Rory speak.
- A fade-in racing a fade-out no longer leaves the fader stuck and navigation frozen.

### Changed

- Rory speaks only once YouTube is audibly playing; a jumped-to track is announced only when it plays.
- Music is ducked under Rory, never muted, and automatic track changes no longer cut Rory off.
- Re-recorded intros, thoughts and transitions with paced delivery and pauses.
- Calibrated voice wave intensity to maintain original shader baseline while respecting `prefers-reduced-motion`.

## [0.3.0] - 2026-11-20

### Added

- Custom liquid glass show selector (`<dial-select>`) matching the station aesthetic with frosted glass textures and responsive layout.
- Animated disco ball effect triggered on tune in.
- Full 19 live sets and 17 albums integrated into continuous radio rotation with complete tracklists (38 rotation slots, 36.4 h cycle).
- Expanded art hotlink support for official YouTube thumbnails (`i.ytimg.com`) for unreleased bootlegs alongside Cover Art Archive and iTunes.
- Phase 17 tour mode refinements: frosted tour hints, trimmed card reflections on mobile, and official USB002 release art.
- USB002 REMIXES tracklist and missing collaborations in the songs catalogue.
- Tabular digit slots and steady width for the India tour countdown clock to eliminate layout shift.
- Moving show-band signal connecting the current-time marker with the next concert.
- Cursor light feeding into the orb on pointer approach.

### Changed

- Guarded player API calls before YouTube IFrame readiness and added iframe focus rescue on `focusin`.
- Replaced temporary Bandcamp artwork links with official Cover Art Archive release assets.
- Matched the height of the social and support footer panels for a more balanced layout.
- Refined footer and show-band motion for reduced-motion users.
- Consolidated mobile background playback handling.

## [0.2.0] - 2026-11-18

### Added

- Search across the song and release catalog, with YouTube search links for tracks that
  are not currently playing.
- Shareable links to moments in a set, set landing pages, preview cards, and home-screen
  metadata.
- One-tap tune-in and India tour information in the station experience.
- Track-level production-credit ledger with evidence links, coverage counts, exclusions,
  and unresolved records.
- Regression coverage for searching “Hey Hey” and the `9 months & 50 hours` release.

### Changed

- Refined the first-screen hierarchy and mobile layout for the India launch.
- Improved mobile background playback reliability.
