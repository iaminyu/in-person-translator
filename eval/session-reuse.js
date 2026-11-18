// Does it help to keep one Gemini Live session open over several turns,
// instead of a fresh session for every sentence (what the app does today)?
//
// Each made-up conversation in eval/data/sessions is run twice with the same
// code: every turn in its own session ("fresh"), and all turns one after
// another in a single session ("reused"). Only that differs.
//
// Usage (from the repo root): node eval/session-reuse.js --run <name>
// Writes eval/results/<name>/sessions.jsonl. Every call here is billed.
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const WebSocket = require("ws");

process.env.VERCEL = process.env.VERCEL || "1"; // keep server.js from listening
const app = require("../server.js");
const { buildGeminiLiveSetup, getGeminiEngineSettings } = app.__test.gemini;

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].slice(2)] = process.argv[i + 1];

const readPcm = (wavPath) =>
  execFileSync("ffmpeg", ["-loglevel", "error", "-i", wavPath, "-ar", "24000", "-ac", "1", "-f", "s16le", "pipe:1"], {
    maxBuffer: 64 * 1024 * 1024
  });

// Runs the given clips, in order, through ONE session. Resolves to one
// { outputText, heardText, error? } per clip.
function runSession(wavPaths) {
  const settings = getGeminiEngineSettings();
  return new Promise((resolve) => {
    const results = [];
    let index = -1;
    let current = null;
    let timer = null;
    let settled = false;
    const ws = new WebSocket(settings.liveUrl, { headers: { "x-goog-api-key": settings.apiKey } });
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (current) results.push({ ...current, error: error || "session ended early" });
      while (results.length < wavPaths.length) results.push({ outputText: "", heardText: "", error: error || "session ended early" });
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      resolve(results);
    };
    const nextTurn = () => {
      index += 1;
      if (index >= wavPaths.length) {
        current = null;
        finish();
        return;
      }
      current = { outputText: "", heardText: "" };
      clearTimeout(timer);
      timer = setTimeout(() => finish("no answer within 25 s"), 25000);
      const pcm = readPcm(wavPaths[index]);
      ws.send(JSON.stringify({ realtimeInput: { activityStart: {} } }));
      for (let at = 0; at < pcm.length; at += 4800) {
        ws.send(
          JSON.stringify({
            realtimeInput: { audio: { data: pcm.subarray(at, at + 4800).toString("base64"), mimeType: "audio/pcm;rate=24000" } }
          })
        );
      }
      ws.send(JSON.stringify({ realtimeInput: { activityEnd: {} } }));
    };
    ws.on("open", () => {
      ws.send(JSON.stringify({ setup: buildGeminiLiveSetup({ languageA: "Chinese", languageB: "Thai", model: settings.model }) }));
    });
    ws.on("message", (raw) => {
      let event;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (event.setupComplete) {
        nextTurn();
        return;
      }
      const content = event.serverContent;
      if (!content || !current) return;
      if (content.inputTranscription?.text) current.heardText += content.inputTranscription.text;
      if (content.outputTranscription?.text) current.outputText += content.outputTranscription.text;
      if (content.turnComplete) {
        results.push({ outputText: current.outputText.trim(), heardText: current.heardText.trim() });
        current = null;
        nextTurn();
      }
    });
    ws.on("error", (error) => finish(error.message));
    ws.on("close", (code, reason) => finish(`closed ${code} ${String(reason).slice(0, 80)}`));
  });
}

async function main() {
  if (!args.run) throw new Error("--run <name> is required");
  const dataDir = path.join(__dirname, "data");
  const sessions = JSON.parse(fs.readFileSync(path.join(dataDir, "sessions", "manifest.json"), "utf8"));
  const runDir = path.join(__dirname, "results", args.run);
  fs.mkdirSync(runDir, { recursive: true });
  const outPath = path.join(runDir, "sessions.jsonl");
  const done = new Set(
    fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line).turnId) : []
  );
  for (const session of sessions) {
    if (session.turns.every((turn) => done.has(turn.id))) continue;
    const wavs = session.turns.map((turn) => path.join(dataDir, turn.wav));
    // Network hiccups (a failed name lookup, a dropped socket) are retried;
    // a turn that still has no answer after that is a real failure.
    const withRetry = async (paths, tries) => {
      let results = [];
      for (let attempt = 1; attempt <= tries; attempt += 1) {
        results = await runSession(paths);
        if (!results.some((result) => result.error)) break;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      return results;
    };
    const reused = await withRetry(wavs, 3);
    const fresh = [];
    for (const wav of wavs) fresh.push((await withRetry([wav], 3))[0]);
    session.turns.forEach((turn, at) => {
      fs.appendFileSync(
        outPath,
        `${JSON.stringify({ turnId: turn.id, position: at + 1, srcLang: turn.srcLang, tgtLang: turn.tgtLang, sourceText: turn.sourceText, fresh: fresh[at], reused: reused[at] })}\n`
      );
    });
    console.log(`${session.id} done`);
  }
  console.log(`wrote ${outPath}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
