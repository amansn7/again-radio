import { parseCatalogue } from "./catalogue.ts";
import { videoProgram } from "./live.ts";
import { parseProgram, parseStation, type Program } from "./station.ts";
import type { Slot } from "./rotation.ts";

/** A moment someone sent: `/?p=<program-id>&t=<seconds>`. */
export interface Link { id: string; t: number }

const ID = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*|video-[\w-]{11})$/;

export function parseLink(search: string): Link | null {
  const q = new URLSearchParams(search);
  const id = q.get("p") ?? "";
  if (!ID.test(id)) return null;
  const t = Math.floor(Number(q.get("t")));
  return { id, t: Number.isFinite(t) && t > 0 ? t : 0 };
}

/** The programme on the dial with that id, cued inside its length; null means stay live. */
export function resolveLink(link: Link, slots: Slot[]): { path: string; program: Program; offset: number } | null {
  const vid = link.id.startsWith("video-") ? link.id.slice(6) : "";
  const slot = slots.find((s) => s.program.id === link.id) ?? slots.find((s) => vid && s.program.youtubeId === vid);
  if (!slot) return null;
  return { path: slot.path, program: slot.program, offset: Math.min(link.t, Math.max(0, slot.program.duration - 1)) };
}

/** Shared as the preview page, which forwards to the moment. */
export function shareUrl(origin: string, id: string, sec: number): string {
  const t = Math.floor(sec);
  return `${origin}/p/${id}${t > 0 ? `?t=${t}` : ""}`;
}

export function shareText(track: string, set: string): string {
  return track === set ? `Listening to ${set} on again radio` : `Listening to ${track}, ${set}, on again radio`;
}

/** Every programme a listener can share, once per id (build time: share pages, cards). */
export function sharePrograms(read: (path: string) => unknown): Program[] {
  const station = parseStation(read("station.json"), "station.json");
  const programs = station.rotation.map((r) => parseProgram(read(r.program), r.program));
  const videos = parseCatalogue(read("catalogue.json"))
    .filter((v) => v.kind === "set" || v.kind === "live")
    .map(videoProgram);
  const seen = new Set<string>();
  return [...programs, ...videos].filter((p) => !seen.has(p.id) && seen.add(p.id));
}
