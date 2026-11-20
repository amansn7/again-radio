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
const addClip = (clip) => {
  if (clip.audio) clips.push({ ...clip, text: clip.synthesisText ?? clip.text });
};

for (const w of jockeyData.welcomes || []) {
  addClip({ id: w.id, audio: w.audio, text: w.text, label: `welcome:${w.id}` });
}

for (const s of jockeyData.sweepers || []) {
  addClip({ id: s.id, audio: s.audio, text: s.text, label: `sweeper:${s.id}` });
}

for (const l of jockeyData.listeners || []) {
  addClip({ id: l.id, audio: l.audio, text: l.text, label: `listener:${l.id}` });
}

for (const [title, trackData] of Object.entries(jockeyData.tracks || {})) {
  if (trackData.intro) {
    addClip({
      id: trackData.intro.id, audio: trackData.intro.audio, text: trackData.intro.text,
      synthesisText: trackData.intro.synthesisText, delivery: trackData.intro.delivery,
      label: `intro:${title}`
    });
  }
  if (trackData.thought) {
    addClip({
      id: trackData.thought.id, audio: trackData.thought.audio, text: trackData.thought.text,
      synthesisText: trackData.thought.synthesisText, delivery: trackData.thought.delivery,
      label: `thought:${title}`
    });
  }
  if (trackData.outro) {
    addClip({
      id: trackData.outro.id, audio: trackData.outro.audio, text: trackData.outro.text,
      synthesisText: trackData.outro.synthesisText, delivery: trackData.outro.delivery,
      label: `outro:${title}`
    });
  }
}

for (const [key, t] of Object.entries(jockeyData.transitions || {})) {
  addClip({ id: t.id, audio: t.audio, text: t.text, label: `transition:${key}` });
}

for (const f of jockeyData.facts || []) {
  addClip({ id: f.id, audio: f.audio, text: f.text, label: `fact:${f.id}` });
}

const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const onlyIds = new Set(onlyArg ? onlyArg.slice("--only=".length).split(",") : []);
const replaceArg = process.argv.find((arg) => arg.startsWith("--replace="));
const replaceIds = new Set(replaceArg ? replaceArg.slice("--replace=".length).split(",") : []);
if (replaceIds.size && !onlyIds.size) {
  throw new Error("--replace requires --only so replacement cannot synthesize the full library.");
}
const clipsToProcess = onlyIds.size ? clips.filter((clip) => onlyIds.has(clip.id)) : clips;
if ((onlyIds.size && clipsToProcess.length !== onlyIds.size) ||
    [...replaceIds].some((id) => !clipsToProcess.some((clip) => clip.id === id))) {
  throw new Error("One or more --only clip IDs were not found; no synthesis requests sent.");
}

console.log(`Found ${clipsToProcess.length} clips to process.`);
let totalChars = clipsToProcess.reduce((acc, c) => acc + c.text.length, 0);
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

  if (fs.existsSync(targetFile) && !replaceIds.has(clip.id)) {
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
        stability: clip.delivery === "bright" ? 0.38 : 0.46,
        similarity_boost: 0.78,
        style: clip.delivery === "bright" ? 0.48 : 0.38,
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
  const missing = clipsToProcess.filter((clip) => replaceIds.has(clip.id) ||
    !fs.existsSync(path.join(ROOT, "public", clip.audio.replace(/^\//, ""))));
  const needed = missing.reduce((sum, clip) => sum + clip.text.length, 0);
  console.log(`ElevenLabs quota remaining: ${remaining}; missing clips need ${needed}.`);
  if (needed > remaining) {
    throw new Error("Insufficient ElevenLabs credits. No voice requests sent; rerun after the subscription resets or credits are added.");
  }
  let done = 0;
  for (const clip of clipsToProcess) {
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
  console.log(`Completed synthesis: ${done}/${clipsToProcess.length} processed.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
