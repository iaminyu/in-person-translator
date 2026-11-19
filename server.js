// A small server for the face-to-face voice translator.
//
// It does three things the browser must not do itself, because they need an
// API key: hand out short-lived tokens for the browser's own Gemini Live
// connection, translate a whole recording when that connection fails, and
// (with an OpenAI key) write down or read aloud what Gemini left out.
//
// There are no accounts and nothing is counted. Anyone who can reach this
// server spends your API quota: set ACCESS_CODE before putting it online.

const path = require("path");
const crypto = require("crypto");
const express = require("express");
require("dotenv").config();

const core = require("./lib/translation-core");
const {
  INPUT_AUDIO_SAMPLE_RATE,
  INPUT_AUDIO_CHANNELS,
  getAudioDurationSecondsFromPcmBytes,
  getGeminiLiveSettings,
  pcm16ToWavBuffer,
  requestGeminiLiveEphemeralToken,
  toTrimmedText,
  transcribeWavBuffer,
  translateAudioTurn,
  translateAudioTurnGemini,
  READ_ALOUD_KEY_SECONDS,
  READ_ALOUD_MODEL,
  READ_ALOUD_TIMEOUT_MS,
  MAX_READ_ALOUD_TEXT_LENGTH,
  buildReadAloudSession,
  readAloudRealtime,
  readAloudUrls
} = core;

const PORT = Number(process.env.PORT) || 3901;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");

const MAX_INPUT_AUDIO_SECONDS = 60;
const MAX_SPOKEN_TEXT_LENGTH = 4000;
const SPOKEN_TEXT_MODEL = process.env.SPOKEN_TEXT_MODEL || "gpt-transcribe";
const SPOKEN_TEXT_TIMEOUT_MS = 10000;
const OPENAI_VOICE = process.env.OPENAI_REALTIME_VOICE || "marin";
// Language names end up inside the model's instructions, so only plain names
// are accepted (letters, spaces and a little punctuation).
const LANGUAGE_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} ()'’.-]{1,39}$/u;

const geminiKey = () => getGeminiLiveSettings().apiKey;
const openaiKey = () => toTrimmedText(process.env.OPENAI_API_KEY);
const accessCode = () => toTrimmedText(process.env.ACCESS_CODE);

function requestId(endpoint) {
  return `ul_${endpoint}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

function writeNdjson(res, payload) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`${JSON.stringify(payload)}\n`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// --- Keeping strangers out ---------------------------------------------------
// With ACCESS_CODE set, the page and its API only answer a browser that has
// entered the code once (kept in a cookie for 30 days).
const ACCESS_COOKIE = "vt_access";

function accessToken(code) {
  return crypto.createHash("sha256").update(`vt-access:${code}`).digest("hex");
}

function sameText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hasAccess(req) {
  const code = accessCode();
  if (!code) return true;
  const cookies = String(req.headers.cookie || "").split(";");
  const mine = cookies
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ACCESS_COOKIE}=`));
  return Boolean(mine) && sameText(mine.slice(ACCESS_COOKIE.length + 1), accessToken(code));
}

const ACCESS_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Access code</title></head>
<body style="font-family:system-ui,sans-serif;max-width:22rem;margin:20vh auto;padding:0 1rem">
<form method="post" action="/access">
<label for="code">Access code</label><br>
<input id="code" name="code" type="password" autofocus required
  style="font-size:1.1rem;padding:.5rem;width:100%;box-sizing:border-box;margin:.5rem 0">
<button style="font-size:1.1rem;padding:.5rem 1rem">Continue</button>
</form></body></html>`;

// --- A brake on runaway use ---------------------------------------------------
// Per address and endpoint, in memory: enough to stop a loop or a script,
// not a defence against a determined abuser.
const recentRequests = new Map();
let lastPruneAt = 0;

function takeSlot(key, perMinute, now = Date.now()) {
  const recent = (recentRequests.get(key) || []).filter((time) => now - time < 60000);
  if (recent.length >= perMinute) {
    recentRequests.set(key, recent);
    return false;
  }
  recent.push(now);
  recentRequests.set(key, recent);
  if (recentRequests.size > 5000 && now - lastPruneAt > 60000) {
    lastPruneAt = now;
    for (const [name, times] of recentRequests) {
      if (!times.some((time) => now - time < 60000)) recentRequests.delete(name);
    }
  }
  return true;
}

function limit(name, perMinute) {
  return (req, res, next) => {
    if (takeSlot(`${name}:${req.ip || "unknown"}`, perMinute)) {
      next();
      return;
    }
    res.status(429).json({ error: "Too many requests. Please try again in a minute." });
  };
}

// --- The app ------------------------------------------------------------------
const app = express();
app.disable("x-powered-by");
// Behind a tunnel or reverse proxy every visitor arrives from the proxy's
// address, and the brakes above would count them all as one. TRUST_PROXY says
// how many proxies stand in front (usually 1), so the visitor's own address
// is used instead. Leave it unset when the server is reached directly:
// otherwise anyone could claim any address.
const trustProxy = toTrimmedText(process.env.TRUST_PROXY);
if (trustProxy) {
  if (!/^\d+$/.test(trustProxy)) {
    throw new Error("TRUST_PROXY must be the number of proxies in front of this server, for example 1.");
  }
  app.set("trust proxy", Number(trustProxy));
}

app.post("/access", express.urlencoded({ extended: false, limit: "1kb" }), limit("access", 10), (req, res) => {
  const code = accessCode();
  if (code && sameText(toTrimmedText(req.body?.code), code)) {
    const secure = req.secure || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
    res.setHeader(
      "Set-Cookie",
      `${ACCESS_COOKIE}=${accessToken(code)}; Path=/; Max-Age=${30 * 24 * 3600}; HttpOnly; SameSite=Lax${secure}`
    );
  }
  res.redirect(303, "/");
});

app.use((req, res, next) => {
  if (hasAccess(req)) {
    next();
    return;
  }
  if (req.path.startsWith("/api/")) {
    res.status(401).json({ error: "This translator needs its access code. Reload the page." });
    return;
  }
  res.status(401).type("html").send(ACCESS_PAGE);
});

// A minute of 24 kHz PCM16 is about 3.9 MB as base64.
app.use(express.json({ limit: "8mb" }));
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(geminiKey()),
    openaiConfigured: Boolean(openaiKey()),
    accessCodeRequired: Boolean(accessCode())
  });
});

// A single-use token with which the browser opens its own Gemini Live
// session. The model and the translation instructions are fixed inside the
// token here; the API key never leaves this server.
app.post("/api/gemini-live/lease", limit("lease", 60), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!geminiKey()) {
    res.status(503).json({ error: "GEMINI_API_KEY is not set.", code: "GEMINI_DIRECT_UNAVAILABLE" });
    return;
  }
  const languageA = toTrimmedText(req.body?.languageA);
  const languageB = toTrimmedText(req.body?.languageB);
  if (toTrimmedText(req.body?.mode).toLowerCase() === "handsfree") {
    // Hands-free is switched off (docs/decisions/0004); the page falls back
    // to Push to Talk on this code.
    res.status(404).json({
      error: "Auto Detect is turned off. Use Push to Talk.",
      code: "GEMINI_DIRECT_UNAVAILABLE"
    });
    return;
  }
  if (!LANGUAGE_NAME_PATTERN.test(languageA) || !LANGUAGE_NAME_PATTERN.test(languageB)) {
    res.status(400).json({ error: "Invalid payload. Expect languageA and languageB as language names." });
    return;
  }
  if (languageA === languageB) {
    res.status(400).json({ error: "languageA and languageB must be different." });
    return;
  }
  try {
    const settings = getGeminiLiveSettings();
    const { token, expiresAt } = await requestGeminiLiveEphemeralToken({
      languageA,
      languageB,
      handsFree: false
    });
    res.json({
      leaseId: requestId("gemini-live-lease"),
      token,
      expiresAt,
      wsUrl: settings.directUrl,
      model: `models/${settings.model}`,
      mode: "push-to-talk",
      languageA,
      languageB,
      inputRate: INPUT_AUDIO_SAMPLE_RATE,
      outputRate: INPUT_AUDIO_SAMPLE_RATE
    });
  } catch (error) {
    res.status(502).json({ error: `Failed to create Gemini session token: ${errorMessage(error)}` });
  }
});

// The page reports how much audio a direct turn used and how long the
// listener waited. A hosted service counts these; here they are accepted and
// dropped.
app.post("/api/gemini-live/settle", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true });
});

app.post("/api/turn-report", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, saved: false });
});

// The whole recording, uploaded: what the page falls back to when its own
// connection did not answer. Gemini first; OpenAI's realtime model if Gemini
// fails before any translated sound and an OpenAI key is set. Answers as
// lines of JSON while the translation is made.
app.post("/api/translate-turn-stream", limit("turn", 30), async (req, res) => {
  const { audioBase64, languageA, languageB, lowLatencyAudio } = req.body || {};
  const textWanted = lowLatencyAudio === false || lowLatencyAudio === "false";
  const turnId = requestId("translate-turn-stream");
  if (
    typeof audioBase64 !== "string" || !audioBase64 ||
    typeof languageA !== "string" || !languageA ||
    typeof languageB !== "string" || !languageB
  ) {
    res.status(400).json({ error: "Invalid payload. Expect audioBase64, languageA, languageB." });
    return;
  }
  if (!LANGUAGE_NAME_PATTERN.test(languageA) || !LANGUAGE_NAME_PATTERN.test(languageB)) {
    res.status(400).json({ error: "Invalid payload. Expect languageA and languageB as language names." });
    return;
  }
  if (languageA === languageB) {
    res.status(400).json({ error: "languageA and languageB must be different." });
    return;
  }
  const inputPcm = Buffer.from(audioBase64, "base64");
  if (!inputPcm.length) {
    res.status(400).json({ error: "Invalid audioBase64." });
    return;
  }
  if (getAudioDurationSecondsFromPcmBytes(inputPcm.length) > MAX_INPUT_AUDIO_SECONDS) {
    res.status(400).json({ error: `Audio exceeds ${MAX_INPUT_AUDIO_SECONDS}-second limit.` });
    return;
  }
  if (!geminiKey() && !openaiKey()) {
    res.status(503).json({ error: "No API key is set. Set GEMINI_API_KEY." });
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  // First, so the page knows this request's id even if the answer never
  // reaches it.
  writeNdjson(res, { type: "accepted", requestId: turnId });

  let audioSent = false;
  let sourceText = "";
  let translatedText = "";
  const emitAudio = (audio) => {
    audioSent = true;
    writeNdjson(res, { type: "translated_audio_delta", audio, format: "pcm16", sampleRate: 24000 });
  };
  const emitTextDelta = (delta) => {
    if (!textWanted) return;
    translatedText += delta;
    writeNdjson(res, { type: "translated_text_delta", delta });
  };

  try {
    let result = null;
    let engine = "";
    let geminiFailure = "";
    // The page asks for "openai" once Gemini has stayed silent twice on this
    // recording; without an OpenAI key Gemini is still asked.
    const openaiAsked = openaiKey() && toTrimmedText(req.body?.engine).toLowerCase() === "openai";
    if (geminiKey() && !openaiAsked) {
      try {
        result = await translateAudioTurnGemini({
          geminiApiKey: geminiKey(),
          audioBase64,
          languageA,
          languageB,
          onAudioDelta: emitAudio,
          onSourceText: (text) => {
            if (!textWanted) return;
            sourceText = text;
            writeNdjson(res, { type: "source_text", text });
          },
          onTranslatedTextDelta: emitTextDelta
        });
        engine = "gemini";
        if (textWanted) {
          translatedText = result.translatedText || translatedText;
          writeNdjson(res, { type: "translated_text_done", text: translatedText });
        }
      } catch (error) {
        // Once translated audio has started playing the engine cannot be
        // switched without the listener hearing two translations.
        if (audioSent) throw error;
        geminiFailure = toTrimmedText(errorMessage(error)).slice(0, 180);
        console.warn(`Gemini Live turn failed: ${geminiFailure}`);
        if (textWanted && (sourceText || translatedText)) {
          sourceText = "";
          translatedText = "";
          writeNdjson(res, { type: "source_text", text: "" });
          writeNdjson(res, { type: "translated_text_done", text: "" });
        }
      }
    }
    if (!result) {
      if (!openaiKey()) {
        throw new Error(
          geminiFailure
            ? `Gemini Live turn failed and no OpenAI API key is set to fall back on: ${geminiFailure}`
            : "No OpenAI API key is set. Set OPENAI_API_KEY to use the OpenAI engine."
        );
      }
      result = await translateAudioTurn({
        openaiApiKey: openaiKey(),
        audioBase64,
        languageA,
        languageB,
        voice: OPENAI_VOICE,
        includeText: textWanted,
        onAudioDelta: emitAudio,
        onTranslatedTextDelta: emitTextDelta,
        onTranslatedTextDone: (text) => {
          if (!textWanted) return;
          translatedText = text;
          writeNdjson(res, { type: "translated_text_done", text });
        }
      });
      engine = "openai";
    }

    const done = { type: "done", engine, requestId: turnId };
    const finalText = textWanted ? result.translatedText || translatedText || "" : "";
    if (textWanted && sourceText) done.sourceText = sourceText;
    if (finalText) done.translatedText = finalText;
    if (textWanted && result.translatedTextIncomplete) done.translatedTextIncomplete = true;
    // The page translates the recording once more when it sees this.
    if (result.translatedAudioCutShort) done.translatedAudioCutShort = true;
    writeNdjson(res, done);
  } catch (error) {
    writeNdjson(res, { type: "error", requestId: turnId, message: errorMessage(error) });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

// The page heard a translation in full but got no text for it, or the
// speaker's own words never arrived: it sends the audio and gets back what
// was said. Needs an OpenAI key; without one the page shows the card
// without that text.
app.post("/api/gemini-live/spoken-text", limit("spoken-text", 10), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!openaiKey()) {
    res.status(503).json({ error: "Writing down speech needs OPENAI_API_KEY." });
    return;
  }
  const pcm = Buffer.from(typeof req.body?.audioBase64 === "string" ? req.body.audioBase64 : "", "base64");
  const seconds = getAudioDurationSecondsFromPcmBytes(pcm.length);
  // Whole 16-bit samples, between a fifth of a second and a minute.
  if (pcm.length % 2 !== 0 || seconds < 0.2 || seconds > MAX_INPUT_AUDIO_SECONDS) {
    res.status(400).json({
      error: `Invalid payload. Expect audioBase64 (24 kHz mono PCM16, up to ${MAX_INPUT_AUDIO_SECONDS} seconds).`
    });
    return;
  }
  try {
    const text = await transcribeWavBuffer({
      openaiApiKey: openaiKey(),
      wavBuffer: pcm16ToWavBuffer(pcm, INPUT_AUDIO_SAMPLE_RATE, INPUT_AUDIO_CHANNELS),
      model: SPOKEN_TEXT_MODEL,
      signal: AbortSignal.timeout(SPOKEN_TEXT_TIMEOUT_MS),
      languages: (Array.isArray(req.body?.languages) ? req.body.languages : [])
        .slice(0, 2)
        .map((name) => toTrimmedText(name).slice(0, 40))
    });
    res.json({ text: text.replace(/\s+/g, " ").trim().slice(0, MAX_SPOKEN_TEXT_LENGTH) });
  } catch (error) {
    res.status(502).json({ error: `Failed to write down the translation: ${errorMessage(error)}` });
  }
});

// Now and then Gemini translates a sentence without speaking it. The page
// then has the text read aloud by an OpenAI realtime model told to read word
// for word (lib/translation-core/read-aloud.js). This hands the page a
// short-lived key for a reading connection of its own.
app.post("/api/read-aloud/lease", limit("read-aloud-lease", 10), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!openaiKey()) {
    res.status(503).json({ error: "Reading aloud needs OPENAI_API_KEY." });
    return;
  }
  try {
    const response = await fetch(readAloudUrls().clientSecrets, {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: READ_ALOUD_KEY_SECONDS },
        session: buildReadAloudSession()
      }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await response.json().catch(() => null);
    const value = typeof data?.value === "string" ? data.value : "";
    if (!response.ok || !value) throw new Error(`HTTP ${response.status}`);
    res.json({
      value,
      expiresAt: Number(data.expires_at) || 0,
      model: READ_ALOUD_MODEL,
      wsUrl: `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(READ_ALOUD_MODEL)}`
    });
  } catch (error) {
    res.status(502).json({ error: `Failed to get a reading-aloud key: ${errorMessage(error)}` });
  }
});

// The slower way to the same reading, when the page has no connection of
// its own ready: the answer is the speech as raw 24 kHz mono PCM16.
app.post("/api/read-aloud", limit("read-aloud", 10), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!openaiKey()) {
    res.status(503).json({ error: "Reading aloud needs OPENAI_API_KEY." });
    return;
  }
  const text = toTrimmedText(req.body?.text).replace(/\s+/g, " ");
  if (!text || text.length > MAX_READ_ALOUD_TEXT_LENGTH) {
    res.status(400).json({
      error: `Invalid payload. Expect text (up to ${MAX_READ_ALOUD_TEXT_LENGTH} characters).`
    });
    return;
  }
  const abort = new AbortController();
  const abortTimer = setTimeout(() => abort.abort(), READ_ALOUD_TIMEOUT_MS);
  res.on("close", () => abort.abort());
  let started = false;
  try {
    await readAloudRealtime({
      openaiApiKey: openaiKey(),
      text,
      signal: abort.signal,
      onAudio: (pcm) => {
        if (!started) {
          started = true;
          res.status(200);
          res.setHeader("Content-Type", "application/octet-stream");
          res.setHeader("X-Audio-Format", "pcm16; rate=24000; channels=1");
          res.flushHeaders?.();
        }
        res.write(pcm);
      }
    });
    if (!started) throw new Error("No audio came back.");
    res.end();
  } catch (error) {
    if (started) {
      // Broken off, not finished: the page must not take it for the whole.
      res.destroy(error instanceof Error ? error : new Error(errorMessage(error)));
    } else if (!res.headersSent && !res.writableEnded && !res.destroyed) {
      res.status(502).json({ error: `Failed to read the translation aloud: ${errorMessage(error)}` });
    }
  } finally {
    clearTimeout(abortTimer);
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found." });
});

// What the evaluation tools (eval/lib/systems.js) and the tests reach for.
app.__test = {
  buildTranscriptionLanguageFields: core.buildTranscriptionLanguageFields,
  realtime: {
    buildRealtimeHeaders: core.buildRealtimeHeaders,
    buildRealtimeResponseConfig: core.buildRealtimeResponseConfig,
    buildRealtimeSessionConfig: core.buildRealtimeSessionConfig,
    getRealtimeConfigVariants: core.getRealtimeConfigVariants,
    isRealtime2Model: core.isRealtime2Model,
    resolveRealtimeReasoningEffort: core.resolveRealtimeReasoningEffort,
    transcribeWavBuffer,
    translateAudioTurn
  },
  gemini: {
    buildGeminiLiveSetup: core.buildGeminiLiveSetup,
    cleanGeminiTranscript: core.cleanGeminiTranscript,
    geminiAudioTooShortForText: core.geminiAudioTooShortForText,
    geminiTranscriptLooksUnfinished: core.geminiTranscriptLooksUnfinished,
    getGeminiEngineSettings: getGeminiLiveSettings,
    requestGeminiLiveEphemeralToken,
    translateAudioTurnGemini
  },
  readAloud: { buildReadAloudSession, readAloudRealtime },
  takeSlot
};

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Voice translator running: http://${HOST}:${PORT}`);
    if (!geminiKey()) console.warn("GEMINI_API_KEY is not set: nothing can be translated yet.");
    if (!openaiKey()) console.warn("OPENAI_API_KEY is not set: no second engine, no reading aloud, no written-down speech.");
    if (!accessCode()) {
      console.warn(
        "ACCESS_CODE is not set. Fine on your own machine; set it before this server can be reached " +
          "from outside (a tunnel counts), or anyone who finds it spends your API quota."
      );
    }
  });
}

module.exports = app;
