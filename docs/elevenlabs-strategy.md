# ElevenLabs 10k Credits: Efficiency & Iteration Strategy

Strategy for getting maximum broadcast value out of ElevenLabs' free monthly 10,000 credit allocation for **AGAIN RADIO**'s AI radio jockey, Rory.

---

## The Math: What 10,000 Credits Actually Gives Us

| Model | Character Cost | 10k Credits Yield | Spoken Audio Yield |
|---|---|---|---|
| `eleven_flash_v2_5` | **0.5 credits** / char | **20,000 characters** | ~40–50 minutes (~70–80 radio clips) |
| `eleven_turbo_v2_5` | **1.0 credit** / char | **10,000 characters** | ~20–25 minutes (~35–40 radio clips) |
| `eleven_multilingual_v2`| **1.0 credit** / char | **10,000 characters** | ~20–25 minutes (~35–40 radio clips) |

> [!TIP]
> **Free Tier Refreshes Monthly**: ElevenLabs resets the 10,000 character limit every month. Audio saved into `public/audio/jockey/*.mp3` is permanently cached and never costs credits again. Over 3–4 months, the station naturally builds a library of **150+ studio-grade clips** without spending a penny.

---

## Strategy Pillars

### 1. Pre-Render & Git-Commit (Zero Redundant Spend)
- **Never synthesize on user request in production**: Calling the ElevenLabs API live in the client on every page load would exhaust 10,000 credits in less than an hour of real listeners.
- **The Pipeline**: Synthesize once with `scripts/generate-jockey-audio.mjs`, save to `public/audio/jockey/*.mp3`, and commit to Git.
- **Cache Check Guard**: The script checks `fs.existsSync(targetFile)` before calling the API. Re-running the script will never re-charge credits for clips that already exist.

### 2. Zero-Credit Drafting ("Auditioning")
Never spend credits testing raw scripts or pronunciations.
1. **Cadence & Post-Timing Check**: Test the line duration using local speech synthesis or mental BPM counting (~15 characters per second). Verify:
   $$\text{Length in characters} / 15 < \text{postSeconds} - 1.5\text{s}$$
2. **Pronunciation Verification**:
   - Write names phonetically if needed (e.g. `Obongjayar` $\rightarrow$ `Oh-bong-jay-ar`).
3. **Commit to ElevenLabs**: Only after the line is verified for length, cadence, and emotion is it added to `jockey.json` and synthesized.

### 3. Allocation Budget Across Phases (10k Budget Plan)

```mermaid
pie title 10k Credits Allocation
    "Tier 1: Core Canon (Shipped)" : 2651
    "Tier 2: India Tour Special" : 1800
    "Tier 3: Album Deep Cuts" : 2000
    "Tier 4: Reserve Buffer" : 3549
```

#### Tier 1 — Core Station Canon (Shipped: 2,651 credits)
- 28 clips: Welcome, Boiler Room transition, Naples, Times Square, Tiny Desk, Delilah, Danielle, Nathan, Kammy, Tanya, Rumble, Baby again.., Brian Eno mentorship story, Boiler Room yellow-shirt CDJ incident.
- Remaining balance: **~7,349 credits**.

#### Tier 2 — India Tour Special (Budget: ~1,800 credits)
Targeted ahead of the December 2026 tour:
- **Delhi (5 Dec)**: Countdown & venue hype clip (~200 chars).
- **Mumbai (9 Dec)**: Seaside venue & energy clip (~200 chars).
- **Bengaluru (13 Dec)**: Tour finale celebration clip (~200 chars).
- 6 track intros for India-specific favorites (*ten days* tracks, *places to be*, *adore u* extended).

#### Tier 3 — Deep Catalogue Cuts (Budget: ~2,000 credits)
- *Actual Life 1 & 2* emotional milestones (*Carlos*, *Sabrina*, *Billie*, *Baxter*, *Dermot*).
- *USB002* club weapons (*leavemealone*, *ten*, *stayinit*).

#### Tier 4 — Rolling Reserve Buffer (~3,500 credits)
- Reserved for unexpected new singles, unreleased premieres, or live stream drops.
- Rolls over with the monthly refresh.

---

## The Hybrid Architecture: Infinite Radio Without Credit Limits

To make the station feel dynamic and infinite:
1. **Tier 1 (Mastered ElevenLabs Clips)**: 85% of listening time triggers the pre-rendered ElevenLabs voice clips for iconic tracks, transitions, and historic stories.
2. **Tier 2 (Web Speech API with British Female Voice)**: Dynamic, real-time data that changes every minute (e.g. *"Shout to the 42 listeners locked in right now from 11 countries"*, or local time-of-day greetings) is voiced on the fly via the browser's native British voice engine at **0 credit cost**.
3. **Tier 3 (Liquid Glass Subtitle Fallback)**: Any listener on mute or without audio permissions gets the synchronized caption HUD.
