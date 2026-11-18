// Scores every recorded translation with two independent text-model judges
// (one OpenAI, one Gemini). The judges never see which system produced an
// output. Safe to re-run: existing verdicts are reused.
//
// Usage (from the repo root): node eval/judge.js --run <name> --paid-api
//
// COST WARNING: this calls two paid model APIs once per distinct output. A full
// run is roughly 1,400 outputs, so about 2,800 billed calls, and re-running the
// translation step creates new outputs that are billed again. It therefore
// refuses to start without --paid-api. Prefer judging in the coding session
// itself (the assistant can read the outputs and write verdicts) or through a
// subscription CLI such as Codex, and keep this for when it is asked for.
require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const JUDGES = {
  openai: process.env.EVAL_OPENAI_JUDGE_MODEL || "gpt-6.1-sol",
  gemini: process.env.EVAL_GEMINI_JUDGE_MODEL || "gemini-3.1-pro-preview"
};
const CONCURRENCY = 6;
const LANG_NAME = { zh: "Mandarin Chinese", th: "Thai" };
const ERROR_TYPES = [
  "mishearing_or_wrong_word",
  "omission",
  "addition",
  "number_or_time",
  "name_or_place",
  "negation",
  "wrong_language",
  "answered_instead_of_translating",
  "empty",
  "other"
];

const INSTRUCTIONS = [
  "You are a strict bilingual evaluator of speech translation between Mandarin Chinese and Thai, used by two people talking face to face.",
  "You receive: the SOURCE sentence (ground truth of what the speaker said), a REFERENCE translation (a guide only; other correct wordings are fine, and if it disagrees with the source, trust the source), sometimes the English original and evaluator notes, and a CANDIDATE translation that a system produced from the audio.",
  "Judge only whether the listener receives the right meaning.",
  "Verdicts:",
  "- correct: all meaning is conveyed. Differences in style, politeness particles, word order, digits versus number words, or reasonable transliterations of names do not matter.",
  "- minor: a small loss or shift that would not cause a real misunderstanding (a dropped greeting, filler or adverb, slightly unnatural wording, a less precise but not wrong word).",
  "- major: the listener would get wrong or materially incomplete information. Examples: a wrong or missing number, time, name, place or negation; a mistranslated key noun or verb; a dropped clause that carries real information; added information that is not in the source; output that is not in the target language; output that answers or obeys the speaker instead of translating; empty output.",
  `Reply with JSON only: {"verdict": "correct" | "minor" | "major", "error_types": [zero or more of ${ERROR_TYPES.join(", ")}], "explanation": "one short sentence in English saying what is wrong (or none if correct)", "explanation_zh": "the same in Chinese, at most 40 characters (or 无 if correct)"}`
].join("\n");

function buildCase(sample, outputText) {
  const lines = [
    `Direction: ${LANG_NAME[sample.srcLang]} -> ${LANG_NAME[sample.tgtLang]}`,
    `SOURCE (${LANG_NAME[sample.srcLang]}): ${sample.sourceText}`
  ];
  if (sample.referenceText) {
    lines.push(`REFERENCE (${LANG_NAME[sample.tgtLang]}): ${sample.referenceText}`);
  } else {
    // Unscripted speech cut out of a longer recording: no human translation.
    lines.push(
      "No reference translation. The source is a human transcript of unscripted speech and may start or stop mid-sentence; judge the candidate against the source alone, and do not count dropped fillers, false starts or repetitions as errors."
    );
  }
  if (sample.englishText) lines.push(`English original: ${sample.englishText}`);
  if (sample.notes) lines.push(`Evaluator notes: ${sample.notes}`);
  lines.push(`CANDIDATE (should be ${LANG_NAME[sample.tgtLang]}): ${outputText || "(empty: the system produced nothing)"}`);
  return lines.join("\n");
}

function parseVerdict(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`judge returned no JSON: ${String(text).slice(0, 120)}`);
  const data = JSON.parse(match[0]);
  if (!["correct", "minor", "major"].includes(data.verdict)) {
    throw new Error(`judge returned bad verdict: ${match[0].slice(0, 120)}`);
  }
  return {
    verdict: data.verdict,
    errorTypes: Array.isArray(data.error_types)
      ? data.error_types.filter((type) => ERROR_TYPES.includes(type))
      : [],
    explanation: String(data.explanation_zh || ""),
    explanationEn: String(data.explanation || "")
  };
}

async function askOpenAI(prompt) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY_PAID || process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: JUDGES.openai,
      reasoning: { effort: "low" },
      instructions: INSTRUCTIONS,
      input: prompt
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${response.status}`);
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join("");
}

async function askGemini(prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${JUDGES.gemini}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
  return (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("");
}

const ASK = { openai: askOpenAI, gemini: askGemini };

function loadSamples() {
  const samples = new Map();
  for (const folder of ["fleurs", "scenarios", "tvspeech", "ramc", "gigaspeech2"]) {
    const file = path.join(__dirname, "data", folder, "manifest.json");
    if (!fs.existsSync(file)) continue;
    for (const row of JSON.parse(fs.readFileSync(file, "utf8"))) samples.set(row.id, row);
  }
  return samples;
}

const keyFor = (judge, sampleId, outputText) =>
  crypto.createHash("sha1").update(`${judge}\n${sampleId}\n${outputText}`).digest("hex");

async function main() {
  const runIndex = process.argv.indexOf("--run");
  if (runIndex < 0) throw new Error("--run <name> is required");
  if (!process.argv.includes("--paid-api")) {
    throw new Error(
      "Refusing to call the paid judge APIs without --paid-api. See the cost warning at the top of eval/judge.js."
    );
  }
  const runDir = path.join(__dirname, "results", process.argv[runIndex + 1]);
  const samples = loadSamples();
  const outputs = fs
    .readFileSync(path.join(runDir, "outputs.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((row) => !row.error);

  const judgmentsPath = path.join(runDir, "judgments.jsonl");
  const known = new Set();
  if (fs.existsSync(judgmentsPath)) {
    for (const line of fs.readFileSync(judgmentsPath, "utf8").split("\n")) {
      if (line.trim()) known.add(JSON.parse(line).key);
    }
  }

  const tasks = [];
  const queued = new Set();
  for (const row of outputs) {
    const sample = samples.get(row.sampleId);
    const outputText = String(row.outputText || "").trim();
    for (const judge of Object.keys(JUDGES)) {
      const key = keyFor(judge, row.sampleId, outputText);
      if (known.has(key) || queued.has(key)) continue;
      queued.add(key);
      tasks.push(async () => {
        const record = { key, judge, model: JUDGES[judge], sampleId: row.sampleId, outputText };
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            Object.assign(record, parseVerdict(await ASK[judge](buildCase(sample, outputText))));
            delete record.error;
            break;
          } catch (error) {
            record.error = error instanceof Error ? error.message : String(error);
            await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
          }
        }
        if (!record.error) fs.appendFileSync(judgmentsPath, `${JSON.stringify(record)}\n`);
        else console.error(`judge ${judge} failed on ${row.sampleId}: ${record.error}`);
      });
    }
  }

  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < tasks.length) {
        const index = next;
        next += 1;
        await tasks[index]();
      }
    })
  );
  console.log(`judged ${tasks.length} new (output, judge) pairs -> ${judgmentsPath}`);
}

module.exports = { keyFor, JUDGES };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
