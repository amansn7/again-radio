import { esc } from "./archive-rail.ts";

export interface DialSelectOptions {
  container: HTMLElement;
  onChange: (index: number) => void;
}

export class DialSelect {
  private el: HTMLElement;
  private btn: HTMLButtonElement;
  private label: HTMLElement;
  private menu: HTMLElement;
  private onChange: (index: number) => void;
  private titles: string[] = [];
  private selected = 0;
  private focused = -1;
  private open = false;
  private closeTimer = 0;
  private ac = new AbortController();

  constructor(opts: DialSelectOptions) {
    this.el = opts.container;
    this.onChange = opts.onChange;
    this.btn = this.el.querySelector<HTMLButtonElement>(".dl-pick-btn")!;
    this.label = this.el.querySelector<HTMLElement>(".dl-pick-label")!;
    this.menu = this.el.querySelector<HTMLElement>(".dl-menu")!;
    this.bind();
  }

  private bind(): void {
    const signal = this.ac.signal;
    this.btn.addEventListener("click", () => this.toggle(), { signal });
    this.el.addEventListener("keydown", (e) => this.onKey(e), { signal });
    this.menu.addEventListener("click", (e) => this.onMenuClick(e), { signal });

    document.addEventListener("pointerdown", (e) => {
      if (this.open && !this.el.contains(e.target as Node)) this.close(false);
    }, { signal });
  }

  setOptions(titles: string[], selected = 0): void {
    this.titles = titles;
    this.selected = selected;
    this.render();
  }

  setSelected(index: number): void {
    if (index < 0 || index >= this.titles.length || index === this.selected) return;
    this.selected = index;
    this.update();
  }

  private render(): void {
    this.label.textContent = this.titles[this.selected] ?? "";
    this.menu.innerHTML = this.titles.map((title, i) =>
      `<button type="button" role="option" class="dl-opt" id="dl-opt-${i}" data-index="${i}" aria-selected="${i === this.selected}" tabindex="-1">` +
      `<span class="dl-opt-text">${esc(title)}</span>` +
      `<svg class="dl-opt-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">` +
      `<path d="M3.5 8.5L6.5 11.5L12.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</svg></button>`,
    ).join("");
  }

  private update(): void {
    this.label.textContent = this.titles[this.selected] ?? "";
    const opts = this.menu.querySelectorAll<HTMLElement>(".dl-opt");
    opts.forEach((opt, i) => {
      opt.setAttribute("aria-selected", String(i === this.selected));
    });
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    if (this.open) return;
    clearTimeout(this.closeTimer);
    this.open = true;
    this.btn.setAttribute("aria-expanded", "true");
    this.menu.hidden = false;
    requestAnimationFrame(() => this.menu.classList.add("is-open"));
    this.focusItem(this.selected, true);
  }

  close(refocus = true): void {
    if (!this.open) return;
    this.open = false;
    this.btn.setAttribute("aria-expanded", "false");
    this.menu.classList.remove("is-open");
    this.clearFocus();
    if (refocus) this.btn.focus();
    this.closeTimer = window.setTimeout(() => {
      if (!this.open) this.menu.hidden = true;
    }, 180);
  }

  private focusItem(index: number, scroll = false): void {
    const opts = this.menu.querySelectorAll<HTMLElement>(".dl-opt");
    opts.forEach((opt, i) => {
      const active = i === index;
      opt.classList.toggle("is-focused", active);
      if (active) {
        this.btn.setAttribute("aria-activedescendant", opt.id);
        this.menu.setAttribute("aria-activedescendant", opt.id);
        if (scroll) opt.scrollIntoView({ block: "nearest" });
      }
    });
    this.focused = index;
  }

  private clearFocus(): void {
    this.btn.removeAttribute("aria-activedescendant");
    this.menu.removeAttribute("aria-activedescendant");
    this.menu.querySelectorAll(".dl-opt.is-focused").forEach((el) => el.classList.remove("is-focused"));
    this.focused = -1;
  }

  private pick(index: number): void {
    if (index < 0 || index >= this.titles.length) return;
    this.selected = index;
    this.update();
    this.close();
    this.onChange(index);
  }

  private onMenuClick(e: MouseEvent): void {
    const opt = (e.target as HTMLElement).closest<HTMLElement>(".dl-opt");
    if (!opt) return;
    const index = Number(opt.dataset.index);
    if (!isNaN(index)) this.pick(index);
  }

  private onKey(e: KeyboardEvent): void {
    const count = this.titles.length;
    if (!count) return;

    if (!this.open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.show();
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
    } else if (e.key === "Tab") {
      this.close(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      this.focusItem((this.focused + 1) % count, true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.focusItem((this.focused - 1 + count) % count, true);
    } else if (e.key === "Home") {
      e.preventDefault();
      this.focusItem(0, true);
    } else if (e.key === "End") {
      e.preventDefault();
      this.focusItem(count - 1, true);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (this.focused >= 0) this.pick(this.focused);
    }
  }

  destroy(): void {
    clearTimeout(this.closeTimer);
    this.ac.abort();
  }
}
