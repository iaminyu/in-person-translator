const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { WebSocketServer } = require("ws");

process.env.VERCEL = "1";
process.env.OPENAI_API_KEY = "sk-test";
process.env.GEMINI_API_KEY = "test-gemini-key";
delete process.env.GEMINI_ENGINE_ALLOWED_EMAILS;
delete process.env.GEMINI_LIVE_URL;

const app = require("../server");
const gemini = app.__test?.gemini;

const OWNER_EMAIL = "owner@example.com";
const AUDIO_A = Buffer.from([1, 2, 3, 4]).toString("base64");
const AUDIO_B = Buffer.from([5, 6]).toString("base64");

function withEnv(overrides, run) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  let result;
  try {
    result = run();
  } catch (error) {
    restore();
    throw error;
  }
  if (result && typeof result.then === "function") {
    return result.finally(restore);
  }
  restore();
  return result;
}

// A stand-in for the Gemini Live endpoint. `script` decides what the server
// sends back once the client has finished sending its turn.
function startFakeGemini(script) {
  return new Promise((resolve) => {
    const seen = { headers: null, setup: null, audioMessages: 0, order: [], closedByClient: false };
    const server = new WebSocketServer({ port: 0, host: "127.0.0.1" }, () => {
      resolve({
        url: `ws://127.0.0.1:${server.address().port}`,
        seen,
        close: () => new Promise((done) => server.close(done))
      });
    });
    server.on("connection", (socket, request) => {
      seen.headers = request.headers;
      const send = (payload) => socket.send(Buffer.from(JSON.stringify(payload)));
      socket.on("close", () => {
        seen.closedByClient = true;
      });
      socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.setup) {
          seen.setup = message.setup;
          send({ setupComplete: {} });
          return;
        }
        const input = message.realtimeInput || {};
        if (input.activityStart) seen.order.push("start");
        if (input.audio) {
          seen.audioMessages += 1;
          seen.audioMimeType = input.audio.mimeType;
          if (seen.order[seen.order.length - 1] !== "audio") seen.order.push("audio");
        }
        if (input.activityEnd) {
          seen.order.push("end");
          script({ send, socket });
        }
      });
    });
  });
}

const fullTurn = ({ send }) => {
  send({ serverContent: { inputTranscription: { text: "你好" } } });
  send({
    serverContent: {
      modelTurn: { parts: [{ inlineData: { data: AUDIO_A, mimeType: "audio/pcm;rate=24000" } }] },
      outputTranscription: { text: "สวัสดี" }
    }
  });
  send({
    serverContent: {
      modelTurn: { parts: [{ inlineData: { data: AUDIO_B } }] },
      outputTranscription: { text: "ครับ" }
    }
  });
  send({ serverContent: { generationComplete: true } });
  // turnComplete is deliberately never sent: the engine must not wait for it.
};

test("Gemini Live setup is audio-only, push-to-talk, with transcripts", () => {
  const setup = gemini.buildGeminiLiveSetup({
    languageA: "Chinese",
    languageB: "Thai",
    model: "gemini-3.8-live"
  });
  assert.equal(setup.model, "models/gemini-3.8-live");
  assert.deepEqual(setup.generationConfig, { responseModalities: ["AUDIO"] });
  assert.equal(setup.systemInstruction.parts[0].text.includes("Chinese and Thai"), true);
  // Both directions are spelled out by name, and third languages are ruled out.
  const instructions = setup.systemInstruction.parts[0].text;
  assert.equal(
    instructions.includes(
      "If the speaker uses Chinese, output must be in Thai. If the speaker uses Thai, output must be in Chinese."
    ),
    true
  );
  assert.equal(
    instructions.includes("Output only Chinese or Thai. Never output any other language, not even English"),
    true
  );
  // Saying the sentence back in the language it was spoken in is ruled out.
  assert.equal(
    instructions.includes(
      "speech in Chinese is never answered in Chinese, and speech in Thai is never answered in Thai"
    ),
    true
  );
  // One example in each direction.
  assert.equal(instructions.includes('Input "这个多少钱？" -> Output "อันนี้ราคาเท่าไหร่"'), true);
  assert.equal(instructions.includes('Input "ห้องน้ำอยู่ที่ไหน" -> Output "洗手间在哪里？"'), true);
  assert.equal(instructions.includes("ChatGPT"), false);
  assert.equal(/Language [AB]\b/.test(instructions), false);
  assert.deepEqual(setup.realtimeInputConfig, {
    automaticActivityDetection: { disabled: true }
  });
  // The transcript of what was heard is told which two languages to expect.
  assert.deepEqual(setup.inputAudioTranscription, { languageCodes: ["zh-Hans", "th"] });
  // The translation's transcript is left unhinted (see buildGeminiLiveSetup).
  assert.deepEqual(setup.outputAudioTranscription, {});
});

test("Gemini transcript hint is left out for an unknown or doubled language", () => {
  const hintFor = (languageA, languageB) =>
    gemini.buildGeminiLiveSetup({ languageA, languageB, model: "m" }).inputAudioTranscription;
  assert.deepEqual(hintFor("English", "Portuguese"), { languageCodes: ["en", "pt-BR"] });
  assert.deepEqual(hintFor("Chinese", "Klingon"), {});
  assert.deepEqual(hintFor("Thai", "Thai"), {});
  assert.deepEqual(
    gemini.buildGeminiLiveSetup({
      languageA: "Chinese",
      languageB: "Thai",
      model: "m",
      transcriptionHint: false
    }).inputAudioTranscription,
    {}
  );
  assert.deepEqual(
    gemini.buildGeminiLiveSetup({
      languageA: "Chinese",
      languageB: "Thai",
      model: "m",
      outputTranscriptionHint: true
    }).outputAudioTranscription,
    { languageCodes: ["zh-Hans", "th"] }
  );
});

test("OpenAI transcription is told the language, or the pair it may be in", () => {
  const fields = app.__test.buildTranscriptionLanguageFields;
  assert.deepEqual(fields({ languages: ["Chinese", "Thai"] }), { languages: ["zh", "th"] });
  // One known language wins over the pair (a translation).
  assert.deepEqual(fields({ language: "Thai", languages: ["Chinese", "Thai"] }), { language: "th" });
  assert.deepEqual(fields({ language: "Klingon", languages: ["Portuguese", "Filipino"] }), {
    languages: ["pt", "tl"]
  });
  assert.deepEqual(fields({ languages: ["Klingon", ""] }), {});
  // Names that are also built-in object keys are unknown languages.
  assert.deepEqual(fields({ languages: ["constructor", "__proto__"] }), {});
  assert.deepEqual(
    gemini.buildGeminiLiveSetup({ languageA: "constructor", languageB: "Thai", model: "m" })
      .inputAudioTranscription,
    {}
  );
  assert.deepEqual(fields(), {});
});

test("Gemini turn sends one push-to-talk turn and ends at generationComplete", async () => {
  const fake = await startFakeGemini(fullTurn);
  try {
    const audioDeltas = [];
    const sourceTexts = [];
    const textDeltas = [];
    const result = await withEnv({ GEMINI_LIVE_URL: fake.url }, () =>
      gemini.translateAudioTurnGemini({
        geminiApiKey: "test-gemini-key",
        // 0.25 s of 24 kHz PCM16 -> three 100 ms chunks
        audioBase64: Buffer.alloc(12000).toString("base64"),
        languageA: "Chinese",
        languageB: "Thai",
        onAudioDelta: (delta) => audioDeltas.push(delta),
        onSourceText: (text) => sourceTexts.push(text),
        onTranslatedTextDelta: (delta) => textDeltas.push(delta)
      })
    );

    assert.equal(fake.seen.headers["x-goog-api-key"], "test-gemini-key");
    assert.equal(fake.seen.setup.model, "models/gemini-3.8-live");
    assert.deepEqual(fake.seen.order, ["start", "audio", "end"]);
    assert.equal(fake.seen.audioMessages, 3);
    assert.equal(fake.seen.audioMimeType, "audio/pcm;rate=24000");

    assert.equal(result.sourceText, "你好");
    assert.equal(result.translatedText, "สวัสดีครับ");
    assert.deepEqual([...result.translatedPcmAudioBuffer], [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(audioDeltas, [AUDIO_A, AUDIO_B]);
    assert.deepEqual(sourceTexts, ["你好"]);
    assert.deepEqual(textDeltas, ["สวัสดี", "ครับ"]);
  } finally {
    await fake.close();
  }
});

test("Gemini turn removes markers that were never spoken from the text", async () => {
  const fake = await startFakeGemini(({ send }) => {
    send({ serverContent: { outputTranscription: { text: "<no spe" } } });
    send({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: AUDIO_A } }] },
        outputTranscription: { text: "ech>{pause}你想" }
      }
    });
    send({ serverContent: { outputTranscription: { text: "谈什么？✨{pause}" } } });
    send({ serverContent: { generationComplete: true } });
  });
  try {
    const textDeltas = [];
    const result = await withEnv({ GEMINI_LIVE_URL: fake.url }, () =>
      gemini.translateAudioTurnGemini({
        geminiApiKey: "test-gemini-key",
        audioBase64: Buffer.alloc(4800).toString("base64"),
        languageA: "Chinese",
        languageB: "English",
        onTranslatedTextDelta: (delta) => textDeltas.push(delta)
      })
    );
    assert.equal(result.translatedText, "你想谈什么？");
    assert.equal(result.translatedTextIncomplete, false);
    assert.deepEqual(textDeltas, ["你想", "谈什么？"]);
  } finally {
    await fake.close();
  }
});

test("Gemini turn waits for the rest of a transcript that stops at <partial>", async () => {
  const partialTurn = ({ send }) => {
    send({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: AUDIO_A } }] },
        outputTranscription: { text: "<no speech>{pause}你想谈<partial>" }
      }
    });
    send({ serverContent: { generationComplete: true } });
  };
  const run = (fake, extra = {}) =>
    withEnv({ GEMINI_LIVE_URL: fake.url }, () =>
      gemini.translateAudioTurnGemini({
        geminiApiKey: "test-gemini-key",
        audioBase64: Buffer.alloc(4800).toString("base64"),
        languageA: "Chinese",
        languageB: "English",
        ...extra
      })
    );

  const completing = await startFakeGemini((peer) => {
    partialTurn(peer);
    setTimeout(() => peer.send({ serverContent: { outputTranscription: { text: "什么？" } } }), 150);
    setTimeout(() => peer.send({ serverContent: { turnComplete: true } }), 200);
  });
  try {
    const result = await run(completing);
    assert.equal(result.translatedText, "你想谈什么？");
    assert.equal(result.translatedTextIncomplete, false);
    assert.deepEqual([...result.translatedPcmAudioBuffer], [1, 2, 3, 4]);
  } finally {
    await completing.close();
  }

  // Nothing more arrives: the turn still ends, and says the text is partial.
  const silent = await startFakeGemini(partialTurn);
  try {
    const startedAt = Date.now();
    const result = await run(silent, { unfinishedTextMaxMs: 300 });
    const waited = Date.now() - startedAt;
    assert.equal(result.translatedText, "你想谈");
    assert.equal(result.translatedTextIncomplete, true);
    assert.ok(waited >= 250 && waited < 1500, `waited ${waited} ms`);
  } finally {
    await silent.close();
  }

  // The connection dropping while waiting must not lose the audio.
  const dropping = await startFakeGemini((peer) => {
    partialTurn(peer);
    setTimeout(() => peer.socket.terminate(), 50);
  });
  try {
    const result = await run(dropping);
    assert.equal(result.translatedText, "你想谈");
    assert.equal(result.translatedTextIncomplete, true);
  } finally {
    await dropping.close();
  }
});

test("Gemini turn waits for text that is missing when the audio is complete", async () => {
  const audioOnly = ({ send }) => {
    send({ serverContent: { modelTurn: { parts: [{ inlineData: { data: AUDIO_A } }] } } });
    send({ serverContent: { generationComplete: true } });
  };
  const run = async (fake, extra = {}) => {
    const startedAt = Date.now();
    const result = await withEnv({ GEMINI_LIVE_URL: fake.url }, () =>
      gemini.translateAudioTurnGemini({
        geminiApiKey: "test-gemini-key",
        audioBase64: Buffer.alloc(4800).toString("base64"),
        languageA: "Chinese",
        languageB: "English",
        ...extra
      })
    );
    return { result, waited: Date.now() - startedAt };
  };

  // The text arrives late and no turnComplete follows: a short quiet spell
  // ends the turn, not the full limit.
  const late = await startFakeGemini((peer) => {
    audioOnly(peer);
    setTimeout(() => peer.send({ serverContent: { outputTranscription: { text: "Hello " } } }), 150);
    setTimeout(() => peer.send({ serverContent: { outputTranscription: { text: "there." } } }), 250);
  });
  try {
    const { result, waited } = await run(late);
    assert.equal(result.translatedText, "Hello there.");
    assert.equal(result.translatedTextIncomplete, false);
    assert.ok(waited >= 500 && waited < 2000, `waited ${waited} ms`);
  } finally {
    await late.close();
  }

  const never = await startFakeGemini(audioOnly);
  try {
    const { result, waited } = await run(never, { unfinishedTextMaxMs: 300 });
    assert.equal(result.translatedText, "");
    assert.equal(result.translatedTextIncomplete, false);
    assert.deepEqual([...result.translatedPcmAudioBuffer], [1, 2, 3, 4]);
    assert.ok(waited >= 250 && waited < 1500, `waited ${waited} ms`);
  } finally {
    await never.close();
  }

  // An error reported while only the text is awaited must not undo a
  // translation whose audio was already passed on.
  const failing = await startFakeGemini((peer) => {
    audioOnly(peer);
    setTimeout(() => peer.send({ error: { message: "late trouble" } }), 50);
  });
  try {
    const { result } = await run(failing);
    assert.equal(result.translatedText, "");
    assert.deepEqual([...result.translatedPcmAudioBuffer], [1, 2, 3, 4]);
  } finally {
    await failing.close();
  }
});

test("Gemini turn fails when no translated audio came back", async () => {
  const fake = await startFakeGemini(({ send }) => {
    send({ serverContent: { outputTranscription: { text: "text only" } } });
    send({ serverContent: { generationComplete: true } });
  });
  try {
    await assert.rejects(
      withEnv({ GEMINI_LIVE_URL: fake.url }, () =>
        gemini.translateAudioTurnGemini({
          geminiApiKey: "test-gemini-key",
          audioBase64: Buffer.alloc(4800).toString("base64"),
          languageA: "Chinese",
          languageB: "Thai"
        })
      ),
      /no translated audio/
    );
  } finally {
    await fake.close();
  }
});

test("Gemini turn fails when the socket closes early or reports an error", async () => {
  const closing = await startFakeGemini(({ socket }) => socket.close(1011, "boom"));
  try {
    await assert.rejects(
      withEnv({ GEMINI_LIVE_URL: closing.url }, () =>
        gemini.translateAudioTurnGemini({
          geminiApiKey: "test-gemini-key",
          audioBase64: Buffer.alloc(4800).toString("base64"),
          languageA: "Chinese",
          languageB: "Thai"
        })
      ),
      /closed early \(1011\): boom/
    );
  } finally {
    await closing.close();
  }

  const erroring = await startFakeGemini(({ send }) => send({ error: { message: "quota exceeded" } }));
  try {
    await assert.rejects(
      withEnv({ GEMINI_LIVE_URL: erroring.url }, () =>
        gemini.translateAudioTurnGemini({
          geminiApiKey: "test-gemini-key",
          audioBase64: Buffer.alloc(4800).toString("base64"),
          languageA: "Chinese",
          languageB: "Thai"
        })
      ),
      /Gemini Live error: quota exceeded/
    );
  } finally {
    await erroring.close();
  }
});

test("Gemini turn gives up quickly when no translated audio starts", async () => {
  const fake = await startFakeGemini(({ send }) => {
    send({ serverContent: { inputTranscription: { text: "你好" } } });
    // ...and then nothing: no audio, no generationComplete.
  });
  try {
    const startedAt = Date.now();
    await assert.rejects(
      withEnv({ GEMINI_LIVE_URL: fake.url }, () =>
        gemini.translateAudioTurnGemini({
          geminiApiKey: "test-gemini-key",
          audioBase64: Buffer.alloc(4800).toString("base64"),
          languageA: "Chinese",
          languageB: "Thai",
          firstAudioTimeoutMs: 150
        })
      ),
      /no translated audio in time/
    );
    assert.ok(Date.now() - startedAt < 2000);
  } finally {
    await fake.close();
  }
});

// Calls to OpenAI from inside the server are recorded and refused, so these
// endpoint tests stay offline and can assert that none were attempted.
function blockOpenAiFetch() {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || String(input);
    if (url.includes("api.openai.com")) {
      calls.push(url);
      return Promise.reject(new Error("OpenAI is blocked in this test"));
    }
    return originalFetch(input, init);
  };
  return {
    calls,
    restore: () => {
      global.fetch = originalFetch;
    }
  };
}

async function postTurn(server) {
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/translate-turn-stream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioBase64: Buffer.alloc(24000).toString("base64"),
        languageA: "Chinese",
        languageB: "Thai",
        voice: "marin",
        lowLatencyAudio: false
      })
    }
  );
  assert.equal(response.status, 200);
  const body = await response.text();
  return body.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

test("Stream endpoint does not switch engines once Gemini audio has started", async () => {
  const fake = await startFakeGemini(({ send, socket }) => {
    send({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: AUDIO_A } }] },
        outputTranscription: { text: "สวัสดี" }
      }
    });
    setTimeout(() => socket.close(1011, "mid-turn failure"), 20);
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const openai = blockOpenAiFetch();
  try {
    const events = await withEnv(
      { GEMINI_LIVE_URL: fake.url, GEMINI_ENGINE_ALLOWED_EMAILS: "*" },
      () => postTurn(server)
    );
    const types = events.map((event) => event.type);
    assert.equal(types.filter((type) => type === "translated_audio_delta").length, 1);
    assert.equal(types.includes("done"), false);
    assert.equal(types[types.length - 1], "error");
    assert.match(events[events.length - 1].message, /closed early \(1011\)/);
    assert.deepEqual(openai.calls, []);
  } finally {
    openai.restore();
    await new Promise((resolve) => server.close(resolve));
    await fake.close();
  }
});

test("Stream endpoint serves a Gemini turn without calling the transcription model", async () => {
  const fake = await startFakeGemini(fullTurn);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const openai = blockOpenAiFetch();
  try {
    const events = await withEnv(
      { GEMINI_LIVE_URL: fake.url, GEMINI_ENGINE_ALLOWED_EMAILS: "*" },
      () => postTurn(server)
    );

    // The request's id comes first, before any answer (the page names the
    // request in its turn report even if the answer never reaches it).
    const accepted = events.shift();
    assert.equal(accepted.type, "accepted");
    assert.match(accepted.requestId, /^ul_translate-turn-stream_\d+_[0-9a-f]{12}$/);
    assert.deepEqual(
      events.map((event) => event.type),
      [
        "source_text",
        "translated_text_delta",
        "translated_audio_delta",
        "translated_text_delta",
        "translated_audio_delta",
        "translated_text_done",
        "done"
      ]
    );
    assert.equal(events[0].text, "你好");
    assert.equal(events.some((event) => event.type === "warning"), false);
    assert.deepEqual(events[2], {
      type: "translated_audio_delta",
      audio: AUDIO_A,
      format: "pcm16",
      sampleRate: 24000
    });
    assert.equal(events[5].text, "สวัสดีครับ");
    const done = events[6];
    assert.equal(done.engine, "gemini");
    assert.equal(done.sourceText, "你好");
    assert.equal(done.translatedText, "สวัสดีครับ");
    // Give a stray fire-and-forget transcription call time to show up.
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(openai.calls, []);
  } finally {
    openai.restore();
    await new Promise((resolve) => server.close(resolve));
    await fake.close();
  }
});

// A whole Thai sentence, as Gemini wrote it on a real turn (2026-11-16) whose
// voice stopped after 0.7 s.
const WHOLE_SENTENCE =
  "แต่วิชาคณิตศาสตร์ฉันคิดว่ามีข้อดีอยู่อย่างหนึ่ง คือถูกก็คือถูก ผิดก็คือผิด";

// Gemini's answer: the whole sentence as text at once, and this much speech.
const sentenceWithSpeech = (seconds) => ({ send }) => {
  send({ serverContent: { inputTranscription: { text: "但是数学我觉得有一点好" } } });
  send({
    serverContent: {
      modelTurn: {
        parts: [
          { inlineData: { data: Buffer.alloc(Math.round(seconds * 48000)).toString("base64") } }
        ]
      },
      outputTranscription: { text: WHOLE_SENTENCE }
    }
  });
  send({ serverContent: { generationComplete: true } });
};

test("Gemini turn says when the speech stopped long before the end of its text", async () => {
  for (const [spokenSeconds, cutShort] of [
    [0.7, true],
    [5, false]
  ]) {
    const fake = await startFakeGemini(sentenceWithSpeech(spokenSeconds));
    try {
      const result = await withEnv({ GEMINI_LIVE_URL: fake.url }, () =>
        gemini.translateAudioTurnGemini({
          geminiApiKey: "test-gemini-key",
          audioBase64: Buffer.alloc(12000).toString("base64"),
          languageA: "Chinese",
          languageB: "Thai"
        })
      );
      // The text is whole either way; only the voice differs.
      assert.equal(result.translatedText, WHOLE_SENTENCE);
      assert.equal(result.translatedTextIncomplete, false);
      assert.equal(result.translatedPcmAudioBuffer.length, Math.round(spokenSeconds * 48000));
      assert.equal(result.translatedAudioCutShort, cutShort, `${spokenSeconds} s`);
    } finally {
      await fake.close();
    }
  }
});

test("Stream endpoint tells the page when the speech was cut short, and only then", async () => {
  for (const [spokenSeconds, cutShort] of [
    [0.7, true],
    [5, false]
  ]) {
    const fake = await startFakeGemini(sentenceWithSpeech(spokenSeconds));
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const openai = blockOpenAiFetch();
    try {
      const events = await withEnv(
        { GEMINI_LIVE_URL: fake.url, GEMINI_ENGINE_ALLOWED_EMAILS: "*" },
        () => postTurn(server)
      );
      const done = events[events.length - 1];
      assert.equal(done.type, "done");
      assert.equal(done.engine, "gemini");
      assert.equal(done.translatedText, WHOLE_SENTENCE);
      assert.equal(done.translatedAudioCutShort, cutShort ? true : undefined, `${spokenSeconds} s`);
      // The speech that did come was passed on as it arrived.
      assert.equal(events.filter((event) => event.type === "translated_audio_delta").length, 1);
      assert.deepEqual(openai.calls, []);
    } finally {
      openai.restore();
      await new Promise((resolve) => server.close(resolve));
      await fake.close();
    }
  }
});

// Stands in for OpenAI's transcription endpoint: `answer` gets each request
// and returns { status, body }. Everything else goes to the real fetch.
function fakeOpenAiTranscription(answer) {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || String(input);
    if (!url.includes("api.openai.com")) return originalFetch(input, init);
    const file = init.body.get("file");
    const request = {
      url,
      authorization: init.headers.Authorization,
      model: init.body.get("model"),
      wav: Buffer.from(await file.arrayBuffer()),
      hasDeadline: init.signal instanceof AbortSignal
    };
    requests.push(request);
    const reply = answer(request);
    return new Response(JSON.stringify(reply.body), {
      status: reply.status || 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  return {
    requests,
    restore: () => {
      global.fetch = originalFetch;
    }
  };
}

// Half a second of 24 kHz PCM16.
const HALF_SECOND_PCM = Buffer.alloc(24000);

async function withSpokenTextServer(run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const post = (payload) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/gemini-live/spoken-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  try {
    await run(post);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("Spoken-text endpoint has the played audio written down", async () => {
  const openai = fakeOpenAiTranscription(() => ({ body: { text: " สวัสดีครับ \n" } }));
  try {
    await withSpokenTextServer(async (post) => {
      const response = await withEnv({ GEMINI_ENGINE_ALLOWED_EMAILS: "*" }, () =>
        post({ audioBase64: HALF_SECOND_PCM.toString("base64") })
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { text: "สวัสดีครับ" });
    });
    assert.equal(openai.requests.length, 1);
    const request = openai.requests[0];
    assert.equal(request.url, "https://api.openai.com/v1/audio/transcriptions");
    assert.match(request.authorization, /^Bearer \S+/);
    assert.equal(request.model, "gpt-transcribe");
    assert.equal(request.hasDeadline, true);
    assert.equal(request.wav.subarray(0, 4).toString(), "RIFF");
    assert.equal(request.wav.readUInt32LE(24), 24000);
    assert.equal(request.wav.length, 44 + HALF_SECOND_PCM.length);
  } finally {
    openai.restore();
  }
});

test("Spoken-text endpoint turns down audio it cannot take, without asking the model", async () => {
  const openai = fakeOpenAiTranscription(() => ({ body: { text: "unused" } }));
  try {
    await withSpokenTextServer(async (post) => {
      const rejected = [
        // No audio, too short, half a sample, longer than a minute.
        {},
        { audioBase64: Buffer.alloc(100).toString("base64") },
        { audioBase64: Buffer.alloc(24001).toString("base64") },
        { audioBase64: Buffer.alloc(61 * 48000).toString("base64") }
      ];
      for (const payload of rejected) {
        const response = await withEnv({ GEMINI_ENGINE_ALLOWED_EMAILS: "*" }, () => post(payload));
        assert.equal(response.status, 400);
      }
    });
    assert.deepEqual(openai.requests, []);
  } finally {
    openai.restore();
  }
});

test("Spoken-text endpoint reports a failed transcription and an empty one", async () => {
  let reply = { status: 503, body: { error: { message: "The model is overloaded." } } };
  const openai = fakeOpenAiTranscription(() => reply);
  try {
    await withSpokenTextServer(async (post) => {
      const ask = () =>
        withEnv({ GEMINI_ENGINE_ALLOWED_EMAILS: "*" }, () =>
          post({ audioBase64: HALF_SECOND_PCM.toString("base64") })
        );
      const failed = await ask();
      assert.equal(failed.status, 502);
      assert.match((await failed.json()).error, /overloaded/);

      reply = { body: { text: "" } };
      const empty = await ask();
      assert.equal(empty.status, 200);
      assert.deepEqual(await empty.json(), { text: "" });
    });
  } finally {
    openai.restore();
  }
});

