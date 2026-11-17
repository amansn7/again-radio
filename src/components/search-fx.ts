import { resolveArtUrl } from "../lib/art.ts";
import type { Art } from "../lib/search.ts";

const cache = new Map<string, Promise<string | null>>();
const yt = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function artUrl(a: Art): Promise<string | null> {
  const key = a.entry ? `${a.entry.artist}|${a.entry.title}|${a.entry.album}` : (a.yt ?? "");
  let p = cache.get(key);
  if (!p) {
    p = a.entry ? resolveArtUrl(a.entry).then((u) => u ?? (a.yt ? yt(a.yt) : null)) : Promise.resolve(a.yt ? yt(a.yt) : null);
    cache.set(key, p);
  }
  return p;
}

/** Row art loads after the row is in the DOM; `data-art` holds the index into hits. */
export function loadArt(list: HTMLElement, arts: (Art | undefined)[]) {
  list.querySelectorAll<HTMLElement>(".rs-art[data-a]").forEach((el) => {
    const a = arts[Number(el.dataset.a)];
    if (!a) return;
    void artUrl(a).then((u) => {
      if (!u || !el.isConnected) return;
      const img = new Image();
      img.alt = "";
      img.onload = () => el.classList.add("rs-art-on");
      el.append(img);
      img.src = u;
    });
  });
}

/** Pointer position inside a row, -1..1, drives the layered offsets in CSS. */
export function tilt(list: HTMLElement) {
  list.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || reduced()) return;
    const row = (e.target as HTMLElement).closest<HTMLElement>(".rs-row");
    if (!row) return;
    const r = row.getBoundingClientRect();
    row.style.setProperty("--px", String(((e.clientX - r.left) / r.width) * 2 - 1));
    row.style.setProperty("--py", String(((e.clientY - r.top) / r.height) * 2 - 1));
  });
  list.addEventListener("pointerout", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".rs-row");
    row?.style.removeProperty("--px");
    row?.style.removeProperty("--py");
  });
}

const NAMES: [string, string][] = [[".rs-art", "rs-fly"], [".rs-t > span:first-child", "rs-fly-t"], [".rs-t > .meta", "rs-fly-m"], [".rs-r", "rs-fly-r"]];

/** Fly the chosen row's art into the hero name, layers peeling apart, then run `done`. */
export async function fly(row: HTMLElement | null, dlg: HTMLDialogElement, done: () => void) {
  const target = document.querySelector<HTMLElement>(".np-name");
  if (!row || reduced() || !target || !target.offsetWidth) {
    dlg.close();
    done();
    return;
  }
  const named = NAMES.flatMap(([sel, n]) => {
    const el = row.querySelector<HTMLElement>(sel);
    el?.style.setProperty("view-transition-name", n);
    return el ? [el] : [];
  });
  const clear = () => {
    named.forEach((el) => el.style.removeProperty("view-transition-name"));
    target.style.removeProperty("view-transition-name");
  };
  dlg.dataset.fly = "";
  if (!document.startViewTransition) {
    dlg.classList.add("rs-zoom");
    await new Promise((r) => setTimeout(r, 260));
    dlg.close();
    delete dlg.dataset.fly;
    dlg.classList.remove("rs-zoom");
    clear();
    done();
    return;
  }
  const vt = document.startViewTransition(() => {
    dlg.close();
    target.style.setProperty("view-transition-name", "rs-fly");
  });
  await vt.finished.catch(() => {});
  delete dlg.dataset.fly;
  clear();
  done();
}
