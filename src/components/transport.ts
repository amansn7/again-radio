export interface KeyActions {
  toggle(): void;
  mute(): void;
  prev(): void;
  next(): void;
  live(): void;
}

const TYPING = "input, textarea, select, [contenteditable=''], [contenteditable='true']";

export function bindKeys(a: KeyActions, signal: AbortSignal) {
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest(TYPING) || document.querySelector("dialog[open]")) return;
      const k = e.key.toLowerCase();
      const onButton = !!t?.closest("button, a");
      let run: (() => void) | null = null;
      if (k === "l" && e.shiftKey) run = a.live;
      else if (e.shiftKey) return;
      else if (k === " ") run = onButton ? null : a.toggle;
      else if (k === "k") run = a.toggle;
      else if (k === "m") run = a.mute;
      else if (k === "arrowleft" || k === "j") run = a.prev;
      else if (k === "arrowright" || k === "l") run = a.next;
      if (!run) return;
      e.preventDefault();
      run();
    },
    { signal },
  );
}
