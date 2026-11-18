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
if (!(await page.locator(".rp-wave").count())) await fail("no light wave on tune in");
await page.waitForTimeout(600);
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

// Reduced motion: same outcome, no wave, no morph.
const calm = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
await calm.goto(url, { waitUntil: "domcontentloaded" });
await calm.waitForSelector("#rp-tune", { state: "visible", timeout: 10_000 }).catch(() => fail("reduced motion: no #rp-tune"));
await calm.click("#rp-tune");
if (await calm.locator(".rp-wave").count()) await fail("reduced motion: wave shown");
await calm.waitForTimeout(100);
if (await calm.locator("#rp-tune").count()) await fail("reduced motion: #rp-tune not removed at once");
if ((await calm.locator("radio-player").getAttribute("data-muted")) !== "false") await fail("reduced motion: click did not unmute");

// Search finds songs that are not on air and marks them as opening YouTube.
const finder = await browser.newPage({ viewport: { width: 390, height: 844 } });
await finder.goto(url, { waitUntil: "domcontentloaded" });
await finder.waitForSelector("radio-search", { timeout: 10_000 });
await finder.keyboard.press("/");
await finder.keyboard.type("marea");
await finder.waitForSelector(".rs-row:has-text('Marea') .rs-out", { timeout: 10_000 }).catch(() => fail("search: Marea not found as a YouTube link-out"));

// A shared moment opens on that moment, off live, still waiting for the tune-in tap.
const linked = await browser.newPage({ viewport: { width: 390, height: 844 } });
await linked.addInitScript(() => {
  document.addEventListener("radio:track", (e) => {
    window.__firstTrack ??= e.detail.programId;
    window.__firstEntry ??= e.detail.entry.title;
  });
});
// Arrive through the share page, which must forward to the moment.
await linked.goto(new URL("/p/boiler-room-london?t=1592", url).href, { waitUntil: "domcontentloaded" });
await linked.waitForFunction(() => window.__firstTrack, null, { timeout: 15_000 }).catch(() => fail("link: no track emitted"));
const first = await linked.evaluate(() => window.__firstTrack);
if (first !== "boiler-room-london") await fail(`link: opened on "${first}", not boiler-room-london`);
const entry = await linked.evaluate(() => window.__firstEntry);
if (entry !== "Feelings") await fail(`link: t=1592 should land on Feelings, got "${entry}"`);
if (!(await linked.locator("#rp-tune").count())) await fail("link: tune-in button missing");

// Share: no share sheet in this shell, so the link is copied to the clipboard.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["clipboard-read", "clipboard-write"] });
const sharer = await ctx.newPage();
await sharer.goto(url, { waitUntil: "domcontentloaded" });
await sharer.waitForSelector("#rp-share", { state: "visible", timeout: 10_000 }).catch(() => fail("share: no #rp-share"));
await sharer.waitForFunction(() => document.querySelector(".rp-credit")?.textContent?.trim(), null, { timeout: 15_000 }).catch(() => fail("share: no track on air"));
await sharer.click("#rp-share");
await sharer.waitForTimeout(400);
const copied = await sharer.evaluate(() => navigator.clipboard.readText());
if (!/\/p\/[a-z0-9-]+/i.test(copied)) await fail(`share: clipboard has "${copied}"`);
if (!(await sharer.locator(".rp-toast:not([hidden])").count())) await fail("share: no confirmation shown");

await browser.close();
console.log("✓ ui");
