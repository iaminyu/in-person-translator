// Gemini Live: one spoken turn in, the translation out as speech and text.
//
// Two ways in. translateAudioTurnGemini sends a finished recording from the
// server. requestGeminiLiveEphemeralToken hands the browser a single-use
// token so it can talk to Gemini itself while the person is still speaking
// (public/voice-translator/gemini-direct.js).
//
// Reads GEMINI_API_KEY and GEMINI_LIVE_MODEL from the environment;
// GEMINI_LIVE_URL, GEMINI_LIVE_DIRECT_URL and GEMINI_AUTH_TOKENS_URL can point
// it at another server (the tests do).

const WebSocket = require("ws");
const {
  INPUT_AUDIO_BYTES_PER_SECOND,
  INPUT_AUDIO_SAMPLE_RATE,
  getAudioDurationSecondsFromPcmBytes,
  readErrorMessage,
  toTrimmedText
} = require("./shared");
const { buildStrictTranslationInstructions } = require("./instructions");
const { GEMINI_LANGUAGE_CODES } = require("./languages");

const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live";
const GEMINI_LIVE_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
// Direct mode: the browser talks to Gemini Live itself, using a short-lived
// single-use token whose session setup (model, instructions) is fixed here.
const GEMINI_AUTH_TOKENS_URL =
  "https://generativelanguage.googleapis.com/v1beta/auth_tokens";
const GEMINI_LIVE_DIRECT_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
// Long enough for a prepared session to wait for the next turn and finish it.
const GEMINI_DIRECT_TOKEN_TTL_SECONDS = 10 * 60;
const GEMINI_DIRECT_NEW_SESSION_WINDOW_SECONDS = 60;
// Hands-free mode: Gemini decides when a speaker has finished. The default
// (about 800 ms of silence) answers too eagerly for people who pause while
// they think, so wait a little longer before treating a pause as the end.
// Tried and dropped (2026-11-15): turnCoverage TURN_INCLUDES_ALL_INPUT and a
// higher start sensitivity. Neither improved accuracy on the evaluation set,
// and the first made Gemini stay silent on some normal-volume recordings.
const GEMINI_HANDSFREE_ACTIVITY_DETECTION = {
  disabled: false,
  silenceDurationMs: 1200
};
// Counted from the request, so it covers connecting (about 1-2 s) and the
// model's answer (under 1.3 s nine times in ten in 440 evaluation turns,
// never over 2.9 s). If nothing has arrived by this point the turn is
// abandoned so the caller can fall back quickly instead of leaving two
// people waiting for the full request timeout.
const GEMINI_LIVE_FIRST_AUDIO_TIMEOUT_MS = 7000;

// Read on every call, so a change to the environment takes effect at once.
function getGeminiLiveSettings() {
  return {
    apiKey: toTrimmedText(process.env.GEMINI_API_KEY),
    model: GEMINI_LIVE_MODEL,
    liveUrl: toTrimmedText(process.env.GEMINI_LIVE_URL) || GEMINI_LIVE_URL,
    directUrl: toTrimmedText(process.env.GEMINI_LIVE_DIRECT_URL) || GEMINI_LIVE_DIRECT_URL,
    authTokensUrl:
      toTrimmedText(process.env.GEMINI_AUTH_TOKENS_URL) || GEMINI_AUTH_TOKENS_URL
  };
}

// Gemini's transcript of what was heard is told which two languages to
// expect. Left to guess, it took a Thai sentence with one English word in it
// ("Grab") for English and kept only that word (seen 2026-11-17).
function buildGeminiTranscriptionHint({ languageA, languageB }) {
  const codeOf = (name) =>
    Object.hasOwn(GEMINI_LANGUAGE_CODES, name) ? GEMINI_LANGUAGE_CODES[name] : "";
  const codes = [codeOf(languageA), codeOf(languageB)];
  if (codes.some((code) => !code) || codes[0] === codes[1]) return {};
  return { languageCodes: codes };
}

function buildGeminiLiveSetup({
  languageA,
  languageB,
  model,
  handsFree = false,
  transcriptionHint = true,
  outputTranscriptionHint = false
}) {
  return {
    model: `models/${model}`,
    generationConfig: { responseModalities: ["AUDIO"] },
    systemInstruction: {
      parts: [{ text: buildStrictTranslationInstructions(languageA, languageB) }]
    },
    // Push to talk: the app decides where a turn starts and ends.
    // Hands-free: Gemini detects the end of speech itself.
    realtimeInputConfig: {
      automaticActivityDetection: handsFree
        ? { ...GEMINI_HANDSFREE_ACTIVITY_DETECTION }
        : { disabled: true }
    },
    inputAudioTranscription: transcriptionHint
      ? buildGeminiTranscriptionHint({ languageA, languageB })
      : {},
    // Not hinted. Tried on 290 real recordings (2026-11-17): the text barely
    // improved, and twice the voice said the Thai sentence back untranslated
    // while the hinted text showed a Chinese translation, which hides the
    // very failure the page checks the text for. Off unless the eval asks.
    outputAudioTranscription: outputTranscriptionHint
      ? buildGeminiTranscriptionHint({ languageA, languageB })
      : {}
  };
}

// Now and then Gemini's transcript of its own speech carries markers that
// were never spoken: "<no speech>", "{pause}", "<partial>", "[th]", "🧠", "✨".
// They are removed before the text is shown. (The same rules live in
// public/voice-translator/gemini-direct.js; keep the two in step.)
const GEMINI_TRANSCRIPT_MARKER =
  "<[a-z][a-z _-]{0,30}>|\\{[a-z][a-z _-]{0,30}\\}|\\[[a-z]{2,3}\\]|\\u{1F9E0}|\\u2728";
const GEMINI_TRANSCRIPT_MARKERS = new RegExp(GEMINI_TRANSCRIPT_MARKER, "giu");
const GEMINI_TRAILING_MARKERS = new RegExp(
  `(?:\\s*(?:${GEMINI_TRANSCRIPT_MARKER}))+\\s*$`,
  "iu"
);
// A marker that has only half arrived, at the end of the text so far.
const GEMINI_UNCLOSED_MARKER = /[<{[](?:[a-z][a-z _-]{0,30})?$/i;
// A transcript that has not arrived at all, or visibly stops halfway, is given
// this long after the audio is complete: the rest may still arrive before
// Gemini closes the turn. Once it looks whole, a short quiet spell ends the wait.
const GEMINI_UNFINISHED_TEXT_MAX_MS = 3000;
const GEMINI_TRAILING_TEXT_GRACE_MS = 350;

function cleanGeminiTranscript(raw) {
  return String(raw || "")
    .replace(GEMINI_TRANSCRIPT_MARKERS, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

// Now and then Gemini stops speaking after a second or less although its text
// holds the whole sentence. Measured on 220 real turns (2026-11-16): Thai is
// spoken at 8-16 letters a second and Chinese at 3-6 characters a second,
// while the turns that stopped early came out at 28-140 and 25. Nobody speaks
// faster than the rates below, so audio shorter than they allow for its text
// was cut short. Scripts that were not measured get a wider margin: reading a
// sentence out twice by mistake is worse than missing one that stopped
// halfway. (The same rule lives in public/voice-translator/gemini-direct.js;
// keep the two in step.)
const GEMINI_FASTEST_SPEECH_PER_SECOND = { han: 9, kana: 14, hangul: 11, thai: 22, other: 30 };
const HAN_CHARACTER = /\p{Script=Han}/u;
const THAI_CHARACTER = /\p{Script=Thai}/u;
const KANA_CHARACTER = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HANGUL_CHARACTER = /\p{Script=Hangul}/u;
const NOT_SPOKEN_CHARACTER = /[\s\p{P}]/u;

// The least time it takes to say the text aloud.
function shortestSpeechSeconds(text) {
  let seconds = 0;
  // Composed first, so an accented letter counts once however it was sent.
  for (const character of String(text || "").normalize("NFC")) {
    if (NOT_SPOKEN_CHARACTER.test(character)) {
      continue;
    }
    if (HAN_CHARACTER.test(character)) {
      seconds += 1 / GEMINI_FASTEST_SPEECH_PER_SECOND.han;
    } else if (THAI_CHARACTER.test(character)) {
      seconds += 1 / GEMINI_FASTEST_SPEECH_PER_SECOND.thai;
    } else if (KANA_CHARACTER.test(character)) {
      seconds += 1 / GEMINI_FASTEST_SPEECH_PER_SECOND.kana;
    } else if (HANGUL_CHARACTER.test(character)) {
      seconds += 1 / GEMINI_FASTEST_SPEECH_PER_SECOND.hangul;
    } else {
      seconds += 1 / GEMINI_FASTEST_SPEECH_PER_SECOND.other;
    }
  }
  return seconds;
}

// True when the translated speech is too short to hold the whole text. Speech
// that never started is a different failure and is not counted here.
function geminiAudioTooShortForText(text, audioSeconds) {
  const seconds = Number(audioSeconds) || 0;
  return seconds > 0 && seconds < shortestSpeechSeconds(text);
}

// True while the transcript says of itself that more should follow: it ends in
// "<partial>", stops inside a marker, or holds nothing but markers.
function geminiTranscriptLooksUnfinished(raw) {
  const text = String(raw || "");
  if (!text.trim()) {
    return false;
  }
  if (GEMINI_UNCLOSED_MARKER.test(text)) {
    return true;
  }
  if (!cleanGeminiTranscript(text)) {
    return true;
  }
  const tail = text.match(GEMINI_TRAILING_MARKERS);
  return Boolean(tail && /<\s*partial/i.test(tail[0]));
}

// Asks Google for a single-use token the browser can open one Live session
// with. The session setup is stored with the token, so the browser cannot
// change the model or the instructions.
async function requestGeminiLiveEphemeralToken({ languageA, languageB, handsFree = false }) {
  const settings = getGeminiLiveSettings();
  const now = Date.now();
  const expiresAt = new Date(now + GEMINI_DIRECT_TOKEN_TTL_SECONDS * 1000).toISOString();
  const response = await fetch(settings.authTokensUrl, {
    method: "POST",
    headers: {
      "x-goog-api-key": settings.apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      uses: 1,
      expireTime: expiresAt,
      newSessionExpireTime: new Date(
        now + GEMINI_DIRECT_NEW_SESSION_WINDOW_SECONDS * 1000
      ).toISOString(),
      bidiGenerateContentSetup: buildGeminiLiveSetup({
        languageA,
        languageB,
        model: settings.model,
        handsFree
      })
    })
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const payload = await response.json().catch(() => null);
  const token = toTrimmedText(payload?.name);
  if (!token) {
    throw new Error("Gemini token response did not contain a token.");
  }
  return { token, expiresAt };
}

// One fresh Gemini Live session per turn, so no history carries over between
// turns. Resolves like translateAudioTurn, plus the model's own transcript of
// what it heard (sourceText).
function translateAudioTurnGemini({
  geminiApiKey,
  audioBase64,
  languageA,
  languageB,
  onAudioDelta,
  onSourceText,
  onTranslatedTextDelta,
  firstAudioTimeoutMs = GEMINI_LIVE_FIRST_AUDIO_TIMEOUT_MS,
  unfinishedTextMaxMs = GEMINI_UNFINISHED_TEXT_MAX_MS,
  // Only the eval changes these, to compare setups.
  transcriptionHint = true,
  outputTranscriptionHint = false
}) {
  const settings = getGeminiLiveSettings();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(settings.liveUrl, {
      headers: { "x-goog-api-key": geminiApiKey }
    });

    let completed = false;
    let sentAudio = false;
    let sourceText = "";
    let translatedText = "";
    // The cleaned part of translatedText already reported to the caller.
    let shownText = "";
    let usageMetadata = {};
    let audioCompleteAt = 0;
    let waitedForText = false;
    let unfinishedTextTimer = null;
    const audioChunks = [];

    const timeout = setTimeout(() => {
      fail(new Error("Gemini Live request timed out."));
    }, 45000);
    const firstAudioTimeout = setTimeout(() => {
      fail(new Error("Gemini Live sent no translated audio in time."));
    }, firstAudioTimeoutMs);

    function finish(callback) {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(timeout);
      clearTimeout(firstAudioTimeout);
      clearTimeout(unfinishedTextTimer);
      ws.removeAllListeners();
      // A late socket error after we are done must not crash the process.
      ws.on("error", () => {});
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
      callback();
    }

    function succeed() {
      finish(() => {
        const translatedPcmAudioBuffer = Buffer.concat(audioChunks);
        const cleanedText = cleanGeminiTranscript(translatedText);
        resolve({
          sourceText: sourceText.trim(),
          translatedText: cleanedText,
          // The text stops halfway although the audio is complete.
          translatedTextIncomplete: geminiTranscriptLooksUnfinished(translatedText),
          // The other way round: the text is whole, but Gemini stopped
          // speaking long before the end of it.
          translatedAudioCutShort: geminiAudioTooShortForText(
            cleanedText,
            getAudioDurationSecondsFromPcmBytes(translatedPcmAudioBuffer.length)
          ),
          translatedPcmAudioBuffer,
          usageMetadata,
          model: settings.model
        });
      });
    }

    function fail(error) {
      finish(() => reject(error));
    }

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          setup: buildGeminiLiveSetup({
            languageA,
            languageB,
            model: settings.model,
            transcriptionHint,
            outputTranscriptionHint
          })
        })
      );
    });

    ws.on("message", (raw) => {
      let event;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (event.error) {
        // All the audio already arrived: only trailing text was pending.
        if (audioCompleteAt) {
          succeed();
          return;
        }
        fail(
          new Error(
            `Gemini Live error: ${toTrimmedText(event.error.message) || "unknown error"}`
          )
        );
        return;
      }

      if (event.setupComplete && !sentAudio) {
        sentAudio = true;
        const pcm = Buffer.from(audioBase64, "base64");
        const bytesPerChunk = INPUT_AUDIO_BYTES_PER_SECOND / 10;
        ws.send(JSON.stringify({ realtimeInput: { activityStart: {} } }));
        for (let offset = 0; offset < pcm.length; offset += bytesPerChunk) {
          ws.send(
            JSON.stringify({
              realtimeInput: {
                audio: {
                  data: pcm.subarray(offset, offset + bytesPerChunk).toString("base64"),
                  mimeType: `audio/pcm;rate=${INPUT_AUDIO_SAMPLE_RATE}`
                }
              }
            })
          );
        }
        ws.send(JSON.stringify({ realtimeInput: { activityEnd: {} } }));
        return;
      }

      if (event.usageMetadata && typeof event.usageMetadata === "object") {
        usageMetadata = event.usageMetadata;
      }

      const content = event.serverContent;
      if (!content) {
        return;
      }

      if (typeof content.inputTranscription?.text === "string") {
        sourceText += content.inputTranscription.text;
        if (typeof onSourceText === "function") {
          onSourceText(sourceText.trim());
        }
      }

      if (typeof content.outputTranscription?.text === "string") {
        translatedText += content.outputTranscription.text;
        const cleaned = cleanGeminiTranscript(
          translatedText.replace(GEMINI_UNCLOSED_MARKER, "")
        );
        if (cleaned.length > shownText.length && cleaned.startsWith(shownText)) {
          const delta = cleaned.slice(shownText.length);
          shownText = cleaned;
          if (typeof onTranslatedTextDelta === "function") {
            onTranslatedTextDelta(delta);
          }
        }
      }

      const parts = Array.isArray(content.modelTurn?.parts) ? content.modelTurn.parts : [];
      for (const part of parts) {
        const data = part?.inlineData?.data;
        if (typeof data !== "string" || !data) {
          continue;
        }
        clearTimeout(firstAudioTimeout);
        if (typeof onAudioDelta === "function") {
          onAudioDelta(data);
        }
        audioChunks.push(Buffer.from(data, "base64"));
      }

      // generationComplete arrives once all audio and text have been sent.
      // turnComplete only follows after the audio's playback time has passed,
      // so waiting for it would hold the turn open for several more seconds.
      if (content.generationComplete || content.turnComplete) {
        if (!audioChunks.length) {
          fail(new Error("Gemini Live returned no translated audio."));
          return;
        }
        audioCompleteAt = audioCompleteAt || Date.now();
      }
      if (!audioCompleteAt) {
        return;
      }
      if (content.turnComplete) {
        succeed();
        return;
      }
      // The exception: a transcript that is missing or visibly stops halfway.
      // The audio has already been passed on, so waiting for the text (until
      // turnComplete, or a few seconds at most) delays nothing the listener
      // hears.
      clearTimeout(unfinishedTextTimer);
      const unfinished =
        !cleanGeminiTranscript(translatedText) ||
        geminiTranscriptLooksUnfinished(translatedText);
      if (!unfinished && !waitedForText) {
        succeed();
        return;
      }
      waitedForText = true;
      const remaining = unfinishedTextMaxMs - (Date.now() - audioCompleteAt);
      if (remaining <= 0) {
        succeed();
        return;
      }
      // Once the text looks whole, a short quiet spell is enough.
      unfinishedTextTimer = setTimeout(
        succeed,
        unfinished ? remaining : Math.min(remaining, GEMINI_TRAILING_TEXT_GRACE_MS)
      );
    });

    ws.on("error", (error) => {
      if (audioCompleteAt) {
        succeed();
      } else {
        fail(error);
      }
    });
    ws.on("close", (code, reason) => {
      // All the audio already arrived: only trailing text was pending.
      if (audioCompleteAt) {
        succeed();
        return;
      }
      fail(
        new Error(`Gemini Live socket closed early (${code}): ${reason.toString()}`)
      );
    });
  });
}

module.exports = {
  GEMINI_LIVE_MODEL,
  buildGeminiLiveSetup,
  buildGeminiTranscriptionHint,
  cleanGeminiTranscript,
  geminiAudioTooShortForText,
  geminiTranscriptLooksUnfinished,
  getGeminiLiveSettings,
  requestGeminiLiveEphemeralToken,
  translateAudioTurnGemini
};
