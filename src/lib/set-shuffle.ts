import { shuffled } from "./rotation.ts";

/** Shuffled play through one set's entries: the current one first, nothing from other sets. */
export class SetShuffle {
  on = false;
  /** The entry the shuffle put on; leaving it by any route means the next pick is due. */
  picking = -1;
  private queue: number[] = [];
  private played: number[] = [];

  /** Start over on a set (on a new set, or turning shuffle on), keeping `on` as it is. */
  reset(count: number, current: number) {
    this.picking = current;
    this.played = [];
    this.queue = this.on ? shuffled([...Array(count).keys()].filter((i) => i !== current)) : [];
  }

  set(on: boolean, count: number, current: number) {
    this.on = on;
    this.reset(count, on ? current : -1);
  }

  /** The next entry, or undefined when every entry has had its turn. */
  next(): number | undefined {
    const n = this.queue.shift();
    if (n === undefined) return undefined;
    if (this.picking >= 0) this.played.push(this.picking);
    return (this.picking = n);
  }

  /** The entry before this one, or undefined at the start. */
  back(): number | undefined {
    const p = this.played.pop();
    if (p === undefined) return undefined;
    this.queue.unshift(this.picking);
    return (this.picking = p);
  }
}
