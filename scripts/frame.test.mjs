// Black-bar detection: symmetric pillarbox is measured, a dark one-sided edge is not.
import { measureFill } from "../src/lib/frame.ts";

const fail = (m) => { console.error("✗", m); process.exit(1); };
const img = (w, h, lit) => {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lit(x, y)) px.fill(200, (y * w + x) * 4, (y * w + x) * 4 + 3);
  return px;
};
const W = 160, H = 90;
const near = (a, b) => Math.abs(a - b) < 0.02;
let f = measureFill(img(W, H, (x) => x >= 20 && x < 140), W, H);
if (!near(f.x, 0.75) || f.y !== 1) fail(`4:3 pillarbox read as ${JSON.stringify(f)}`);
f = measureFill(img(W, H, (x, y) => y >= 10 && y < 80), W, H);
if (f.x !== 1 || !near(f.y, 70 / 90)) fail(`letterbox read as ${JSON.stringify(f)}`);
f = measureFill(img(W, H, (x) => x >= 30), W, H);
if (f.x !== 1) fail("one dark edge must not be cropped");
f = measureFill(img(W, H, () => true), W, H);
if (f.x !== 1 || f.y !== 1) fail("full frame must stay full");
f = measureFill(img(W, H, () => false), W, H);
if (f.x !== 1 || f.y !== 1) fail(`all-dark frame read as ${JSON.stringify(f)}`);
f = measureFill(img(W, H, (x, y) => x >= 20 && x < 140 && y >= 10 && y < 80), W, H);
if (!near(f.x, 0.75) || !near(f.y, 70 / 90)) fail(`both-axis bars read as ${JSON.stringify(f)}`);
console.log("✓ frame");
