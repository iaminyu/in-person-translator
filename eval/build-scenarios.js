// Synthesizes the hand-written scenario sentences in eval/scenarios.json into
// audio with the macOS `say` voices (needs macOS + ffmpeg). These clips are
// computer-generated speech, so the report always shows them separately from
// the real human recordings.
//
// Usage (from the repo root): node eval/build-scenarios.js
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const VOICES = { zh: "Tingting", th: "Kanya" };
const outDir = path.join(__dirname, "data", "scenarios");
const scenarios = JSON.parse(
  fs.readFileSync(path.join(__dirname, "scenarios.json"), "utf8")
);

fs.mkdirSync(outDir, { recursive: true });
const samples = [];
for (const item of scenarios) {
  const aiff = path.join(outDir, `${item.id}.aiff`);
  const wav = path.join(outDir, `${item.id}.wav`);
  execFileSync("say", ["-v", VOICES[item.srcLang], "-o", aiff, item.sourceText]);
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y", "-i", aiff,
    "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav
  ]);
  fs.unlinkSync(aiff);
  const seconds = (fs.statSync(wav).size - 44) / 32000;
  samples.push({
    id: item.id,
    set: "scenario",
    srcLang: item.srcLang,
    tgtLang: item.srcLang === "zh" ? "th" : "zh",
    wav: `scenarios/${item.id}.wav`,
    seconds: Math.round(seconds * 100) / 100,
    category: item.category,
    sourceText: item.sourceText,
    referenceText: item.referenceText,
    notes: item.notes || ""
  });
}
fs.writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify(samples, null, 1)
);
console.log(`wrote ${samples.length} scenario clips to ${outDir}`);
