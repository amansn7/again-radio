#!/usr/bin/env node
// Browser checks for the first screen, on the cached headless shell (see shot.mjs).
// The shell cannot play YouTube, which exercises the error path for real.
//
//   node scripts/ui.check.mjs http://127.0.0.1:4321
import { chromium } from "playwright-core";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const url = process.argv[2];
if (!url) {
  console.error("usage: ui.check.mjs <url>");
  process.exit(1);
}
const cache = join(process.env.HOME ?? "", "Library/Caches/ms-playwright");
const exe = readdirSync(cache)
  .filter((d) => d.startsWith("chromium_headless_shell-"))
  .sort()
  .reverse()
  .map((d) => join(cache, d, "chrome-headless-shell-mac-x64", "chrome-headless-shell"))
  .find((p) => existsSync(p));

const browser = await chromium.launch({ executablePath: exe });
const fail = async (m) => {
  console.error("✗", m);
  await browser.close();
  process.exit(1);
};

const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(url, { waitUntil: "domcontentloaded" });
const player = page.locator("radio-player");

// Tune in: one obvious target, keyboard operable, gone once sound is on.
await page.waitForSelector("#rp-tune", { state: "visible", timeout: 10_000 }).catch(() => fail("#rp-tune not visible on arrival"));
if ((await player.getAttribute("data-muted")) !== "true") await fail("player not muted on arrival");
for (let i = 0; i < 15 && (await page.evaluate(() => document.activeElement?.id)) !== "rp-tune"; i++) {
  await page.keyboard.press("Tab");
  if (!(await page.locator("#rp-tune").count())) await fail(`Tab ${i + 1} removed #rp-tune before it could be reached`);
}
if ((await page.evaluate(() => document.activeElement?.id)) !== "rp-tune") await fail("#rp-tune not reachable by Tab");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
if (await page.locator("#rp-tune").count()) await fail("#rp-tune still present after Enter");
if ((await player.getAttribute("data-muted")) !== "false") await fail("Enter on #rp-tune did not unmute");
const active = await page.evaluate(() => document.activeElement?.id ?? "");
if (active !== "rp-sound") await fail(`focus went to "${active || "body"}", not #rp-sound`);

// YouTube fails in this shell: from the first error its own card must never show through.
await page.waitForSelector("radio-player[data-novideo]", { state: "attached", timeout: 10_000 })
  .catch(() => fail("no data-novideo after a YouTube error"));
const vis = await page.evaluate(() => {
  const f = document.querySelector(".rp-screen iframe");
  return f ? getComputedStyle(f).visibility : "missing";
});
if (vis !== "hidden") await fail(`iframe visibility is "${vis}" after error`);
if (!(await page.locator(".ambient").isVisible())) await fail("ambient field hidden after error");

await browser.close();
console.log("✓ ui");
