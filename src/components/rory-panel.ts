import { RADIO_JOCKEY, RADIO_JOCKEY_END, RADIO_JOCKEY_SPEAK, RADIO_STATE, type StateInfo } from "../lib/events.ts";
import type { RadioJockey } from "../lib/jockey.ts";
import { RORY_KINDS, type RoryKind } from "../lib/rory-kinds.ts";

const ASKED = "again-radio:jockey-asked";
const FALLBACK_MS = 6000;
const AUTO_KEEP_MS = 15000;

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Swap which of two elements carries the view-transition name, so one seems to become the other. */
function morph(from: HTMLElement, to: HTMLElement, change: () => void): void {
  if (calm() || !document.startViewTransition) return change();
  const root = document.documentElement;
  root.classList.add("rp-morphing");
  from.style.viewTransitionName = "rp-rory";
  const vt = document.startViewTransition(() => {
    from.style.viewTransitionName = "";
    to.style.viewTransitionName = "rp-rory";
    change();
  });
  vt.finished.finally(() => {
    to.style.viewTransitionName = "";
    root.classList.remove("rp-morphing");
  });
}

/**
 * What Rory does, chosen per kind. The panel opens by itself once, after the first welcome (the
 * line just heard is the example), or after a few seconds of sound if Rory never spoke; after
 * that the mic button opens it. Choices apply as they are ticked. Unanswered, the first panel
 * leaves on its own and everything stays on.
 */
export function bindRoryPanel(root: HTMLElement, jockey: RadioJockey, signal: AbortSignal): void {
  const btn = root.querySelector<HTMLButtonElement>("#rp-rory");
  const panel = root.querySelector<HTMLElement>("#rp-rory-panel");
  if (!btn || !panel) return;
  const quote = panel.querySelector<HTMLElement>(".rp-rory-quote");
  const title = panel.querySelector<HTMLElement>(".rp-rory-title");
  const done = panel.querySelector<HTMLButtonElement>(".rp-rory-done");
  const all = panel.querySelector<HTMLButtonElement>(".rp-rory-all");
  const boxes = [...panel.querySelectorAll<HTMLInputElement>(".rp-rory-kinds input")];
  const on = { signal };

  const sync = () => {
    for (const b of boxes) b.checked = jockey.has(b.value as RoryKind);
    const count = boxes.filter((b) => b.checked).length;
    btn.dataset.on = String(count > 0);
    btn.setAttribute("aria-label", `Rory, the host: ${count === 0 ? "off" : count === boxes.length ? "on" : "some"}`);
    if (done) done.textContent = count === boxes.length ? "Keep Rory" : count ? "Keep these" : "Music only";
    if (all) all.textContent = count === boxes.length ? "Clear all" : "Select all";
  };
  document.addEventListener(RADIO_JOCKEY, sync, on);
  sync();

  let autoKeep: ReturnType<typeof setTimeout> | undefined;
  const hold = () => clearTimeout(autoKeep);
  const isOpen = () => !panel.hidden;

  const open = (fromButton: boolean) => {
    if (isOpen()) return;
    if (title) title.textContent = quote?.hidden === false ? "That's Rory, your host between songs." : "Rory, your host between songs";
    const show = () => {
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      if (fromButton) boxes[0]?.focus({ preventScroll: true });
    };
    if (fromButton) morph(btn, panel, show);
    else {
      // Opened by itself: it never takes focus from what the listener is doing.
      show();
      autoKeep = setTimeout(() => close(true), AUTO_KEEP_MS);
    }
  };

  /** `instant` when a tap elsewhere closes it: a view transition would swallow that tap. */
  const close = (instant = false) => {
    hold();
    if (!isOpen()) return;
    const hadFocus = panel.contains(document.activeElement);
    const hide = () => {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      if (quote) quote.hidden = true;
    };
    if (instant) hide();
    else morph(panel, btn, hide);
    if (hadFocus) btn.focus({ preventScroll: true });
  };

  btn.addEventListener("click", () => (isOpen() ? close() : open(true)), on);
  done?.addEventListener("click", () => close(), on);
  all?.addEventListener("click", () => {
    hold();
    jockey.setKinds(boxes.every((b) => b.checked) ? [] : RORY_KINDS);
  }, on);
  panel.addEventListener("change", () => {
    hold();
    jockey.setKinds(boxes.filter((b) => b.checked).map((b) => b.value as RoryKind));
  }, on);
  panel.addEventListener("pointerenter", hold, on);
  panel.addEventListener("focusin", hold, on);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) close();
  }, on);
  document.addEventListener("pointerdown", (e) => {
    const t = e.target as Node;
    if (isOpen() && !panel.contains(t) && !btn.contains(t)) close(true);
  }, on);

  let asked = false;
  try { asked = localStorage.getItem(ASKED) === "1"; } catch {}
  if (asked) return;

  let welcomeSpeaking = false;
  let fallback: ReturnType<typeof setTimeout> | undefined;
  const ask = () => {
    if (asked || signal.aborted) return;
    asked = true;
    clearTimeout(fallback);
    try { localStorage.setItem(ASKED, "1"); } catch {}
    open(false);
  };

  document.addEventListener(RADIO_JOCKEY_SPEAK, (e) => {
    const d = (e as CustomEvent<{ text: string; isTuneIn: boolean }>).detail;
    if (!d.isTuneIn || asked) return;
    welcomeSpeaking = true;
    clearTimeout(fallback);
    if (quote) {
      quote.textContent = `“${d.text}”`;
      quote.hidden = false;
    }
  }, on);
  document.addEventListener(RADIO_JOCKEY_END, () => {
    if (welcomeSpeaking) ask();
  }, on);
  document.addEventListener(RADIO_STATE, (e) => {
    const s = (e as CustomEvent<StateInfo>).detail;
    if (asked || welcomeSpeaking || fallback !== undefined || !s.playing || s.muted) return;
    fallback = setTimeout(ask, FALLBACK_MS);
  }, on);
}
