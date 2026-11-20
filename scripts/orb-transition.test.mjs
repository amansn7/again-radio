import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

test("Orb.astro defines all required motion graphics states and elements", () => {
  const orbAstro = fs.readFileSync(path.join(ROOT, "src/components/Orb.astro"), "utf-8");
  assert.ok(orbAstro.includes('class="o-aura"'), "Includes vocal luminescence aura");
  assert.ok(orbAstro.includes('class="o-morph-ring"'), "Includes motion graphics shockwave/implosion ring");
  assert.ok(orbAstro.includes('data-state="idle"'), "Has initial data-state idle");
  assert.ok(orbAstro.includes('data-state="morph-to-speech"'), "Defines morph-to-speech styles");
  assert.ok(orbAstro.includes('data-state="speech"'), "Defines speech styles");
  assert.ok(orbAstro.includes('data-state="morph-to-orb"'), "Defines morph-to-orb styles");
  assert.ok(orbAstro.includes('o-shockwave-out'), "Defines shockwave out animation");
  assert.ok(orbAstro.includes('o-shockwave-in'), "Defines shockwave in animation");
  assert.ok(orbAstro.includes('o-body-to-wave'), "Defines body to wave morph animation");
  assert.ok(orbAstro.includes('o-body-to-orb'), "Defines body to orb rebound animation");
  assert.ok(orbAstro.includes('prefers-reduced-motion'), "Handles prefers-reduced-motion");
});

test("orb-wave.ts supports uProgress morph and uVoice uniforms", () => {
  const waveTs = fs.readFileSync(path.join(ROOT, "src/components/orb-wave.ts"), "utf-8");
  assert.ok(waveTs.includes("uniform float uProgress;"), "Shader includes uProgress uniform");
  assert.ok(waveTs.includes("uniform float uVoice;"), "Shader includes uVoice uniform");
  assert.ok(waveTs.includes("uniform vec3 uAccent;"), "Shader includes uAccent uniform");
  assert.ok(waveTs.includes("morphTo("), "WaveRenderer interface exposes morphTo method");
  assert.ok(waveTs.includes("setVoiceIntensity("), "WaveRenderer interface exposes setVoiceIntensity");
});

test("orb.ts implements the state machine for Rory voice transitions", () => {
  const orbTs = fs.readFileSync(path.join(ROOT, "src/components/orb.ts"), "utf-8");
  assert.ok(orbTs.includes('"morph-to-speech"'), "Handles morph-to-speech");
  assert.ok(orbTs.includes('"speech"'), "Handles speech");
  assert.ok(orbTs.includes('"morph-to-orb"'), "Handles morph-to-orb");
  assert.ok(orbTs.includes('"idle"'), "Handles idle");
  assert.ok(orbTs.includes("RADIO_JOCKEY_SPEAK"), "Listens to RADIO_JOCKEY_SPEAK");
  assert.ok(orbTs.includes("RADIO_JOCKEY_END"), "Listens to RADIO_JOCKEY_END");
});
