#!/usr/bin/env node
// Screenshot helper. `npx playwright screenshot` cannot run here: playwright 1.65
// refuses to install chromium on macOS 12, and the cached headless shell is an older
// revision. This drives the cached shell directly instead.
//
//   node scripts/shot.mjs <url> <out.png> [width] [height] [theme]
//
// theme: auto | diary | sleek — written to localStorage before the page loads.
import { chromium } from "playwright-core";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [, , url, out, w = "1440", h = "900", theme = ""] = process.argv;
if (!url || !out) {
  console.error("usage: shot.mjs <url> <out.png> [width] [height] [theme]");
  process.exit(1);
}

const cache = join(process.env.HOME ?? "", "Library/Caches/ms-playwright");
const dirs = readdirSync(cache)
  .filter((d) => d.startsWith("chromium_headless_shell-"))
  .sort()
  .reverse();
const exe = dirs
  .map((d) => join(cache, d, "chrome-headless-shell-mac-x64", "chrome-headless-shell"))
  .find((p) => existsSync(p));
if (!exe) {
  console.error(`no cached headless shell under ${cache}`);
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
if (theme) {
  await page.addInitScript((t) => {
    localStorage.setItem("again-radio-theme", t);
  }, theme);
}
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.screenshot({ path: out });
await browser.close();
console.log(out);
