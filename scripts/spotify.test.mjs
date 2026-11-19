import test from "node:test";
import assert from "node:assert/strict";
import { cleanTrackTitle, base64url } from "../src/lib/spotify.ts";

test("cleanTrackTitle strips feat and remix/edit tags", () => {
  assert.equal(cleanTrackTitle("Kammy (like i do)"), "Kammy (like i do)");
  assert.equal(cleanTrackTitle("Danielle (smile on my face) (feat. 070 Shake)"), "Danielle (smile on my face)");
  assert.equal(cleanTrackTitle("Places To Be (Club Edit)"), "Places To Be");
  assert.equal(cleanTrackTitle("Rumble (Remix)"), "Rumble");
});

test("base64url encodes without +, / or trailing =", () => {
  const bytes = new Uint8Array([251, 255, 254, 12, 180]);
  const encoded = base64url(bytes.buffer);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.equal(encoded.includes("+"), false);
  assert.equal(encoded.includes("/"), false);
  assert.equal(encoded.includes("="), false);
});
