#!/usr/bin/env node
// Renders link-preview cards (1200×630 JPEG) and home-screen icons (PNG) into public/, using the
// cached headless shell (see shot.mjs). Our own type and colour only: no artwork is stored.
// Re-run when sets are added:  node scripts/og.mjs
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sharePrograms } from "../src/lib/share.ts";

const ROOT = join(import.meta.dirname, "..");
const PUB = join(ROOT, "public");
const read = (p) => JSON.parse(readFileSync(join(PUB, "data", p), "utf8"));
const font = (f) => `data:font/woff2;base64,${readFileSync(join(PUB, "fonts", f)).toString("base64")}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const FACES = `
@font-face { font-family: Sans; src: url(${font("instrument-sans-var.woff2")}); font-weight: 400 700; }
@font-face { font-family: Serif; src: url(${font("instrument-serif.woff2")}); }`;
const WAVE = `<path d="M6 19c3-6 5-6 7 0s4 6 6 0 4-6 7 0" fill="none" stroke="#f2eee6" stroke-width="2.2" stroke-linecap="round"/>`;

// A hue per set, so a feed of shares doesn't read as one card repeated.
const hue = (id) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function card({ id, name, line, when }) {
  const h = hue(id);
  return `<!doctype html><html><head><style>${FACES}
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; color: #f2eee6; font-family: Sans;
    background: radial-gradient(70% 90% at 82% 18%, hsl(${h} 55% 32% / 0.9), transparent 70%),
                radial-gradient(60% 70% at 10% 110%, hsl(${(h + 140) % 360} 45% 22% / 0.8), transparent 70%), #121110; }
  .pad { position: absolute; inset: 64px 72px; display: flex; flex-direction: column; }
  .mark { display: flex; align-items: center; gap: 14px; font-size: 34px; font-weight: 600; letter-spacing: -0.02em; }
  .dot { width: 14px; height: 14px; border-radius: 50%; background: hsl(${h} 80% 70%); box-shadow: 0 0 18px hsl(${h} 80% 70%); }
  .live { margin-left: 10px; font-size: 22px; font-weight: 500; opacity: 0.75; }
  .name { margin-top: auto; font-size: ${name.length > 22 ? 84 : 112}px; font-weight: 650; line-height: 0.98; letter-spacing: -0.035em;
    max-width: 1000px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .line { margin-top: 22px; font-family: Serif; font-style: italic; font-size: 40px; opacity: 0.85;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 1050px; }
  .foot { margin-top: 40px; display: flex; justify-content: space-between; font-size: 22px; opacity: 0.6; }
  </style></head><body><div class="pad">
    <div class="mark"><span class="dot"></span>again radio<span class="live">live, 24 hours</span></div>
    <div class="name">${esc(name)}</div>
    ${line ? `<div class="line">${esc(line)}</div>` : ""}
    <div class="foot"><span>${esc(when)}</span><span>Fan project. Not affiliated with Fred again..</span></div>
  </div></body></html>`;
}

const icon = (size) => `<!doctype html><html><head><style>* { margin: 0; } body { width: ${size}px; height: ${size}px; background: #1c1815; }</style></head>
  <body><svg width="${size}" height="${size}" viewBox="0 0 32 32">${WAVE}</svg></body></html>`;

const month = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : "");

const cache = join(process.env.HOME ?? "", "Library/Caches/ms-playwright");
const exe = readdirSync(cache)
  .filter((d) => d.startsWith("chromium_headless_shell-"))
  .sort()
  .reverse()
  .map((d) => join(cache, d, "chrome-headless-shell-mac-x64", "chrome-headless-shell"))
  .find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
mkdirSync(join(PUB, "og"), { recursive: true });

const same = (a, b) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");
const shoot = async (html, out, w = 1200, h = 630) => {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot(out.endsWith(".jpg") ? { path: out, type: "jpeg", quality: 82 } : { path: out });
};

for (const p of sharePrograms(read)) {
  // Videos are named by place (venue = place); programmes by their own title.
  const video = p.id.startsWith("video-");
  const name = video ? p.venue : p.title;
  const line = video ? p.title : p.venue;
  await shoot(card({ id: p.id, name, line: !line || same(line, name) ? "" : line, when: month(p.date) }), join(PUB, "og", `${p.id}.jpg`));
  console.log(`og/${p.id}.jpg`);
}
await shoot(card({ id: "again-radio", name: "again radio", line: "A 24-hour fan radio for Fred again..", when: "Tune in, any hour" }), join(PUB, "og", "default.jpg"));
await shoot(icon(192), join(PUB, "icon-192.png"), 192, 192);
await shoot(icon(512), join(PUB, "icon-512.png"), 512, 512);
console.log("og/default.jpg, icon-192.png, icon-512.png");
await browser.close();
