// OpenAI Realtime: the same turn through gpt-realtime, used when Gemini is
// not set up or a Gemini turn fails. Also OpenAI speech-to-text, which writes
// down what was said when a turn's own text is missing.
//
// Reads OPENAI_REALTIME_MODEL, OPENAI_REALTIME_REASONING_EFFORT and
// OPENAI_TRANSCRIBE_MODEL from the environment. The API key is passed in.

const WebSocket = require("ws");
const { INPUT_AUDIO_SAMPLE_RATE, readErrorMessage, toTrimmedText } = require("./shared");
const { buildStrictTranslationInstructions } = require("./instructions");
const { toOpenAiLanguageCode } = require("./languages");

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1";
const REALTIME_REASONING_EFFORT = resolveRealtimeReasoningEffort(
  process.env.OPENAI_REALTIME_REASONING_EFFORT
);
const REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
  REALTIME_MODEL
)}`;
const TRANSCRIBE_MODEL =
  process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-transcribe";
const TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

function extractTextFromResponse(response) {
  if (!response || !Array.isArray(response.output)) {
    return "";
  }
  const chunks = [];
  for (const item of response.output) {
    if (item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }
    for (const content of item.content) {
      if (
        (content.type === "output_text" || content.type === "text") &&
        typeof content.text === "string"
      ) {
        chunks.push(content.text);
      }
      if (
        (content.type === "audio_transcript" ||
          content.type === "output_audio_transcript") &&
        typeof content.transcript === "string"
      ) {
        chunks.push(content.transcript);
      }
    }
  }
  return chunks.join("").trim();
}

function mergeTextFragments(existingText, nextText) {
  const existing = toTrimmedText(existingText);
  const incoming = toTrimmedText(nextText);
  if (!incoming) {
    return existing;
  }
  if (!existing) {
    return incoming;
  }
  if (existing === incoming) {
    return existing;
  }
  if (incoming.startsWith(existing)) {
    return incoming;
  }
  if (existing.startsWith(incoming)) {
    return existing;
  }

  const maxOverlap = Math.min(existing.length, incoming.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (existing.slice(-overlap) === incoming.slice(0, overlap)) {
      return `${existing}${incoming.slice(overlap)}`.trim();
    }
  }

  const shouldInsertSpace =
    /[A-Za-z0-9)]$/.test(existing) && /^[A-Za-z0-9(]/.test(incoming);
  return `${existing}${shouldInsertSpace ? " " : ""}${incoming}`.trim();
}

// `language`: the one language the audio is in, when it is known (a
// translation). `languages`: the ones it may be in (the chosen pair). Told
// neither, the transcription guesses, and guesses wrong on short or mixed
// sentences.
function buildTranscriptionLanguageFields({ language = "", languages = [] } = {}) {
  const one = toOpenAiLanguageCode(language);
  if (one) return { language: one };
  const codes = [...new Set(languages.map(toOpenAiLanguageCode).filter(Boolean))];
  return codes.length ? { languages: codes } : {};
}

async function transcribeWavBuffer({
  openaiApiKey,
  wavBuffer,
  model = TRANSCRIBE_MODEL,
  signal,
  language = "",
  languages = []
}) {
  const languageFields = buildTranscriptionLanguageFields({ language, languages });
  const send = (withLanguages) => {
    const formData = new FormData();
    formData.append("model", model);
    if (withLanguages) {
      if (languageFields.language) formData.append("language", languageFields.language);
      for (const code of languageFields.languages || []) formData.append("languages[]", code);
    }
    formData.append("file", new Blob([wavBuffer], { type: "audio/wav" }), "turn.wav");
    return fetch(TRANSCRIBE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`
      },
      body: formData,
      signal
    });
  };

  const hinted = Object.keys(languageFields).length > 0;
  let response = await send(hinted);
  // A language code the model does not take is refused as a whole request.
  // Writing the words down without the hint beats not writing them at all.
  if (hinted && response.status === 400) {
    response = await send(false);
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const data = await response.json();
  return typeof data.text === "string" ? data.text.trim() : "";
}

function isSchemaFallbackError(message) {
  return (
    message.includes("Unknown parameter: 'session.modalities'") ||
    message.includes("Unknown parameter: 'response.modalities'") ||
    message.includes("Unknown parameter: 'session.output_modalities'") ||
    message.includes("Unknown parameter: 'response.output_modalities'") ||
    message.includes("Unknown parameter: 'session.type'") ||
    message.includes("Unknown parameter: 'session.audio'") ||
    message.includes("Unknown parameter: 'session.audio.input'") ||
    message.includes("Unknown parameter: 'session.audio.output'") ||
    message.includes("Unknown parameter: 'response.audio'") ||
    message.includes("Unknown parameter: 'response.audio.output'") ||
    message.includes("Unknown parameter: 'session.reasoning'") ||
    message.includes("Unknown parameter: 'response.reasoning'") ||
    message.includes("Invalid type for 'session.audio'") ||
    message.includes("Invalid type for 'response.audio'") ||
    message.includes("Missing required parameter: 'session.modalities'") ||
    message.includes("Missing required parameter: 'response.modalities'") ||
    message.includes("Missing required parameter: 'session.output_modalities'") ||
    message.includes("Missing required parameter: 'response.output_modalities'") ||
    message.includes("It is not possible to request both `text` and `audio`") ||
    message.includes("It is not possible to request both text and audio")
  );
}

function resolveRealtimeReasoningEffort(input) {
  const value = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (!value) {
    return "low";
  }
  if (["minimal", "low", "medium", "high"].includes(value)) {
    return value;
  }
  console.warn(
    `Invalid OPENAI_REALTIME_REASONING_EFFORT '${input}', falling back to low.`
  );
  return "low";
}

// Matches the gpt-realtime-2 family (2, 2.1, 2.1-mini, dated snapshots), which
// accepts `session.reasoning`. Earlier models (gpt-realtime, 1.5) do not.
function isRealtime2Model(model) {
  return /^gpt-realtime-2(?:[.-]|$)/.test(toTrimmedText(model).toLowerCase());
}

function getRealtimeConfigVariants({ includeText }) {
  void includeText;
  const gaVariants = isRealtime2Model(REALTIME_MODEL)
    ? [
      { schema: "ga", includeReasoning: true },
      { schema: "ga", includeReasoning: false }
    ]
    : [{ schema: "ga", includeReasoning: false }];
  return gaVariants;
}

function buildRealtimeHeaders(openaiApiKey) {
  return {
    Authorization: `Bearer ${openaiApiKey}`
  };
}

function buildStableRealtimeAudioConfig(voice) {
  const pcmFormat = {
    type: "audio/pcm",
    rate: INPUT_AUDIO_SAMPLE_RATE
  };
  return {
    input: {
      format: pcmFormat,
      turn_detection: null
    },
    output: {
      format: pcmFormat,
      voice
    }
  };
}

function applyRealtimeReasoning(config, configVariant) {
  if (configVariant.includeReasoning && isRealtime2Model(REALTIME_MODEL)) {
    config.reasoning = {
      effort: REALTIME_REASONING_EFFORT
    };
  }
  return config;
}

function buildRealtimeSessionConfig({
  languageA,
  languageB,
  voice,
  configVariant
}) {
  const instructions = buildStrictTranslationInstructions(languageA, languageB);
  if (configVariant.schema === "ga") {
    return applyRealtimeReasoning(
      {
        type: "realtime",
        instructions,
        audio: buildStableRealtimeAudioConfig(voice),
        output_modalities: ["audio"]
      },
      configVariant
    );
  }
  throw new Error(`Unsupported Realtime config schema: ${configVariant.schema}`);
}

function buildRealtimeResponseConfig({ languageA, languageB, configVariant }) {
  const instructions = buildStrictTranslationInstructions(languageA, languageB);
  if (configVariant.schema === "ga") {
    return {
      instructions,
      output_modalities: ["audio"]
    };
  }
  throw new Error(`Unsupported Realtime config schema: ${configVariant.schema}`);
}

function translateAudioTurnOnce({
  openaiApiKey,
  audioBase64,
  languageA,
  languageB,
  voice,
  includeText,
  configVariant,
  onAudioDelta,
  onTranslatedTextDelta,
  onTranslatedTextDone
}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(REALTIME_URL, {
      headers: buildRealtimeHeaders(openaiApiKey)
    });

    let completed = false;
    let sentAudio = false;
    let transcriptDelta = "";
    let textDelta = "";
    let doneText = "";
    const audioChunks = [];

    const timeout = setTimeout(() => {
      fail(new Error("Realtime request timed out."));
    }, 45000);

    function cleanup() {
      clearTimeout(timeout);
      ws.removeAllListeners();
    }

    function succeed(result) {
      if (completed) {
        return;
      }
      completed = true;
      cleanup();
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
      resolve(result);
    }

    function fail(error) {
      if (completed) {
        return;
      }
      completed = true;
      cleanup();
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
      reject(error);
    }

    ws.on("message", (raw) => {
      let event;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (event.type === "error") {
        const message = event.error?.message || "Unknown realtime API error.";
        fail(new Error(message));
        return;
      }

      if (event.type === "session.created") {
        const session = buildRealtimeSessionConfig({
          languageA,
          voice,
          languageB,
          configVariant
        });
        ws.send(
          JSON.stringify({
            type: "session.update",
            session
          })
        );
        return;
      }

      if (event.type === "session.updated" && !sentAudio) {
        sentAudio = true;
        ws.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
        ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: audioBase64
          })
        );
        ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));

        const responsePayload = buildRealtimeResponseConfig({
          languageA,
          languageB,
          configVariant
        });
        ws.send(
          JSON.stringify({
            type: "response.create",
            response: responsePayload
          })
        );
        return;
      }

      if (
        (event.type === "response.output_audio.delta" ||
          event.type === "response.audio.delta") &&
        typeof event.delta === "string"
      ) {
        if (typeof onAudioDelta === "function") {
          onAudioDelta(event.delta);
        }
        audioChunks.push(Buffer.from(event.delta, "base64"));
        return;
      }

      if (
        (event.type === "response.output_audio_transcript.delta" ||
          event.type === "response.audio_transcript.delta") &&
        typeof event.delta === "string"
      ) {
        if (typeof onTranslatedTextDelta === "function") {
          onTranslatedTextDelta(event.delta);
        }
        transcriptDelta += event.delta;
        return;
      }

      if (
        (event.type === "response.output_audio_transcript.done" ||
          event.type === "response.audio_transcript.done")
      ) {
        const doneChunk =
          typeof event.transcript === "string"
            ? event.transcript
            : typeof event.text === "string"
              ? event.text
              : "";
        if (doneChunk) {
          doneText = mergeTextFragments(doneText, doneChunk);
          if (typeof onTranslatedTextDone === "function") {
            onTranslatedTextDone(doneText);
          }
          return;
        }
      }

      if (
        event.type === "response.output_text.delta" &&
        typeof event.delta === "string"
      ) {
        if (typeof onTranslatedTextDelta === "function") {
          onTranslatedTextDelta(event.delta);
        }
        textDelta += event.delta;
        return;
      }

      if (
        event.type === "response.output_text.done" &&
        typeof event.text === "string"
      ) {
        doneText = mergeTextFragments(doneText, event.text);
        if (typeof onTranslatedTextDone === "function") {
          onTranslatedTextDone(doneText);
        }
        return;
      }

      if (event.type === "response.done") {
        if (event.response?.status && event.response.status !== "completed") {
          const detail =
            event.response?.status_details?.error?.message ||
            event.response?.status_details?.reason ||
            event.response.status;
          fail(new Error(`Realtime response failed: ${detail}`));
          return;
        }

        const fallbackText = extractTextFromResponse(event.response);
        const translatedText = (
          doneText ||
          transcriptDelta ||
          textDelta ||
          fallbackText ||
          ""
        ).trim();
        const realtimeUsageTokens =
          event.response?.usage &&
          typeof event.response.usage === "object" &&
          !Array.isArray(event.response.usage)
            ? event.response.usage
            : {};

        succeed({
          translatedText,
          translatedPcmAudioBuffer: Buffer.concat(audioChunks),
          realtimeUsageTokens
        });
      }
    });

    ws.on("error", (error) => fail(error));
    ws.on("close", (code, reason) => {
      if (!completed) {
        fail(
          new Error(`Realtime socket closed early (${code}): ${reason.toString()}`)
        );
      }
    });
  });
}

async function translateAudioTurn({
  openaiApiKey,
  audioBase64,
  languageA,
  languageB,
  voice,
  includeText = true,
  onAudioDelta,
  onTranslatedTextDelta,
  onTranslatedTextDone
}) {
  const variants = getRealtimeConfigVariants({ includeText });
  let lastError;
  for (const configVariant of variants) {
    try {
      return await translateAudioTurnOnce({
        openaiApiKey,
        audioBase64,
        languageA,
        languageB,
        voice,
        includeText,
        configVariant,
        onAudioDelta,
        onTranslatedTextDelta,
        onTranslatedTextDone
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = error;
      if (!isSchemaFallbackError(message)) {
        throw error;
      }
    }
  }
  throw lastError || new Error("Realtime translation failed.");
}

module.exports = {
  REALTIME_MODEL,
  REALTIME_REASONING_EFFORT,
  buildRealtimeHeaders,
  buildRealtimeResponseConfig,
  buildRealtimeSessionConfig,
  buildTranscriptionLanguageFields,
  getRealtimeConfigVariants,
  isRealtime2Model,
  resolveRealtimeReasoningEffort,
  transcribeWavBuffer,
  translateAudioTurn
};
