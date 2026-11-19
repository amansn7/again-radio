import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const KEY_FILE = "/Users/amansaini/.t3/userdata/secrets/files/14546f8d49cd5e412feac60cc47489d5";
let apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey && fs.existsSync(KEY_FILE)) {
  apiKey = fs.readFileSync(KEY_FILE, "utf-8").trim();
}

if (!apiKey) {
  console.error("No ElevenLabs API key found.");
  process.exit(1);
}

const JOCKEY_JSON = path.join(ROOT, "public/data/jockey.json");
const jockeyData = JSON.parse(fs.readFileSync(JOCKEY_JSON, "utf-8"));
const voiceId = jockeyData.station?.voiceId || "pFZP5JQG7iQjIQuC4Bku";

const audioDir = path.join(ROOT, "public/audio/jockey");
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// Collect all clips to synthesize
const clips = [];

for (const s of jockeyData.sweepers || []) {
  clips.push({ id: s.id, audio: s.audio, text: s.text, label: `sweeper:${s.id}` });
}

for (const [title, trackData] of Object.entries(jockeyData.tracks || {})) {
  if (trackData.intro) {
    clips.push({ id: trackData.intro.id, audio: trackData.intro.audio, text: trackData.intro.text, label: `intro:${title}` });
  }
  if (trackData.outro) {
    clips.push({ id: trackData.outro.id, audio: trackData.outro.audio, text: trackData.outro.text, label: `outro:${title}` });
  }
}

for (const [key, t] of Object.entries(jockeyData.transitions || {})) {
  clips.push({ id: t.id, audio: t.audio, text: t.text, label: `transition:${key}` });
}

for (const f of jockeyData.facts || []) {
  clips.push({ id: f.id, audio: f.audio, text: f.text, label: `fact:${f.id}` });
}

console.log(`Found ${clips.length} clips to process.`);
let totalChars = clips.reduce((acc, c) => acc + c.text.length, 0);
console.log(`Total character count: ${totalChars}`);

async function synthesize(clip) {
  const relPath = clip.audio.startsWith("/") ? clip.audio.slice(1) : clip.audio;
  const targetFile = path.join(ROOT, "public", relPath);

  if (fs.existsSync(targetFile)) {
    console.log(`✓ Skipping (already exists): ${clip.label} -> ${relPath}`);
    return;
  }

  console.log(`🎙️ Synthesizing (${clip.text.length} chars) [${clip.label}]...`);
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg"
    },
    body: JSON.stringify({
      text: clip.text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: {
        stability: 0.65,
        similarity_boost: 0.82
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to synthesize ${clip.label}: ${response.status} ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(targetFile, Buffer.from(arrayBuffer));
  console.log(`✓ Saved ${clip.label} (${arrayBuffer.byteLength} bytes) -> ${relPath}`);
}

async function run() {
  let done = 0;
  for (const clip of clips) {
    try {
      await synthesize(clip);
      done++;
      // brief pause between calls
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`Error on ${clip.label}:`, err.message);
    }
  }
  console.log(`Completed synthesis: ${done}/${clips.length} processed.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
