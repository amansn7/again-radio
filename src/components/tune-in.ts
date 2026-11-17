/**
 * The moment sound arrives. The "Tune in" button folds into the speaker button, a ring of
 * light leaves the spot that was tapped and crosses the picture, and the room brightens for a
 * beat. Under reduced motion the button simply goes.
 */
export interface Point { x: number; y: number }

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function tuneIn(tune: HTMLElement, sound: HTMLElement | null, screen: HTMLElement | null, at?: Point): void {
  const hadFocus = document.activeElement === tune;
  const settle = () => {
    tune.remove();
    if (hadFocus) sound?.focus();
  };
  if (calm()) return settle();

  const r = tune.getBoundingClientRect();
  wave(screen, at ?? { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  screen?.animate(
    [{ filter: "brightness(1)" }, { filter: "brightness(1.35) saturate(1.15)" }, { filter: "brightness(1)" }],
    { duration: 1100, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );

  if (!document.startViewTransition || !sound) return settle();
  // Only the button and the speaker take part; the rest of the page (and the video) stays live.
  const root = document.documentElement;
  root.classList.add("rp-morphing");
  tune.style.viewTransitionName = "rp-tune";
  const vt = document.startViewTransition(() => {
    tune.style.viewTransitionName = "";
    sound.style.viewTransitionName = "rp-tune";
    settle();
  });
  vt.finished.finally(() => {
    sound.style.viewTransitionName = "";
    root.classList.remove("rp-morphing");
  });
}

function wave(screen: HTMLElement | null, at: Point): void {
  if (!screen) return;
  const reach = Math.hypot(Math.max(at.x, innerWidth - at.x), Math.max(at.y, innerHeight - at.y));
  const w = document.createElement("span");
  w.className = "rp-wave";
  w.style.cssText = `left:${at.x - reach}px;top:${at.y - reach}px;width:${reach * 2}px;height:${reach * 2}px`;
  screen.append(w);
  w.addEventListener("animationend", () => w.remove(), { once: true });
}
