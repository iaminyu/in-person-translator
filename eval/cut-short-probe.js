// Does translated speech reach the listener cut short?
//
// Runs real clips through both Gemini Live paths (the server engine and the
// browser's direct client) and, for every turn, compares what the app's own
// code handed on with everything Gemini actually sent on the wire.
//
// The app's socket is wrapped: when the app closes it, the wrapper keeps the
// real connection open a little longer and keeps recording, so audio that
// Gemini sends after the app stopped listening is seen and measured.
//
// Usage:
//   node eval/cut-short-probe.js --data <eval/data dir> --out <dir> \
//     --clips ramc/ramc-17:15,ramc/ramc-01:5 --paths server,direct \
//     [--concurrency 3] [--env <path to .env>] [--linger 12000]
//
// Every turn is billed. Nothing here is free to run.
const fs = require("fs");
const path = require("path");
const { AsyncLocalStorage } = require("async_hooks");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const repo = path.join(__dirname, "..");
const dataDir = path.resolve(arg("data", path.join(repo, "eval/data")));
const outDir = path.resolve(arg("out", path.join(repo, "eval/results/cut-short")));
const envPath = arg("env", path.join(repo, ".env"));
const concurrency = Number(arg("concurrency", "3"));
const lingerMs = Number(arg("linger", "12000"));
const paths = arg("paths", "server,direct").split(",").filter(Boolean);
const clipSpecs = arg("clips", "ramc/ramc-17:3")
  .split(",")
  .filter(Boolean)
  .map((spec) => {
    const [clip, times] = spec.split(":");
    return { clip, times: Number(times || 1) };
  });

require("dotenv").config({ path: envPath });
if (arg("live-url", "")) process.env.GEMINI_LIVE_URL = arg("live-url");
if (arg("direct-url", "")) process.env.GEMINI_LIVE_DIRECT_URL = arg("direct-url");
if (arg("tokens-url", "")) process.env.GEMINI_AUTH_TOKENS_URL = arg("tokens-url");
process.env.VERCEL = process.env.VERCEL || "1";

// --- The wire tap -------------------------------------------------------------
const RealWebSocket = require("ws");
const turnContext = new AsyncLocalStorage();

class TapSocket extends RealWebSocket {
  constructor(...args) {
    super(...args);
    this.tap = turnContext.getStore() || null;
    if (this.tap) {
      this.tap.socket = this;
      this.tap.openedAt = Date.now();
    }
  }

  send(payload, ...rest) {
    const tap = this.tap;
    if (tap && typeof payload === "string" && payload.includes("activityEnd")) {
      tap.activityEndAt = Date.now();
    }
    return super.send(payload, ...rest);
  }

  emit(name, ...args) {
    const tap = this.tap;
    if (tap) {
      if (name === "message") recordMessage(tap, args[0]);
      if (name === "close") {
        tap.wireClosedAt = Date.now();
        tap.wireCloseCode = args[0];
        tap.wireCloseReason = String(args[1] || "");
        clearTimeout(tap.lingerTimer);
        if (tap.onWireDone) tap.onWireDone();
      }
    }
    return super.emit(name, ...args);
  }

  // The app believes the socket is closed; the wire stays open until Gemini
  // ends the turn (or the linger limit), so nothing sent late goes unseen.
  close(...args) {
    const tap = this.tap;
    if (!tap) return super.close(...args);
    if (tap.appClosedAt) return undefined;
    tap.appClosedAt = Date.now();
    tap.audioBytesAtAppClose = tap.audioBytes;
    tap.textAtAppClose = tap.outText;
    const reallyClose = () => {
      clearTimeout(tap.lingerTimer);
      try {
        super.close();
      } catch {
        // ignore
      }
    };
    tap.reallyClose = reallyClose;
    if (tap.turnCompleteAt) setTimeout(reallyClose, 400);
    else tap.lingerTimer = setTimeout(reallyClose, lingerMs);
    return undefined;
  }
}

function recordMessage(tap, raw) {
  let event;
  try {
    // The browser client asks for ArrayBuffers; the server engine gets Buffers.
    const text = raw instanceof ArrayBuffer ? Buffer.from(raw).toString() : raw.toString();
    event = JSON.parse(text);
  } catch {
    return;
  }
  const now = Date.now();
  const content = event.serverContent || {};
  const entry = { t: now };
  let bytes = 0;
  const parts = Array.isArray(content.modelTurn?.parts) ? content.modelTurn.parts : [];
  for (const part of parts) {
    const data = part?.inlineData?.data;
    if (typeof data === "string" && data) {
      const buffer = Buffer.from(data, "base64");
      bytes += buffer.length;
      tap.audioChunks.push(buffer);
    } else if (part && typeof part.text === "string") {
      entry.partText = part.text;
    } else if (part && typeof part === "object") {
      entry.partKeys = Object.keys(part);
    }
  }
  if (bytes) {
    entry.audio = bytes;
    tap.audioBytes += bytes;
    tap.firstAudioAt = tap.firstAudioAt || now;
    tap.lastAudioAt = now;
    if (tap.generationCompleteAt) tap.audioBytesAfterGenerationComplete += bytes;
    if (tap.turnCompleteAt) tap.audioBytesAfterTurnComplete += bytes;
  }
  if (typeof content.outputTranscription?.text === "string") {
    entry.out = content.outputTranscription.text;
    tap.outText += content.outputTranscription.text;
    tap.lastTextAt = now;
  }
  if (typeof content.inputTranscription?.text === "string") {
    entry.in = content.inputTranscription.text;
    tap.inText += content.inputTranscription.text;
  }
  if (content.generationComplete) {
    entry.generationComplete = true;
    tap.generationCompleteCount += 1;
    tap.generationCompleteAt = tap.generationCompleteAt || now;
  }
  if (content.interrupted) {
    entry.interrupted = true;
    tap.interruptedCount += 1;
    tap.interruptedAt = tap.interruptedAt || now;
  }
  if (content.turnComplete) {
    entry.turnComplete = true;
    tap.turnCompleteCount += 1;
    tap.turnCompleteAt = tap.turnCompleteAt || now;
    if (tap.appClosedAt && tap.reallyClose) setTimeout(tap.reallyClose, 400);
  }
  const otherKeys = [
    ...Object.keys(event).filter((key) => key !== "serverContent" && key !== "usageMetadata"),
    ...Object.keys(content).filter(
      (key) =>
        ![
          "modelTurn",
          "outputTranscription",
          "inputTranscription",
          "generationComplete",
          "turnComplete",
          "interrupted"
        ].includes(key)
    )
  ];
  if (otherKeys.length) entry.other = otherKeys;
  if (event.usageMetadata && Object.keys(event).length === 1) entry.other = ["usageMetadata"];
  if (event.error) entry.error = String(event.error.message || "").slice(0, 200);
  if (event.usageMetadata) tap.usageMetadata = event.usageMetadata;
  tap.events.push(entry);
}

function newTap() {
  return {
    events: [],
    audioChunks: [],
    audioBytes: 0,
    audioBytesAtAppClose: null,
    audioBytesAfterGenerationComplete: 0,
    audioBytesAfterTurnComplete: 0,
    outText: "",
    inText: "",
    generationCompleteCount: 0,
    turnCompleteCount: 0,
    interruptedCount: 0
  };
}

// server.js must pick up the tapped socket class.
require.cache[require.resolve("ws")].exports = TapSocket;
const app = require("../server.js");
const { translateAudioTurnGemini, requestGeminiLiveEphemeralToken, getGeminiEngineSettings } =
  app.__test.gemini;
const { createSession, cleanTranscript } = require("../public/voice-translator/gemini-direct.js");
const { execFileSync } = require("child_process");

function readPcm(wavPath) {
  return execFileSync(
    "ffmpeg",
    ["-loglevel", "error", "-i", wavPath, "-ar", "24000", "-ac", "1", "-f", "s16le", "pipe:1"],
    { maxBuffer: 64 * 1024 * 1024 }
  );
}

// --- The two paths, driven the way eval/lib/systems.js drives them -------------
async function runServerPath(pcm, appAudio) {
  const result = await translateAudioTurnGemini({
    geminiApiKey: process.env.GEMINI_API_KEY,
    audioBase64: pcm.toString("base64"),
    languageA: "Chinese",
    languageB: "Thai",
    onAudioDelta: (data) => appAudio.push(Buffer.from(data, "base64"))
  });
  return {
    translatedText: result.translatedText,
    sourceText: result.sourceText,
    translatedTextIncomplete: result.translatedTextIncomplete,
    returnedAudioBytes: result.translatedPcmAudioBuffer.length
  };
}

function runDirectPath(pcm, appAudio) {
  const chunks = [];
  for (let i = 0; i < pcm.length; i += 4800) chunks.push(pcm.subarray(i, i + 4800));
  const settings = getGeminiEngineSettings();
  const session = createSession({
    WebSocketImpl: TapSocket,
    requestLease: async () => {
      const { token } = await requestGeminiLiveEphemeralToken({
        languageA: "Chinese",
        languageB: "Thai"
      });
      return {
        leaseId: "probe",
        token,
        wsUrl: settings.directUrl,
        model: `models/${settings.model}`,
        inputRate: 24000
      };
    },
    handlers: { onAudioDelta: (data) => appAudio.push(Buffer.from(data, "base64")) }
  });
  return session.prepare().then(
    () =>
      new Promise((resolve, reject) => {
        const startedAt = Date.now();
        let sent = 0;
        session.begin();
        const pacer = setInterval(() => {
          const due = Math.min(chunks.length, Math.floor((Date.now() - startedAt) / 100) + 1);
          while (sent < due) {
            session.pushAudio(chunks[sent].toString("base64"), 100);
            sent += 1;
          }
          if (sent < chunks.length) return;
          clearInterval(pacer);
          session.end().then(
            (result) =>
              resolve({
                translatedText: result.translatedText,
                sourceText: result.sourceText,
                translatedTextIncomplete: result.translatedTextIncomplete,
                returnedAudioBytes: Math.round(result.outputSeconds * 48000)
              }),
            reject
          );
        }, 20);
      })
  );
}

// --- Reading a turn -------------------------------------------------------------
const seconds = (bytes) => +(bytes / 48000).toFixed(2);
const letters = (text) => [...String(text || "").replace(/[\s\p{P}]/gu, "")].length;

// Longest stretch of the text that occurs in it twice (without overlap).
function longestRepeat(text) {
  const chars = [...String(text || "")];
  let best = "";
  for (let i = 0; i < chars.length; i += 1) {
    for (let j = i + best.length + 1; j < chars.length; j += 1) {
      let k = 0;
      while (j + k < chars.length && i + k < j && chars[i + k] === chars[j + k]) k += 1;
      if (k > best.length) best = chars.slice(i, i + k).join("");
    }
  }
  return best;
}

function summarize(turn, tap, appAudio, appResult, error) {
  const base = tap.activityEndAt || tap.openedAt || turn.startedAt;
  const rel = (at) => (at ? at - base : null);
  const appBytes = appAudio.reduce((sum, buffer) => sum + buffer.length, 0);
  const wireText = cleanTranscript(tap.outText);
  const repeat = longestRepeat(wireText);
  return {
    path: turn.path,
    clip: turn.clip,
    run: turn.run,
    error: error ? String(error.message || error).slice(0, 200) : null,
    heard: appResult?.sourceText ?? tap.inText.trim(),
    appText: appResult?.translatedText ?? null,
    wireText,
    appTextIncomplete: appResult?.translatedTextIncomplete ?? null,
    appAudioSeconds: seconds(appBytes),
    wireAudioSeconds: seconds(tap.audioBytes),
    // What our own code failed to hand on although Gemini sent it.
    droppedSeconds: seconds(tap.audioBytes - appBytes),
    audioAfterGenerationCompleteSeconds: seconds(tap.audioBytesAfterGenerationComplete),
    audioAfterTurnCompleteSeconds: seconds(tap.audioBytesAfterTurnComplete),
    lettersPerSecond: tap.audioBytes ? +(letters(wireText) / (tap.audioBytes / 48000)).toFixed(1) : null,
    repeatedStretch: letters(repeat) >= 8 ? repeat : "",
    counts: {
      generationComplete: tap.generationCompleteCount,
      turnComplete: tap.turnCompleteCount,
      interrupted: tap.interruptedCount,
      audioMessages: tap.events.filter((entry) => entry.audio).length
    },
    // Milliseconds after the end-of-speech signal was sent.
    ms: {
      firstAudio: rel(tap.firstAudioAt),
      lastAudio: rel(tap.lastAudioAt),
      lastText: rel(tap.lastTextAt),
      generationComplete: rel(tap.generationCompleteAt),
      interrupted: rel(tap.interruptedAt),
      turnComplete: rel(tap.turnCompleteAt),
      appClosed: rel(tap.appClosedAt),
      wireClosed: rel(tap.wireClosedAt)
    },
    wireClose: tap.wireClosedAt ? `${tap.wireCloseCode} ${tap.wireCloseReason}`.trim() : "",
    usageMetadata: tap.usageMetadata || null,
    events: tap.events.map((entry) => ({ ...entry, t: entry.t - base }))
  };
}

async function runTurn(turn) {
  const tap = newTap();
  const appAudio = [];
  let appResult = null;
  let error = null;
  turn.startedAt = Date.now();
  const wireDone = new Promise((resolve) => {
    tap.onWireDone = resolve;
  });
  try {
    appResult = await turnContext.run(tap, () =>
      turn.path === "server" ? runServerPath(turn.pcm, appAudio) : runDirectPath(turn.pcm, appAudio)
    );
  } catch (caught) {
    error = caught;
  }
  // Let Gemini finish the turn on the wire, so late audio is counted.
  if (tap.socket && !tap.wireClosedAt) {
    if (!tap.appClosedAt) tap.socket.close();
    await Promise.race([wireDone, new Promise((resolve) => setTimeout(resolve, lingerMs + 2000))]);
  }
  const summary = summarize(turn, tap, appAudio, appResult, error);
  const name = `${turn.path}-${turn.clip.replace(/\//g, "_")}-${String(turn.run).padStart(2, "0")}`;
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(summary, null, 1));
  fs.writeFileSync(path.join(outDir, `${name}.wire.pcm`), Buffer.concat(tap.audioChunks));
  if (summary.droppedSeconds > 0) {
    fs.writeFileSync(path.join(outDir, `${name}.app.pcm`), Buffer.concat(appAudio));
  }
  const m = summary.ms;
  console.log(
    [
      name.padEnd(28),
      error ? `ERROR ${summary.error}` : "ok",
      `app ${summary.appAudioSeconds}s`,
      `wire ${summary.wireAudioSeconds}s`,
      summary.droppedSeconds > 0 ? `DROPPED ${summary.droppedSeconds}s` : "",
      `${summary.lettersPerSecond} l/s`,
      `gc@${m.generationComplete} lastAudio@${m.lastAudio} tc@${m.turnComplete} close@${m.appClosed}`,
      summary.counts.interrupted ? `INTERRUPTED x${summary.counts.interrupted}` : "",
      summary.counts.generationComplete > 1 ? `GC x${summary.counts.generationComplete}` : "",
      summary.repeatedStretch ? `REPEAT "${summary.repeatedStretch}"` : ""
    ]
      .filter(Boolean)
      .join("  ")
  );
  return summary;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const queue = [];
  const pcmByClip = {};
  for (const { clip, times } of clipSpecs) {
    pcmByClip[clip] = readPcm(path.join(dataDir, `${clip}.wav`));
    for (const pathName of paths) {
      const existing = fs
        .readdirSync(outDir)
        .filter((file) => file.startsWith(`${pathName}-${clip.replace(/\//g, "_")}-`) && file.endsWith(".json"))
        .length;
      for (let run = existing + 1; run <= existing + times; run += 1) {
        queue.push({ path: pathName, clip, run, pcm: pcmByClip[clip] });
      }
    }
  }
  // Interleave the paths and clips, so both see the same minutes of the service.
  queue.sort((a, b) => a.run - b.run || a.clip.localeCompare(b.clip) || a.path.localeCompare(b.path));
  console.log(`${queue.length} turns, about $${(queue.length * 0.004).toFixed(2)}`);
  const results = [];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) results.push(await runTurn(queue.shift()));
  });
  await Promise.all(workers);
  const failed = results.filter((row) => row.error).length;
  const dropped = results.filter((row) => row.droppedSeconds > 0).length;
  console.log(`done: ${results.length} turns, ${failed} failed, ${dropped} with audio our code dropped`);
  process.exit(0);
})();
