# UX execution plan

Contract: `docs/SPEC.md`. Project conventions: `AGENTS.md`.

## 1. Keyboard and screen-reader foundations — done

**Goal:** Make the main content and core controls easy to reach and identify without a pointer.

**Context:** The player already has dynamic play/mute names, search has keyboard navigation, and the theme stylesheet has a visible focus style. The page lacked a skip link.

**Constraints:** Preserve the single Rave theme and vanilla Astro/TypeScript stack. Do not add a framework or change the YouTube embed contract.

**Done when:** A keyboard user can skip the header and reach main content; existing controls retain clear names and visible focus.

## 2. Mobile control targets — done

**Goal:** Make frequently used controls practical to tap on a phone.

**Context:** Buttons were 40px high and dial tabs/selector were shorter than the project's 44px target. Tracklist segments are visually narrow, so their vertical hit area was expanded instead of changing the timeline layout.

**Constraints:** Keep the existing mobile layout, avoid horizontal overflow, and do not resize the tracklist segments in ways that distort their time proportions.

**Done when:** Player buttons, Go Live, dial tabs and selector are at least 44px high on mobile; the tracklist has a 44px vertical hit area.

## 3. Playback motion budget — done

**Goal:** Reduce per-frame style work while keeping beat-driven motion responsive.

**Context:** `src/lib/pulse.ts` already has one animation-frame loop that pauses while the tab is hidden or reduced motion is enabled. It called subscribers at display refresh rate.

**Constraints:** Keep the single loop and playback-clock timing; do not analyze or proxy YouTube audio.

**Done when:** Subscriber callbacks run at no more than 30fps; hidden-tab and reduced-motion behavior remain intact.

## 4. Search and memory feedback — done

**Goal:** Make search loading and empty states clear to sighted and screen-reader users.

**Context:** Search already showed skeletons, but loading and empty messages were being placed inside its listbox, where assistive technology could treat them as options. Memory copy already has a reserved skeleton and polite live region.

**Constraints:** Keep catalogue data runtime-fetched, retain keyboard navigation, avoid new dependencies, and do not hide the memory layer behind a disclosure by default.

**Done when:** Search guidance, loading, and no-results messages use a status region outside the listbox; only actual results are listbox options. Memory keeps its stable space and polite announcement.

## 5. Help and onboarding — reviewed; no new UI

**Goal:** Help a first-time listener discover the controls without adding a redundant tour.

**Context:** The player displays its keyboard shortcuts beside its controls; search shows `/` on desktop and opens with `/` or Ctrl/Cmd+K. Core controls are visible in the main screen.

**Constraints:** Keep the first screen focused on listening. Do not add a modal or tour unless user testing reveals a specific discovery problem.

**Done when:** Existing shortcut hints cover current keyboard actions; a help modal or guided tour is deferred until there is evidence it solves a real problem.

## 6. Offline support — reviewed; deferred

**Goal:** Decide whether an offline mode would improve the product without confusing playback or violating rights.

**Context:** The radio depends on an official remote YouTube embed, artwork is hotlinked, and catalogue data is fetched at runtime. Offline mode cannot provide the core listening experience.

**Constraints:** Never cache or re-host YouTube audio or artwork. Do not add a service worker without a defined offline experience and cache lifecycle.

**Done when:** Offline/PWA work remains deferred unless a read-only offline use case is requested; any future cache policy excludes media and artwork.

## Verification record

- `npm run build` — passed.
- `node scripts/verify.mjs` — passed.
- `node scripts/schedule.test.mjs` — passed.
- `git diff --check` — passed.
- Desktop and 390px screenshots captured. YouTube reported the selected video unavailable in the screenshot environment, limiting playback visual review.
