// Does telling Gemini which two languages to expect make its transcript of
// what was heard (the line under each card) more complete?
//
// Every clip is sent twice through the app's own translateAudioTurnGemini:
// once with the language hint (languageCodes) and once without, and the heard
// text is compared with the human transcript (character error rate).
//
//   node eval/transcription-hint.js --run 2026-11-17-hint [--sets tvspeech,fleurs] [--limit 5]
//
// --test openai: the same for OpenAI's gpt-transcribe (the page's fallback
//   for writing words down), with `languages` against nothing.
// --test gemini-output: Gemini's transcript of its own translation, with the
//   language hint against without. There is no human text for a translation,
//   so its audio is written down by gpt-transcribe (told the language) and
//   that is the reference.
//
// Results go to eval/results/<run>/transcription-hint.json (re-running skips
// what is done). Every Gemini Live call here is billed.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
process.env.VERCEL = process.env.VERCEL || "1";
const app = require("../server.js");
const { translateAudioTurnGemini } = app.__test.gemini;
const TEST = (() => {
  const i = process.argv.indexOf("--test");
  return i >= 0 ? process.argv[i + 1] : "gemini-input";
})();
const ARMS = { "gemini-input": ["hint", "none"], openai: ["hint", "none"], "gemini-output": ["hint", "none"] }[TEST];
const LANG_NAME = { zh: "Chinese", th: "Thai" };
const OTHER = { zh: "th", th: "zh" };

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const RUN = arg("run", "transcription-hint");
const SETS = arg("sets", "mixed,tvspeech,fleurs,gigaspeech2,ramc").split(",");
const LIMIT = Number(arg("limit", 0)) || Infinity;
const CONCURRENCY = 4;
const DATA = path.join(__dirname, "data");
const OUT_DIR = path.join(__dirname, "results", RUN);
const OUT = path.join(OUT_DIR, TEST === "gemini-input" ? "transcription-hint.json" : `transcription-hint-${TEST}.json`);

// Sentences like the one that went wrong: one language with a brand or
// English word inside. Spoken by macOS voices, so kept apart in the report.
const MIXED = [
  ["th", "ใช่ ฉันแค่สั่งตอนนี้ เขาก็จะส่งมาทันที เร็วเหมือน Grab ส่งอาหารเลย"],
  ["th", "เดี๋ยวเรียก Grab ไปสนามบินดีกว่า ไม่ต้องขับรถเอง"],
  ["th", "ร้านนี้จ่ายผ่าน LINE Pay ได้ไหมคะ"],
  ["th", "ซื้อของใน Shopee ถูกกว่าในห้างเยอะเลย"],
  ["th", "ข้างหน้ามี 7-Eleven ไปซื้อน้ำก่อนนะ"],
  ["zh", "我刚才用Grab叫了车，大概十分钟就到"],
  ["zh", "你可以加我的LINE吗，我把地址发给你"],
  ["zh", "这个在Shopee上买要便宜很多"],
  ["zh", "我的iPhone没电了，能借一下充电器吗"],
  ["zh", "我们在7-Eleven门口等你"]
];

function mixedSamples() {
  const dir = path.join(DATA, "mixed");
  fs.mkdirSync(dir, { recursive: true });
  return MIXED.map(([lang, text], i) => {
    const wav = path.join(dir, `mixed-${String(i + 1).padStart(2, "0")}.wav`);
    if (!fs.existsSync(wav)) {
      const aiff = wav.replace(/\.wav$/, ".aiff");
      execFileSync("say", ["-v", lang === "th" ? "Kanya" : "Tingting", "-o", aiff, text]);
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", aiff, "-ar", "24000", "-ac", "1", wav]);
      fs.unlinkSync(aiff);
    }
    return { id: `mixed-${i + 1}`, set: "mixed", srcLang: lang, wavPath: wav, sourceText: text };
  });
}

function loadSamples() {
  const samples = [];
  for (const set of SETS) {
    if (set === "mixed") {
      samples.push(...mixedSamples().slice(0, LIMIT));
      continue;
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(DATA, set, "manifest.json"), "utf8"));
    samples.push(
      ...manifest.slice(0, LIMIT).map((s) => ({ ...s, wavPath: path.join(DATA, s.wav) }))
    );
  }
  return samples;
}

function readPcm(wavPath) {
  return execFileSync(
    "ffmpeg",
    ["-loglevel", "error", "-i", wavPath, "-ar", "24000", "-ac", "1", "-f", "s16le", "pipe:1"],
    { maxBuffer: 64 * 1024 * 1024 }
  );
}

const normalize = (text) =>
  Array.from(String(text || "").normalize("NFC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, ""));

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function score(reference, heard) {
  const ref = normalize(reference);
  const hyp = normalize(heard);
  const own = /\p{Script=Thai}|\p{Script=Han}/u;
  const ownCount = (chars) => chars.filter((c) => own.test(c)).length;
  return {
    refChars: ref.length,
    errors: editDistance(ref, hyp),
    cer: ref.length ? editDistance(ref, hyp) / ref.length : 0,
    // Most of the Thai or Chinese of the sentence is missing from what was heard.
    lost: ownCount(ref) > 0 && ownCount(hyp) < ownCount(ref) * 0.5
  };
}

function wav(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function transcribe(pcm, fields) {
  const form = new FormData();
  form.append("model", "gpt-transcribe");
  for (const [k, v] of fields) form.append(k, v);
  form.append("file", new Blob([wav(pcm)], { type: "audio/wav" }), "a.wav");
  const key = process.env.OPENAI_API_KEY_PAID || process.env.OPENAI_API_KEY;
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form
  });
  if (!response.ok) throw new Error(`transcribe ${response.status}: ${await response.text()}`);
  return (await response.json()).text || "";
}

async function runOne(sample, hint) {
  if (TEST === "openai") {
    const heard = await transcribe(readPcm(sample.wavPath), hint ? [["languages[]", "zh"], ["languages[]", "th"]] : []);
    return { heard, score: score(sample.sourceText, heard) };
  }
  const result = await translateAudioTurnGemini({
    geminiApiKey: process.env.GEMINI_API_KEY,
    audioBase64: readPcm(sample.wavPath).toString("base64"),
    languageA: "Chinese",
    languageB: "Thai",
    onAudioDelta: () => {},
    outputTranscriptionHint: hint
  });
  const target = OTHER[sample.srcLang];
  const spoken = result.translatedPcmAudioBuffer.length
    ? await transcribe(result.translatedPcmAudioBuffer, [["language", target]])
    : "";
  const text = result.translatedText || "";
  const targetScript = target === "th" ? /\p{Script=Thai}/u : /\p{Script=Han}/u;
  return {
    heard: result.sourceText,
    translated: text,
    spoken,
    incomplete: result.translatedTextIncomplete,
    score: {
      ...score(spoken, text),
      empty: !text.trim(),
      wrongScript: Boolean(text.trim()) && !targetScript.test(text)
    }
  };
}

async function runGeminiInput(sample, transcriptionHint) {
  const result = await translateAudioTurnGemini({
    geminiApiKey: process.env.GEMINI_API_KEY,
    audioBase64: readPcm(sample.wavPath).toString("base64"),
    languageA: "Chinese",
    languageB: "Thai",
    onAudioDelta: () => {},
    transcriptionHint
  });
  return { heard: result.sourceText, translated: result.translatedText, usage: result.usageMetadata };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const jobs = [];
  for (const sample of loadSamples()) {
    for (const arm of ARMS) {
      const key = `${sample.id}|${arm}`;
      if (results[key] && !results[key].error) continue;
      jobs.push({ key, sample, arm });
    }
  }
  console.log(`${jobs.length} turns to run`);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { key, sample, arm } = jobs[next++];
      try {
        let out;
        if (TEST === "gemini-input") {
          const r = await runGeminiInput(sample, arm === "hint");
          out = { ...r, ...score(sample.sourceText, r.heard) };
        } else {
          const r = await runOne(sample, arm === "hint");
          out = { ...r, ...r.score };
          delete out.score;
        }
        results[key] = { id: sample.id, set: sample.set, srcLang: sample.srcLang, arm, reference: sample.sourceText, ...out };
      } catch (error) {
        results[key] = { id: sample.id, set: sample.set, arm, error: String(error.message || error) };
      }
      done += 1;
      if (done % 10 === 0) {
        console.log(`${done}/${jobs.length}`);
        fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  report(results);
}

function report(results) {
  const rows = Object.values(results);
  const errors = rows.filter((r) => r.error);
  if (errors.length) console.log(`errors: ${errors.length}`, errors.slice(0, 3).map((e) => e.error));
  const groups = {};
  for (const r of rows.filter((x) => !x.error)) {
    const mixed = r.set === "mixed" || /[A-Za-z]/.test(r.reference) ? "with English words" : "";
    for (const g of [r.set, mixed && `real ${mixed}`, "all real"].filter(Boolean)) {
      if (g === "all real" && r.set === "mixed") continue;
      if (g.startsWith("real") && r.set === "mixed") continue;
      groups[g] = groups[g] || { hint: [], none: [] };
      groups[g][r.arm].push(r);
    }
  }
  console.log(`\n[${TEST}] group | arm | clips | CER | lost most of the sentence | empty | incomplete | wrong script`);
  for (const [g, arms] of Object.entries(groups)) {
    for (const arm of ["none", "hint"]) {
      const list = arms[arm];
      const errs = list.reduce((s, r) => s + r.errors, 0);
      const chars = list.reduce((s, r) => s + r.refChars, 0);
      console.log(
        `${g} | ${arm} | ${list.length} | ${((errs / Math.max(1, chars)) * 100).toFixed(1)}% | ${list.filter((r) => r.lost).length} | ${list.filter((r) => r.empty).length} | ${list.filter((r) => r.incomplete).length} | ${list.filter((r) => r.wrongScript).length}`
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
