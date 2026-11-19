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

for (const w of jockeyData.welcomes || []) {
  clips.push({ id: w.id, audio: w.audio, text: w.text, label: `welcome:${w.id}` });
}

for (const s of jockeyData.sweepers || []) {
  clips.push({ id: s.id, audio: s.audio, text: s.text, label: `sweeper:${s.id}` });
}

for (const l of jockeyData.listeners || []) {
  clips.push({ id: l.id, audio: l.audio, text: l.text, label: `listener:${l.id}` });
}

for (const [title, trackData] of Object.entries(jockeyData.tracks || {})) {
  if (trackData.intro) {
    clips.push({ id: trackData.intro.id, audio: trackData.intro.audio, text: trackData.intro.text, label: `intro:${title}` });
  }
  if (trackData.thought) {
    clips.push({ id: trackData.thought.id, audio: trackData.thought.audio, text: trackData.thought.text, label: `thought:${title}` });
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

async function remainingCharacters() {
  const response = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
    headers: { "xi-api-key": apiKey }
  });
  if (!response.ok) {
    throw new Error(`Cannot check ElevenLabs quota before synthesis: ${response.status} ${await response.text()}`);
  }
  const subscription = await response.json();
  const { character_limit: limit, character_count: used } = subscription;
  if (!Number.isFinite(limit) || !Number.isFinite(used) || used < 0 || limit < used) {
    throw new Error("ElevenLabs returned invalid quota data; refusing to send synthesis requests.");
  }
  return limit - used;
}

async function synthesize(clip) {
  const relPath = clip.audio.startsWith("/") ? clip.audio.slice(1) : clip.audio;
  const targetFile = path.join(ROOT, "public", relPath);

  if (fs.existsSync(targetFile)) {
    console.log(`✓ Skipping (already exists): ${clip.label} -> ${relPath}`);
    return;
  }

  console.log(`🎙️ Synthesizing (${clip.text.length} chars) [${clip.label}]...`);
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(url, {
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
        stability: 0.46,
        similarity_boost: 0.78,
        style: 0.38,
        use_speaker_boost: true
      }
    })
    });
    if (response.status !== 429 || attempt === 2) break;
    const retryAfter = response.headers.get("retry-after");
    const retrySeconds = Number(retryAfter);
    const waitSeconds = retryAfter && Number.isFinite(retrySeconds)
      ? Math.max(0, retrySeconds)
      : Math.max(0, (Date.parse(retryAfter ?? "") - Date.now()) / 1000) || 60;
    console.warn(`ElevenLabs rate limited; waiting ${waitSeconds}s before retrying ${clip.label}.`);
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to synthesize ${clip.label}: ${response.status} ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(targetFile, Buffer.from(arrayBuffer));
  console.log(`✓ Saved ${clip.label} (${arrayBuffer.byteLength} bytes) -> ${relPath}`);
}

async function run() {
  const remaining = await remainingCharacters();
  const missing = clips.filter((clip) => !fs.existsSync(path.join(ROOT, "public", clip.audio.replace(/^\//, ""))));
  const needed = missing.reduce((sum, clip) => sum + clip.text.length, 0);
  console.log(`ElevenLabs quota remaining: ${remaining}; missing clips need ${needed}.`);
  if (needed > remaining) {
    throw new Error("Insufficient ElevenLabs credits. No voice requests sent; rerun after the subscription resets or credits are added.");
  }
  let done = 0;
  for (const clip of clips) {
    try {
      await synthesize(clip);
      done++;
      // brief pause between calls
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`Error on ${clip.label}:`, err.message);
      if (/quota|character limit|subscription|401|402|429/i.test(err.message)) {
        console.error("Stopping synthesis to avoid further requests while the account is limited.");
        break;
      }
    }
  }
  console.log(`Completed synthesis: ${done}/${clips.length} processed.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
