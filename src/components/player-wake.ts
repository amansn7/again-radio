import type { Point } from "./tune-in.ts";

// Moving focus is not asking for sound: Tab and lone modifiers would otherwise remove the
// tune-in button before a keyboard user can reach it.
const NAV = new Set(["Tab", "Shift", "Control", "Alt", "Meta", "Escape"]);

/** The first click or key anywhere asks for sound; `tap` records where a pointer landed. */
export function bindWake(host: HTMLElement, signal: AbortSignal, tap: (p: Point) => void, start: () => void) {
  // The tune-in button acts on its own click: a keydown handler that moved focus would let the
  // key's activation land on the next button instead.
  const mark = (e: Event) => {
    if (e instanceof MouseEvent && e.detail > 0) tap({ x: e.clientX, y: e.clientY });
  };
  const soundOn = (e: Event) => {
    if (e instanceof KeyboardEvent && NAV.has(e.key)) return;
    mark(e);
    if (!(e.target instanceof Element && e.target.closest("#rp-tune"))) start();
  };
  window.addEventListener("click", soundOn, { signal });
  window.addEventListener("keydown", soundOn, { signal });
  host.querySelector("#rp-tune")?.addEventListener("click", (e) => {
    mark(e);
    start();
  }, { signal });
}

/** Focus moving into the embed blurs the window; take it straight back to where the user was. */
export function rescueFocus(host: HTMLElement, signal: AbortSignal) {
  let last: HTMLElement | null = null;
  document.addEventListener("focusin", (e) => {
    if (!(e.target instanceof HTMLIFrameElement)) last = e.target as HTMLElement;
  }, { signal });
  // The embed grabs focus as it loads, which swallows the page's keyboard shortcuts.
  window.addEventListener("blur", () => setTimeout(() => {
    const a = document.activeElement;
    if (!(a instanceof HTMLIFrameElement) || !host.contains(a)) return;
    a.blur();
    if (last?.isConnected) last.focus({ preventScroll: true });
  }), { signal });
}
