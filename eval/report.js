// Turns a judged run into a Markdown report, in English or in Chinese.
//
// Usage (from the repo root): node eval/report.js --run <name> [--lang en|zh]
// Output: eval/reports/<name>.md (English, the default) or <name>.zh-CN.md.
//
// A run can have a companion file, eval/reports/<name>.notes.json:
//   "labels":  { "<system>": { "en": "...", "zh": "..." } }  what a system was
//              called when the run was made, where that has since changed;
//   "notesEn": { "<judgment key>": "..." }  English for a judge's note that
//              was written in Chinese only (runs judged before 2026-11-18).
const fs = require("fs");
const path = require("path");
const { keyFor, JUDGES } = require("./judge");
const { SYSTEMS, scriptLanguage } = require("./lib/systems");

const TEXT = {
  en: {
    sets: {
      fleurs: "Read recordings (FLEURS)",
      scenario: "Travel sentences (synthetic voice)",
      tvspeech: "Unscripted speech (Thai YouTube)",
      ramc: "Face-to-face chat (Mandarin)",
      gigaspeech2: "Videos of all kinds (Thai YouTube)"
    },
    directions: { zh: "Chinese→Thai", th: "Thai→Chinese" },
    title: (run) => `# Chinese and Thai speech translation evaluation: ${run}`,
    intro: (openai, gemini) =>
      "Every recording was translated several times by each system, then judged by two independent text models " +
      `(OpenAI \`${openai}\` and Google \`${gemini}\`) that could not see which system a translation came from.`,
    legend: [
      "- **Confirmed error**: both judges say the listener would get wrong or clearly incomplete information (or there was no output, or it was in the wrong language).",
      "- **Disputed**: only one judge says so.",
      "- **Minor**: the meaning is right; a particle, a greeting or a shade of wording was lost.",
      "- The judges read the text each system gave for its translation, not the sound it actually spoke."
    ],
    overview: "Overview",
    overviewHead: "| System | Test set | Direction | Runs | Confirmed errors | Disputed | Minor | Fully correct | Failed calls |",
    all: "**All**",
    withShare: (count, share) => `${count} (${share})`,
    stability: "Is the same sentence translated the same way each time",
    stabilityNote:
      "Each recording was run several times. It counts as \"went wrong\" if any run was a confirmed error, and as \"wrong every time\" if every run was.",
    stabilityHead: "| System | Recordings | Went wrong at least once | Wrong every time |",
    errorTypes: "Error types (among confirmed errors, any type either judge marked)",
    system: "System",
    typeNames: {
      mishearing_or_wrong_word: "Misheard or wrong word", omission: "Omission", addition: "Addition",
      number_or_time: "Number or time", name_or_place: "Name or place", negation: "Negation",
      wrong_language: "Wrong language", answered_instead_of_translating: "Answered instead of translating",
      empty: "No output", other: "Other"
    },
    speed: "Speed (for rough comparison only)",
    speedNote:
      "Four systems ran at the same time during the evaluation, so times are longer than in normal use and only good " +
      "for comparing systems with each other. \"Transcribe, then translate\" is timed to the translated text only, " +
      "without the time to synthesize speech.",
    speedHead: "| System | Measure | Median |",
    seconds: (value) => `${value} s`,
    measures: {
      translateStart: "Translation starts speaking (relative to the end of the speaker's sentence; negative means before the speaker finished)",
      translateEnd: "Translation finishes (relative to the end of the speaker's sentence)",
      direct: "End of speech to first translated audio (connection ready in advance, audio sent while speaking)",
      handsFree: "Last word to first translated audio (no button; includes the wait to decide the sentence is over)",
      cascade: "End of speech to translated text",
      upload: "End of speech to first translated audio (including connecting)"
    },
    details: "Confirmed errors in detail",
    detailsTitle: (label, count) => `### ${label} (${count} runs)`,
    none: "None.",
    detailsHead: "| Sample | What was said | Reference translation | Translation given | Judge's note |",
    times: (count) => ` (${count}×)`,
    noOutput: "No output",
    emptyCell: "(empty)"
  },
  zh: {
    sets: {
      fleurs: "真人朗读（FLEURS）",
      scenario: "场景句（合成语音）",
      tvspeech: "真人自由讲话（泰语 YouTube）",
      ramc: "真人面对面闲聊（中文）",
      gigaspeech2: "真人各类视频（泰语 YouTube）"
    },
    directions: { zh: "中文→泰语", th: "泰语→中文" },
    title: (run) => `# 中泰语音翻译评测：${run}`,
    intro: (openai, gemini) =>
      "每条语音让每个方案各翻译多遍，再由两个互相独立的文本模型当裁判" +
      `（OpenAI \`${openai}\` 和 Google \`${gemini}\`），裁判看不到译文来自哪个方案。`,
    legend: [
      "- **确定错误**：两个裁判都认为听的人会得到错误或明显不完整的信息（或者没有输出、输出语言不对）。",
      "- **有争议**：只有一个裁判这么认为。",
      "- **小瑕疵**：意思没错，只是丢了语气词、问候语或用词不够精确。",
      "- 裁判评的是各方案给出的译文文字，不是它实际读出来的声音。"
    ],
    overview: "总览",
    overviewHead: "| 方案 | 样本集 | 方向 | 次数 | 确定错误 | 有争议 | 小瑕疵 | 完全正确 | 调用失败 |",
    all: "**合计**",
    withShare: (count, share) => `${count}（${share}）`,
    stability: "同一句话多次翻译是否稳定",
    stabilityNote: "同一条语音跑多遍，只要有一遍是确定错误就算“出过错”；每一遍都是确定错误算“每次都错”。",
    stabilityHead: "| 方案 | 样本数 | 出过错的样本 | 每次都错的样本 |",
    errorTypes: "错误类型（确定错误里，任一裁判标注到的类型）",
    system: "方案",
    typeNames: {
      mishearing_or_wrong_word: "听错或用错词", omission: "漏译", addition: "多译", number_or_time: "数字或时间",
      name_or_place: "人名地名", negation: "否定", wrong_language: "语言不对",
      answered_instead_of_translating: "去回答而不是翻译", empty: "没有输出", other: "其他"
    },
    speed: "速度（仅供参考）",
    speedNote:
      "评测时四个方案同时并发跑，时间会比单独使用时偏长，只适合横向粗比。" +
      "“先转文字再翻译”只统计到出译文文字为止，没有包含合成语音的时间。",
    speedHead: "| 方案 | 指标 | 中位数 |",
    seconds: (value) => `${value} 秒`,
    measures: {
      translateStart: "译文开始出声（相对说话人说完，负数表示还没说完就开始）",
      translateEnd: "译文读完（相对说话人说完）",
      direct: "说完到听到第一段译文语音（连接已提前就绪，边说边传）",
      handsFree: "最后一个字到听到第一段译文语音（不按键，含判断说完的等待）",
      cascade: "说完到出译文文字",
      upload: "说完到听到第一段译文语音（含建立连接）"
    },
    details: "确定错误明细",
    detailsTitle: (label, count) => `### ${label}（${count} 次）`,
    none: "无。",
    detailsHead: "| 样本 | 原话 | 参考译文 | 实际译文 | 裁判说明 |",
    times: (count) => `（${count} 次）`,
    noOutput: "没有输出",
    emptyCell: "（空）"
  }
};

const readJsonl = (file) =>
  fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const median = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const pct = (count, total) => (total ? `${((count / total) * 100).toFixed(1)}%` : "—");
const cell = (text) => String(text || "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

function loadSamples() {
  const samples = new Map();
  for (const folder of ["fleurs", "scenarios", "tvspeech", "ramc", "gigaspeech2"]) {
    const file = path.join(__dirname, "data", folder, "manifest.json");
    if (!fs.existsSync(file)) continue;
    for (const row of JSON.parse(fs.readFileSync(file, "utf8"))) samples.set(row.id, row);
  }
  return samples;
}

// consensus: "major" only when both judges say major; "disputed" when exactly
// one does; otherwise the milder of the remaining verdicts.
function grade(row, sample, judgments) {
  const text = String(row.outputText || "").trim();
  const verdicts = Object.keys(JUDGES).map((judge) => judgments.get(keyFor(judge, row.sampleId, text)));
  if (verdicts.some((verdict) => !verdict)) return { level: "unjudged", verdicts };
  const majors = verdicts.filter((verdict) => verdict.verdict === "major").length;
  const wrongLanguage = text && scriptLanguage(text) && scriptLanguage(text) !== sample.tgtLang;
  let level = "correct";
  if (majors === verdicts.length || !text || wrongLanguage) level = "major";
  else if (majors > 0) level = "disputed";
  else if (verdicts.some((verdict) => verdict.verdict === "minor")) level = "minor";
  return { level, verdicts, wrongLanguage: Boolean(wrongLanguage) };
}

function main() {
  const runIndex = process.argv.indexOf("--run");
  if (runIndex < 0) throw new Error("--run <name> is required");
  const runName = process.argv[runIndex + 1];
  const langIndex = process.argv.indexOf("--lang");
  const lang = langIndex < 0 ? "en" : process.argv[langIndex + 1];
  const t = TEXT[lang];
  if (!t) throw new Error("--lang is en or zh");
  const runDir = path.join(__dirname, "results", runName);
  const reportsDir = path.join(__dirname, "reports");
  const notesPath = path.join(reportsDir, `${runName}.notes.json`);
  const notes = fs.existsSync(notesPath) ? JSON.parse(fs.readFileSync(notesPath, "utf8")) : {};
  const samples = loadSamples();
  const allRows = readJsonl(path.join(runDir, "outputs.jsonl"));
  const judgments = new Map(readJsonl(path.join(runDir, "judgments.jsonl")).map((row) => [row.key, row]));

  const labelOf = (system) =>
    notes.labels?.[system]?.[lang] ||
    (lang === "en" ? SYSTEMS[system].labelEn : SYSTEMS[system].label) ||
    SYSTEMS[system].label ||
    system;
  const secs = (ms) => (ms === null ? "—" : t.seconds((ms / 1000).toFixed(1)));
  // A judge's note in the report's language, when there is one.
  const noteOf = (verdict) => {
    if (!verdict) return "";
    if (lang !== "en") return verdict.explanation || "";
    return verdict.explanationEn || notes.notesEn?.[verdict.key] || verdict.explanation || "";
  };

  // keep the last attempt for each (system, sample, pass)
  const latest = new Map();
  for (const row of allRows) latest.set(`${row.system}|${row.sampleId}|${row.pass}`, row);
  const rows = [...latest.values()].map((row) => {
    const sample = samples.get(row.sampleId);
    return { ...row, sample, grade: row.error ? { level: "failed" } : grade(row, sample, judgments) };
  });
  const systems = Object.keys(SYSTEMS).filter((name) => rows.some((row) => row.system === name));

  const out = [];
  out.push(t.title(runName), "");
  out.push(t.intro(JUDGES.openai, JUDGES.gemini), "", ...t.legend, "");

  out.push(`## ${t.overview}`, "");
  out.push(t.overviewHead, "|---|---|---|---|---|---|---|---|---|");
  for (const system of systems) {
    for (const set of Object.keys(t.sets)) {
      for (const dir of ["zh", "th", "all"]) {
        const group = rows.filter(
          (row) => row.system === system && row.sample.set === set && (dir === "all" || row.sample.srcLang === dir)
        );
        if (!group.length) continue;
        const count = (level) => group.filter((row) => row.grade.level === level).length;
        const judged = group.length - count("failed") - count("unjudged");
        const label = dir === "all" ? t.all : t.directions[dir];
        const strong = (text) => (dir === "all" ? `**${text}**` : text);
        out.push(
          `| ${labelOf(system)} | ${t.sets[set]} | ${label} | ${group.length} | ` +
            `${strong(t.withShare(count("major"), pct(count("major"), judged)))} | ${count("disputed")} | ${count("minor")} | ` +
            `${t.withShare(count("correct"), pct(count("correct"), judged))} | ${count("failed")} |`
        );
      }
    }
  }
  out.push("");

  out.push(`## ${t.stability}`, "");
  out.push(t.stabilityNote, "");
  out.push(t.stabilityHead, "|---|---|---|---|");
  for (const system of systems) {
    const bySample = new Map();
    for (const row of rows.filter((item) => item.system === system)) {
      if (!bySample.has(row.sampleId)) bySample.set(row.sampleId, []);
      bySample.get(row.sampleId).push(row.grade.level);
    }
    const lists = [...bySample.values()];
    const any = lists.filter((levels) => levels.includes("major")).length;
    const every = lists.filter((levels) => levels.every((level) => level === "major")).length;
    out.push(`| ${labelOf(system)} | ${lists.length} | ${any} | ${every} |`);
  }
  out.push("");

  out.push(`## ${t.errorTypes}`, "");
  const typeNames = t.typeNames;
  out.push(`| ${t.system} | ${Object.values(typeNames).join(" | ")} |`, `|---|${Object.keys(typeNames).map(() => "---").join("|")}|`);
  for (const system of systems) {
    const counts = Object.fromEntries(Object.keys(typeNames).map((type) => [type, 0]));
    for (const row of rows.filter((item) => item.system === system && item.grade.level === "major")) {
      const types = new Set((row.grade.verdicts || []).flatMap((verdict) => verdict?.errorTypes || []));
      if (!String(row.outputText || "").trim()) types.add("empty");
      if (row.grade.wrongLanguage) types.add("wrong_language");
      for (const type of types) counts[type] += 1;
    }
    out.push(`| ${labelOf(system)} | ${Object.keys(typeNames).map((type) => counts[type]).join(" | ")} |`);
  }
  out.push("");

  out.push(`## ${t.speed}`, "");
  out.push(t.speedNote, "");
  out.push(t.speedHead, "|---|---|---|");
  for (const system of systems) {
    const group = rows.filter((row) => row.system === system && !row.error);
    const pick = (field) => median(group.map((row) => row.latency?.[field]));
    const line = (measure, field) => out.push(`| ${labelOf(system)} | ${t.measures[measure]} | ${secs(pick(field))} |`);
    if (system === "gemini-translate") {
      line("translateStart", "firstSpeechAfterSpeakerEndMs");
      line("translateEnd", "lastSpeechAfterSpeakerEndMs");
    } else if (system === "gemini-direct") {
      line("direct", "firstAudioAfterReleaseMs");
    } else if (system === "gemini-handsfree" || system === "gemini-handsfree-normalized") {
      line("handsFree", "firstAudioAfterSpeechEndMs");
    } else if (system === "cascade") {
      line("cascade", "totalMs");
    } else {
      line("upload", "firstAudioMs");
    }
  }
  out.push("");

  out.push(`## ${t.details}`, "");
  for (const system of systems) {
    const bad = rows.filter((row) => row.system === system && row.grade.level === "major");
    out.push(t.detailsTitle(labelOf(system), bad.length), "");
    if (!bad.length) {
      out.push(t.none, "");
      continue;
    }
    const seen = new Map();
    for (const row of bad) {
      const key = `${row.sampleId}|${String(row.outputText || "").trim()}`;
      if (!seen.has(key)) seen.set(key, { row, times: 0 });
      seen.get(key).times += 1;
    }
    out.push(t.detailsHead, "|---|---|---|---|---|");
    for (const { row, times } of seen.values()) {
      const noted = (row.grade.verdicts || []).find((verdict) => verdict?.explanation);
      const why = noteOf(noted) || t.noOutput;
      out.push(
        `| ${row.sampleId}${times > 1 ? t.times(times) : ""} | ${cell(row.sample.sourceText)} | ${cell(row.sample.referenceText)} | ` +
          `${cell(row.outputText) || t.emptyCell} | ${cell(why)} |`
      );
    }
    out.push("");
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, lang === "en" ? `${runName}.md` : `${runName}.zh-CN.md`);
  fs.writeFileSync(reportPath, `${out.join("\n")}\n`);
  console.log(`report: ${reportPath}`);
}

main();
