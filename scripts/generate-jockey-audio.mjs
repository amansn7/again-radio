import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Every account uses the same premade voice, model and per-request settings, so the voice is identical.
const KEY_FILES = [
  "/Users/amansaini/.t3/userdata/secrets/files/14546f8d49cd5e412feac60cc47489d5",
  "/Users/amansaini/.t3/userdata/secrets/files/4434850ed697c7db73927775638f6a29",
];
const keys = [...new Set([
  process.env.ELEVENLABS_API_KEY,
  ...KEY_FILES.filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, "utf-8").trim()),
].filter(Boolean))];
if (!keys.length) {
  console.error("No ElevenLabs API key found.");
  process.exit(1);
}
// Credits each account keeps back for dynamic dialogue. Override with --reserve=N.
const reserveArg = process.argv.find((arg) => arg.startsWith("--reserve="));
const RESERVE = reserveArg ? Number(reserveArg.slice("--reserve=".length)) : 1500;

const JOCKEY_JSON = path.join(ROOT, "public/data/jockey.json");
const jockeyData = JSON.parse(fs.readFileSync(JOCKEY_JSON, "utf-8"));
const voiceId = jockeyData.station?.voiceId || "pFZP5JQG7iQjIQuC4Bku";

const audioDir = path.join(ROOT, "public/audio/jockey");
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// Collect all clips to synthesize. synthesisText carries pause marks the caption text should not show.
const clips = [];
const addClip = (clip, label) => {
  // One recording can serve several spellings of the same song.
  if (!clip?.audio || clips.some((c) => c.id === clip.id)) return;
  clips.push({ id: clip.id, audio: clip.audio, text: clip.synthesisText ?? clip.text, delivery: clip.delivery, label });
};

for (const w of jockeyData.welcomes || []) addClip(w, `welcome:${w.id}`);
for (const s of jockeyData.sweepers || []) addClip(s, `sweeper:${s.id}`);
for (const l of jockeyData.listeners || []) addClip(l, `listener:${l.id}`);
for (const [title, t] of Object.entries(jockeyData.tracks || {})) {
  addClip(t.intro, `intro:${title}`);
  addClip(t.introAlt, `intro-alt:${title}`);
  addClip(t.thought, `thought:${title}`);
  addClip(t.outro, `outro:${title}`);
}
for (const [key, t] of Object.entries(jockeyData.transitions || {})) addClip(t, `transition:${key}`);
for (const f of jockeyData.facts || []) addClip(f, `fact:${f.id}`);
for (const s of jockeyData.stationIds || []) addClip(s, `station-id:${s.id}`);

// Lower stability = more movement in the read; higher style = more emphasis. One voice, small shades.
const VOICE = {
  natural: { stability: 0.46, style: 0.38 },
  warm: { stability: 0.5, style: 0.34 },
  reflective: { stability: 0.56, style: 0.28 },
  playful: { stability: 0.4, style: 0.46 },
  bright: { stability: 0.38, style: 0.48 },
};

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

async function quota(key) {
  const response = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
    headers: { "xi-api-key": key }
  });
  if (!response.ok) {
    throw new Error(`Cannot check ElevenLabs quota before synthesis: ${response.status} ${await response.text()}`);
  }
  const subscription = await response.json();
  const { character_limit: limit, character_count: used } = subscription;
  if (!Number.isFinite(limit) || !Number.isFinite(used) || used < 0 || limit < used) {
    throw new Error("ElevenLabs returned invalid quota data; refusing to send synthesis requests.");
  }
  const reset = subscription.next_character_count_reset_unix;
  return { remaining: limit - used, resetAt: Number.isFinite(reset) ? new Date(reset * 1000).toISOString() : "unknown" };
}

// Billing is on spoken characters (break markup appears free); counting them 1:1 errs on the safe side.
const cost = (clip) => clip.text.replace(/<break[^>]*\/>/g, "").length;

/** The account with the most credit to spare above the reserve that can still afford this clip. */
const pick = (accounts, c) =>
  accounts.filter((a) => a.remaining - c >= RESERVE).sort((a, b) => b.remaining - a.remaining)[0];

async function synthesize(clip, account) {
  const relPath = clip.audio.startsWith("/") ? clip.audio.slice(1) : clip.audio;
  const targetFile = path.join(ROOT, "public", relPath);

  if (fs.existsSync(targetFile) && !replaceIds.has(clip.id)) {
    console.log(`✓ Skipping (already exists): ${clip.label} -> ${relPath}`);
    return;
  }

  console.log(`🎙️ Synthesizing (${cost(clip)} chars, ${account.name}) [${clip.label}]...`);
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": account.key,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg"
    },
    body: JSON.stringify({
      text: clip.text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: {
        ...(VOICE[clip.delivery] ?? VOICE.natural),
        similarity_boost: 0.78,
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
  const accounts = [];
  for (const [i, key] of keys.entries()) accounts.push({ name: `account ${i + 1}`, key, ...(await quota(key)) });
  for (const a of accounts) console.log(`ElevenLabs ${a.name}: ${a.remaining} remaining, resets ${a.resetAt}.`);
  const missing = clipsToProcess.filter((clip) => replaceIds.has(clip.id) ||
    !fs.existsSync(path.join(ROOT, "public", clip.audio.replace(/^\//, ""))));
  const needed = missing.reduce((sum, clip) => sum + cost(clip), 0);
  console.log(`Missing clips need ${needed}; each account keeps ${RESERVE} in reserve.`);

  // Plan every clip before sending anything: refuse the whole run rather than stop half way.
  const plan = accounts.map((a) => ({ ...a }));
  for (const clip of missing) {
    const a = pick(plan, cost(clip));
    if (!a) {
      const resets = accounts.map((x) => `${x.name} ${x.resetAt}`).join(", ");
      throw new Error(`Insufficient ElevenLabs credits above the ${RESERVE} reserve. No voice requests sent; resets: ${resets}.`);
    }
    a.remaining -= cost(clip);
  }

  let done = 0;
  for (const clip of clipsToProcess) {
    if (!missing.includes(clip)) {
      console.log(`✓ Skipping (already exists): ${clip.label}`);
      done++;
      continue;
    }
    let account = pick(accounts, cost(clip));
    while (true) {
      try {
        if (!account) throw new Error("no account can afford this clip above the reserve (quota)");
        await synthesize(clip, account);
        account.remaining -= cost(clip);
        done++;
        await new Promise((r) => setTimeout(r, 200));
        break;
      } catch (err) {
        console.error(`Error on ${clip.label}:`, err.message);
        if (!/quota|character limit|subscription|401|402|429/i.test(err.message)) break;
        // That account is spent or refusing: move to the other one, stop when none is left.
        if (account) account.remaining = 0;
        account = pick(accounts, cost(clip));
        if (!account) {
          const resets = accounts.map((x) => `${x.name} ${x.resetAt}`).join(", ");
          console.error(`Stopping synthesis; no further requests until a quota resets (${resets}).`);
          console.log(`Completed synthesis: ${done}/${clipsToProcess.length} processed.`);
          return;
        }
      }
    }
  }
  console.log(`Completed synthesis: ${done}/${clipsToProcess.length} processed.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
