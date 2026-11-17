<div align="center">

# AGAIN RADIO

**24 hours of a life in progress.**  
*A synchronized, always-on fan broadcast for Fred again..'s catalogue, where every track carries the memory it came from.*

[![Live Broadcast](https://img.shields.io/badge/Status-24%2F7_Synced_Broadcast-10b981?style=flat-square)](https://again-radio.pages.dev)
[![Astro](https://img.shields.io/badge/Astro-5.x-BC52EE?style=flat-square&logo=astro&logoColor=white)](https://astro.build)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38B2AC?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers_%26_DO-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![License](https://img.shields.io/badge/License-MIT-gray?style=flat-square)](LICENSE)

[**Live Station**](https://again-radio.pages.dev) &nbsp;•&nbsp; [**The Philosophy**](#the-philosophy-one-voice-then-a-room) &nbsp;•&nbsp; [**Architecture**](#architecture) &nbsp;•&nbsp; [**Memory Layer**](#the-memory-layer) &nbsp;•&nbsp; [**Controls**](#keyboard-controls) &nbsp;•&nbsp; [**Development**](#quick-start)

---

</div>

## The Philosophy: One Voice, Then a Room

Fred again..'s music runs in one direction. It starts small and private: a voice note on a phone, a stranger recorded on a night bus, a friend’s laughter, the span of months an album was lived in. Then it is carried into a room until thousands of strangers are singing a line that was never originally meant for them. The intimate becomes communal without ever losing its vulnerability.

**AGAIN RADIO** is engineered from that same thesis:
- **Fragments, not feeds.** Content arrives one piece at a time — a sampled voice, a date range, a line of memory.
- **Words are light.** Just as phrases are projected huge at Fred's shows, the name of the person behind each track commands the room, arriving word-by-word.
- **The room breathes.** An ambient generative fabric pulses underneath everything, displaced by 2D noise and synchronized to the current track's BPM.
- **Everyone hears the exact same moment.** It is an authentic live radio, not a personal playlist. Every listener across the globe shares the same playback second.

---

## Highlights

### 📻 Synchronized Global Broadcast
- **Epoch-Synced Playback**: Station rotation loops from a fixed epoch (`2026-01-01T00:00:00Z`). Playback position is computed deterministically:  
  $$\text{position} = (\text{now} - \text{epoch}) \pmod{\text{totalRotationDuration}}$$
- **$O(\log N)$ Binary Search Schedule**: Instant track and offset resolution inside multi-hour shows using `schedule.ts`.
- **Zero-Latency "Back to Live"**: Explore tracklists or archive sets freely; return to the synchronized live broadcast with a single tap or keypress (`L`).

### 🏷️ The Memory Layer
Every song is anchored to the human fragment it was born from:
- **Sample Attribution**: Automatic extraction of real names from parenthetical track titles (e.g., *Kammy*, *Danielle*, *Delilah*, *Kyle*).
- **Date Range Stamps**: Formatted lifespans from album eras rendered as vintage camera date stamps (e.g., `JAN 1 — SEP 9 2022`).
- **Curated & Generative Memory Lines**: Curated original prose for celebrated moments, paired with honest, non-hallucinated fallbacks for deep catalog cuts.

### 🎨 The Living Fabric & Palette Engine
- **Artwork Palette Extraction**: Samples colors from high-resolution album artwork at runtime using `OffscreenCanvas` in `palette.ts`.
- **Registered CSS `@property` Interpolation**: Dynamic palette variables (`--art-1`, `--art-2`, `--art-3`, `--art-accent`) crossfade smoothly without frame drops.
- **BPM Beat Clock**: Ambient noise fabric swells and breathes with the track’s tempo, sending expanding ripple shockwaves across the viewport on track transitions.

### 🌓 Dual Aesthetic Universes

The station reflects the two halves of Fred's creative world:

| Aspect | `diary` &mdash; **Diary** (The Fragment) | `sleek` &mdash; **Rave** (The Room) |
|---|---|---|
| **Medium** | Back of an old photograph, notebook margin, voice memo | The room at the show, stage spotlights, LED walls |
| **Ground** | Textured paper tinted subtly by album artwork | Deep, dark ground pulled from shadowed art tones |
| **The Fabric** | Fine ink threads, ruled notebook lines | Additive LED strands with soft volumetric glow |
| **Name Type** | *Instrument Serif*, sentence case, tight leading | **Instrument Sans 600**, tight tracking |
| **Video Frame** | White photograph border with paper shadow | Borderless projection with ambient color bloom |
| **Memory Line** | Serif italic caption, fading in like ink drying | Projected transcript lighting up word by word |
| **Date Stamp** | Vintage camera orange-red imprint (`'22 7 29`) | Tabular sans-serif numerals, subdued |

---

## Complete Catalogue & Programs

AGAIN RADIO streams across extensive continuous sets and multi-year eras:
- **Boiler Room: London** (2022-07-29) &mdash; 71 minutes of genre-defining energy.
- **Rooftop Live (Arun's Roof)** &mdash; Intimate acoustic sessions and early voice notes.
- **Alexandra Palace** &mdash; Massive arena set with Bangalter, Skrillex & Four Tet eras.
- **Rooftop Naples** &mdash; Sun-drenched open-air live electronics.
- **USB002 Every Show** &mdash; Comprehensive 108-hour archival rail traversing 20+ live shows from 2019 to 2026.
- **Tour Radar** &mdash; Live countdowns to upcoming tour stops (Delhi, Mumbai, Bengaluru).

---

## Real-Time Presence

AGAIN RADIO displays the count of concurrent listeners tuned in around the world.
- Powered by a lightweight **Cloudflare Worker** paired with a **Durable Object** (`worker/presence`).
- WebSocket connections are aggregated with a debounced 1000ms broadcast cycle.
- **No data stored. No listener tracking.** The count is real or hidden &mdash; never fabricated.

---

## Keyboard Controls

Navigate the station without taking your hands off the keyboard:

| Key | Action |
|:---:|---|
| <kbd>Space</kbd> | Play / Pause playback |
| <kbd>M</kbd> | Mute / Unmute audio |
| <kbd>→</kbd> | Jump to next track in the running order |
| <kbd>←</kbd> | Jump to previous track in the running order |
| <kbd>L</kbd> | Resync back to the live global broadcast |
| <kbd>/</kbd> | Open the instant catalogue search sheet |

---

## Architecture

```mermaid
flowchart TD
    subgraph Client ["Client Browser (Astro + Vanilla TS Islands)"]
        UI["UI Layer<br/>(NowPlaying, MemoryCard, Tracklist, Hero)"]
        Fabric["Generative Fabric<br/>(Canvas 2D, Noise, Beat Clock)"]
        EventBus["Event Contract<br/>(radio:track, radio:time, radio:cue, radio:live)"]
        Palette["Palette Engine<br/>(OffscreenCanvas, CSS @property)"]
        YT["YouTube IFrame API<br/>(Fixed Background Embed)"]
    end

    subgraph Data ["Static Public Data (public/data/*.json)"]
        Station["station.json<br/>(Rotation & Hour Blocks)"]
        Programs["programs/*.json<br/>(Tracks, Offsets, Durations, BPM)"]
        Catalogue["catalogue.json & albums.json<br/>(Archive & Discography)"]
    end

    subgraph Cloudflare ["Cloudflare Edge"]
        Pages["Cloudflare Pages<br/>(Static Site Delivery)"]
        PresenceWorker["Cloudflare Worker + Durable Object<br/>(worker/presence WebSocket Ticker)"]
    end

    Station -->|Fetch at runtime| EventBus
    Programs -->|Binary Search schedule.ts| EventBus
    Catalogue -->|Search index| UI
    PresenceWorker <-->|WebSocket listener count| UI
    EventBus <--> UI
    EventBus -->|Trigger pulse & wave| Fabric
    EventBus -->|Extract colors| Palette
    Palette -->|Update --art-* variables| UI
    YT -->|Playback state & clock| EventBus
```

### Repository Structure

```
again-radio/
├── docs/
│   ├── SPEC.md             # Project contract, rights, data models
│   └── DESIGN.md           # Design language, typography, motion tokens
├── public/
│   ├── data/
│   │   ├── station.json    # Rotation schedule & hour block definitions
│   │   ├── albums.json     # Curated discography & MBID metadata
│   │   ├── catalogue.json  # Full search index & live set database
│   │   └── programs/       # Show tracklists with millisecond offsets
│   └── fonts/              # Self-hosted Instrument Sans & Serif (subset)
├── src/
│   ├── components/         # Astro components + dedicated TypeScript islands
│   ├── lib/
│   │   ├── events.ts       # Central event bus contract
│   │   ├── schedule.ts     # Global epoch sync & binary search scheduler
│   │   ├── palette.ts      # OffscreenCanvas artwork color extraction
│   │   ├── memories.ts     # Memory line composer & title parser
│   │   ├── pulse.ts        # BPM beat clock tracking
│   │   └── yt.ts           # YouTube IFrame API controller
│   └── pages/
│       └── index.astro     # Main station page
├── styles/
│   └── theme.css           # Token definitions, themes, registered @property vars
├── worker/
│   └── presence/           # Cloudflare Worker + Durable Object for live presence
└── scripts/
    ├── verify.mjs          # Data integrity, schema, and layout verification
    ├── schedule.test.mjs   # Time sync and schedule unit test suite
    └── shot.mjs            # Local headless screenshot runner
```

---

## Quick Start

### Prerequisites
- **Node.js**: v20 or higher
- **npm**: v10 or higher

### 1. Clone & Install
```bash
git clone https://github.com/amansn7/again-radio.git
cd again-radio
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Open [http://localhost:4321](http://localhost:4321) to tune into the local live stream.

### 3. Run Verification Tests
```bash
# Verify all program data, track integrity, offsets, and schemas
node scripts/verify.mjs

# Run logic & algorithmic self-tests
node scripts/verify.mjs --selftest

# Test live schedule calculations across time zones
node scripts/schedule.test.mjs
```

### 4. Build for Production
```bash
npm run build
```
Generates a static build inside `dist/`.

---

## Rights & Ethics (Strict Guarantees)

This project strictly adheres to digital ethics and music copyright standards:
1. **Official Embeds Only**: All audio streams directly through official YouTube video embeds. Audio is **never** downloaded, proxied, or re-hosted.
2. **Hotlinked Artwork**: Album art is dynamically resolved and hotlinked via [Cover Art Archive](https://coverartarchive.org/) and iTunes APIs with keyless CORS. No image assets are stored locally or redistributed.
3. **Original Memory Prose**: Memory layer text is written originally from researched public facts; no copied interview transcripts or press quotes.
4. **Zero-Tracking Presence**: The live listener counter operates entirely in ephemeral memory via Cloudflare Durable Objects. No IP addresses, user identifiers, or cookies are stored.

---

## Disclaimer

> **Fan project. Not affiliated with Fred again.. or Atlantic Records / Warner Music Group.**  
> All music, recordings, and artwork belong to their respective copyright owners.

<div align="center">
<sub>Built with care for the music, the rooms, and the memories.</sub>
</div>
