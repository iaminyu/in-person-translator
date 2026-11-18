const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const WebSocket = require("ws");

process.env.VERCEL = "1";
process.env.OPENAI_API_KEY = "sk-test";
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.GEMINI_ENGINE_ALLOWED_EMAILS = "";
process.env.GEMINI_AUTH_TOKENS_URL = "";
process.env.GEMINI_LIVE_DIRECT_URL = "";

const app = require("../server");
const { createConversation } = require("../public/voice-translator/gemini-handsfree.js");

const AUDIO_100MS = Buffer.alloc(4800, 3).toString("base64"); // 0.1 s of translated audio
const FRAME = Buffer.alloc(4800, 1).toString("base64"); // 0.1 s of someone speaking
const QUIET = Buffer.alloc(4800, 2).toString("base64"); // 0.1 s of the room
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, label, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await wait(5);
  }
  assert.fail(`timed out waiting for: ${label}`);
}

// Stand-in for Gemini Live with manual turn marks (the push-to-talk setup).
// Each connection is recorded and the test decides when "Gemini" answers.
function startFakeGemini() {
  return new Promise((resolve) => {
    const connections = [];
    const server = new WebSocket.WebSocketServer({ port: 0, host: "127.0.0.1" }, () => {
      resolve({
        wsUrl: `ws://127.0.0.1:${server.address().port}/live`,
        connections,
        // Connections that were sent anything, in the order they were opened.
        used: () => connections.filter((connection) => connection.log.length > 0),
        close: () =>
          new Promise((done) => {
            for (const client of server.clients) client.terminate();
            server.close(done);
          })
      });
    });
    server.on("connection", (socket) => {
      const connection = {
        log: [],
        closed: false,
        send: (payload) => socket.send(Buffer.from(JSON.stringify(payload))),
        terminate: () => socket.terminate(),
        // A complete translation: heard text, audio, text, then done.
        answer: (heard, text) => {
          connection.send({ serverContent: { inputTranscription: { text: heard } } });
          connection.send({
            serverContent: {
              modelTurn: { parts: [{ inlineData: { data: AUDIO_100MS } }] },
              outputTranscription: { text }
            }
          });
          connection.send({ serverContent: { generationComplete: true } });
          connection.send({ serverContent: { turnComplete: true } });
        },
        // The words of a translation, but no voice.
        answerTextOnly: (text) => {
          connection.send({ serverContent: { outputTranscription: { text } } });
          connection.send({ serverContent: { generationComplete: true } });
        },
        // Gemini heard something, but says itself that it was not speech.
        answerNoSpeech: (heard, marker) => {
          connection.send({ serverContent: { inputTranscription: { text: heard } } });
          connection.send({ serverContent: { outputTranscription: { text: marker } } });
          connection.send({ serverContent: { generationComplete: true } });
        },
        // Gemini found nothing to translate.
        answerNothing: () => {
          connection.send({ serverContent: { generationComplete: true } });
        }
      };
      connections.push(connection);
      socket.on("close", () => {
        connection.closed = true;
      });
      socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.setup) {
          connection.send({ setupComplete: {} });
          return;
        }
        const input = message.realtimeInput || {};
        if (input.activityStart) connection.log.push("start");
        if (input.activityEnd) connection.log.push("end");
        if (input.audio) {
          connection.log.push(
            input.audio.data === FRAME ? "speech" : input.audio.data === QUIET ? "room" : "other"
          );
        }
      });
    });
  });
}

let leaseCounter = 0;
const leaseFor = (fake) => async () => {
  leaseCounter += 1;
  return {
    leaseId: `ul_gemini-live-lease_1794700000000_${String(leaseCounter).padStart(12, "0")}`,
    token: "auth_tokens/test",
    wsUrl: fake.wsUrl,
    model: "models/gemini-3.8-live",
    inputRate: 24000
  };
};

// A conversation with short timings, and a record of what it reported.
function conversationFor(fake, overrides = {}) {
  const events = [];
  const results = [];
  const conversation = createConversation({
    WebSocketImpl: WebSocket,
    requestLease: leaseFor(fake),
    poolSize: 2,
    minSpeechMs: 200,
    candidateTimeoutMs: 40,
    preRollMs: 200,
    endSilenceMs: 50,
    dipMs: 0,
    warmUpMs: 0,
    playbackGuardMs: 20,
    retryDelayMs: 15,
    ...overrides,
    handlers: {
      onHearingChange: (open) => events.push(open ? "hearing" : "not-hearing"),
      onTurnStart: (turn) => events.push(`start:${turn.id}`),
      onSourceText: (turn, text) => events.push(`heard:${text}`),
      onTranslatedTextDelta: (turn, delta) => {
        // What the page does: it keeps the text shown so far on the turn.
        turn.text = (turn.text || "") + delta;
        events.push(`text:${delta}`);
      },
      onAudioDelta: (turn, data, seconds) => events.push(`audio:${seconds}`),
      onTurnRetry: (turn, rejected) =>
        events.push(rejected ? `retry:${turn.id}:rejected:${rejected.translatedText}` : `retry:${turn.id}`),
      onTurnEnd: (turn, result) => {
        events.push(`end:${turn.id}`);
        results.push(result);
      },
      onTurnEmpty: (turn) => events.push(`empty:${turn.id}`),
      onTurnError: (turn, error) => events.push(`error:${error.message}`),
      onTurnInterrupted: (turn) => events.push(`interrupted:${turn.id}`),
      onError: (error) => events.push(`fatal:${error.message}`)
    }
  });
  return { conversation, events, results };
}

const readyCount = (conversation) => conversation.getPoolState().ready;
const speak = (conversation, frames) => {
  for (let i = 0; i < frames; i += 1) conversation.pushAudio(FRAME, 100, 0.2);
};
const room = (conversation, frames = 1) => {
  for (let i = 0; i < frames; i += 1) conversation.pushAudio(QUIET, 100, 0);
};
// Quiet for long enough that the sentence counts as finished.
async function pause(conversation) {
  await wait(70);
  room(conversation);
}

async function started(fake, overrides) {
  const context = conversationFor(fake, overrides);
  context.conversation.start();
  await until(() => readyCount(context.conversation) === 2, "two sessions waiting");
  return context;
}

test("a sentence is sent whole, between start and end marks, with the moment before it", async () => {
  const fake = await startFakeGemini();
  const { conversation, events, results } = await started(fake);
  try {
    room(conversation, 5); // nothing is sent while nobody speaks
    await wait(30);
    assert.equal(fake.used().length, 0);

    speak(conversation, 3);
    assert.equal(conversation.isHearing(), true);
    await pause(conversation);
    assert.equal(conversation.isHearing(), false);
    assert.equal(conversation.isTranslating(), true);

    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sentence sent");
    const connection = fake.used()[0];
    // One frame of the room from before the first word, the three spoken
    // frames, the quiet frame that ended it.
    assert.deepEqual(connection.log, ["start", "room", "speech", "speech", "speech", "room", "end"]);

    connection.answer("你好", "สวัสดี");
    await until(() => results.length === 1, "turn finished");
    assert.deepEqual(events, [
      "hearing",
      "not-hearing",
      "start:1",
      "heard:你好",
      "text:สวัสดี",
      "audio:0.1",
      "end:1"
    ]);
    assert.equal(results[0].sourceText, "你好");
    assert.equal(results[0].translatedText, "สวัสดี");
    assert.ok(Math.abs(results[0].inputSeconds - 0.5) < 1e-9);
    assert.equal(results[0].outputSeconds, 0.1);
    assert.match(results[0].leaseId, /^ul_gemini-live-lease_/);
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("a short noise is dropped without being sent anywhere", async () => {
  const fake = await startFakeGemini();
  const { conversation, events } = await started(fake);
  try {
    speak(conversation, 1); // a click: loud, but far too short to be speech
    await wait(60);
    room(conversation, 2);
    await wait(30);
    assert.equal(fake.used().length, 0);
    assert.equal(conversation.getPoolState().waiting, 2);
    assert.deepEqual(events, []);

    // A real sentence afterwards is not affected by it.
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sentence sent");
    assert.deepEqual(fake.used()[0].log.filter((entry) => entry === "speech").length, 3);
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("every sentence gets a fresh session and the translation being played is not listened to", async () => {
  const fake = await startFakeGemini();
  const { conversation, results } = await started(fake);
  try {
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "first sent");
    const first = fake.used()[0];
    first.send({ serverContent: { modelTurn: { parts: [{ inlineData: { data: AUDIO_100MS } }] } } });
    await until(() => conversation.isTranslating() && !conversation.isHearing(), "playing");
    await wait(20);

    // The phone hears its own translation: that must not become a sentence.
    speak(conversation, 4);
    await wait(30);
    assert.equal(fake.used().length, 1);

    first.send({ serverContent: { generationComplete: true } });
    first.send({ serverContent: { turnComplete: true } });
    await until(() => results.length === 1, "first finished");
    await until(() => !conversation.isTranslating(), "playback over");

    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 2, "second sentence on another session");
    const second = fake.used()[1];
    assert.notEqual(second, first);
    await until(() => second.log.includes("end"), "second sent");
    assert.deepEqual(second.log, ["start", "speech", "speech", "speech", "room", "end"]);
    assert.equal(first.closed, true);
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("once a sentence has ended it stands: later sound neither takes it back nor starts another", async () => {
  const fake = await startFakeGemini();
  const { conversation, events, results } = await started(fake);
  try {
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
    const first = fake.used()[0];

    // A door, a cough, the speaker adding a word: the translation that is
    // on its way must still arrive.
    speak(conversation, 6);
    await wait(40);
    assert.equal(conversation.isHearing(), false);
    assert.equal(fake.used().length, 1);
    assert.equal(first.closed, false);

    first.answer("你好", "สวัสดี");
    await until(() => results.length === 1, "answered");
    assert.equal(results[0].translatedText, "สวัสดี");
    assert.equal(events.some((event) => event.startsWith("interrupted:")), false);

    // After it has been played, the next sentence is heard as usual.
    await until(() => !conversation.isTranslating(), "playback over");
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 2 && fake.used()[1].log.includes("end"), "next sentence sent");
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("the burst of a microphone switching on is not taken for speech", async () => {
  const fake = await startFakeGemini();
  const { conversation } = await started(fake, { warmUpMs: 500 });
  try {
    speak(conversation, 4); // loud, but within the first half second
    room(conversation, 2);
    await wait(30);
    assert.equal(conversation.isHearing(), false);
    assert.equal(fake.used().length, 0);

    speak(conversation, 3);
    assert.equal(conversation.isHearing(), true);
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("a sentence whose answer never comes is given up and listening goes on", async () => {
  const fake = await startFakeGemini();
  // The session's own time limits are set far away, so only the last line of
  // defence can end the wait.
  const { conversation, events } = await started(fake, {
    answerWatchdogMs: 120,
    answerTimeoutMs: 60000,
    turnTimeoutMs: 60000
  });
  try {
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
    assert.equal(conversation.isTranslating(), true);
    // "Gemini" says nothing at all.
    await until(() => events.includes("empty:1"), "given up", 1000);
    assert.equal(conversation.isTranslating(), false);

    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 2, "next sentence is taken");
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("a stalled phone delivering frames late does not cut the sentence", async () => {
  const fake = await startFakeGemini();
  const { conversation } = await started(fake, { endSilenceMs: 300 });
  try {
    speak(conversation, 3);
    // The phone stalls for longer than the end pause, then delivers a quiet
    // frame. Only 0.1 s of quiet was heard, so the sentence is not over.
    await wait(400);
    room(conversation, 1);
    assert.equal(conversation.isHearing(), true);
    room(conversation, 1);
    assert.equal(conversation.isHearing(), true);
    room(conversation, 1); // 0.3 s of quiet audio: now it is
    assert.equal(conversation.isHearing(), false);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("whitespace from the transcript does not open a card for a noise", async () => {
  const fake = await startFakeGemini();
  const { conversation, events } = await started(fake);
  try {
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
    fake.used()[0].send({ serverContent: { inputTranscription: { text: " " } } });
    fake.used()[0].answerNothing();
    await until(() => events.includes("empty:1"), "reported as empty");
    assert.equal(events.some((event) => event.startsWith("start:")), false);
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("words without a voice are asked for again with the same audio", async () => {
  const fake = await startFakeGemini();
  const { conversation, events, results } = await started(fake);
  try {
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
    const first = fake.used()[0];
    first.answerTextOnly("สวัสดี");

    await until(() => fake.used().length === 2 && fake.used()[1].log.includes("end"), "sent again");
    const second = fake.used()[1];
    assert.deepEqual(second.log, first.log);
    // No new sentence is listened to while the answer is fetched again.
    speak(conversation, 3);
    await wait(30);
    assert.equal(fake.used().length, 2);

    second.answer("你好", "สวัสดี");
    await until(() => results.length === 1, "finished");
    assert.deepEqual(events, [
      "hearing",
      "not-hearing",
      "start:1",
      "text:สวัสดี",
      "retry:1",
      "heard:你好",
      "text:สวัสดี",
      "audio:0.1",
      "end:1"
    ]);
    assert.equal(results[0].noAudio, undefined);
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("words without a voice twice: the text is shown and marked as not read aloud", async () => {
  const fake = await startFakeGemini();
  const { conversation, results } = await started(fake);
  try {
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
    fake.used()[0].answerTextOnly("สวัสดี");
    await until(() => fake.used().length === 2 && fake.used()[1].log.includes("end"), "sent again");
    fake.used()[1].answerTextOnly("สวัสดีครับ");

    await until(() => results.length === 1, "finished");
    assert.equal(results[0].noAudio, true);
    // Exactly what Gemini sent, although the page also kept text on the turn.
    assert.equal(results[0].translatedText, "สวัสดีครับ");
    assert.equal(results[0].outputSeconds, 0);
    assert.ok(Math.abs(results[0].inputSeconds - 0.4) < 1e-9);
    assert.match(results[0].leaseId, /^ul_gemini-live-lease_/);
    await until(() => !conversation.isTranslating(), "listening again");
  } finally {
    conversation.stop();
    await fake.close();
  }
});

// Stands in for the page's wrong-language check: Latin letters are wrong here.
const latinIsWrong = (result) => /[a-z]/i.test(result.translatedText);

test("an answer the page rejects is asked for again with the same audio", async () => {
  const fake = await startFakeGemini();
  const { conversation, events, results } = await started(fake, { isWrongAnswer: latinIsWrong });
  try {
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
    const first = fake.used()[0];
    // Chinese in, German out, although the pair is Chinese and Thai.
    first.answer("你好", "Hallo");

    await until(() => fake.used().length === 2 && fake.used()[1].log.includes("end"), "sent again");
    const second = fake.used()[1];
    assert.deepEqual(second.log, first.log);
    assert.equal(results.length, 0);
    assert.equal(conversation.isTranslating(), true);
    // No new sentence is listened to while the answer is fetched again.
    speak(conversation, 3);
    await wait(30);
    assert.equal(fake.used().length, 2);

    second.answer("你好", "สวัสดี");
    await until(() => results.length === 1, "finished");
    assert.deepEqual(events, [
      "hearing",
      "not-hearing",
      "start:1",
      "heard:你好",
      "text:Hallo",
      "audio:0.1",
      "retry:1:rejected:Hallo",
      "heard:你好",
      "text:สวัสดี",
      "audio:0.1",
      "end:1"
    ]);
    assert.equal(results[0].translatedText, "สวัสดี");
    await until(() => !conversation.isTranslating(), "listening again");
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("a second rejected answer is reported as it is, not asked for a third time", async () => {
  const fake = await startFakeGemini();
  const { conversation, events, results } = await started(fake, { isWrongAnswer: latinIsWrong });
  try {
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
    fake.used()[0].answer("你好", "Hallo");
    await until(() => fake.used().length === 2 && fake.used()[1].log.includes("end"), "sent again");
    fake.used()[1].answer("你好", "Hello");

    await until(() => results.length === 1, "finished");
    assert.equal(results[0].translatedText, "Hello");
    await wait(40);
    assert.equal(fake.used().length, 2);
    assert.equal(events.filter((event) => event.startsWith("retry")).length, 1);
    await until(() => !conversation.isTranslating(), "listening again");
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("a rejected answer whose second try fails is reported as lost, and listening goes on", async () => {
  const fake = await startFakeGemini();
  const { conversation, events, results } = await started(fake, { isWrongAnswer: latinIsWrong });
  try {
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
    fake.used()[0].answer("你好", "Hallo");
    await until(() => fake.used().length === 2 && fake.used()[1].log.includes("end"), "sent again");
    fake.used()[1].terminate();

    await until(() => events.some((event) => event.startsWith("error:")), "reported");
    assert.equal(results.length, 0);
    assert.equal(fake.used().length, 2);
    await until(() => !conversation.isTranslating(), "listening again");
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 3, "next sentence is taken");
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("a check that throws lets the answer through", async () => {
  const fake = await startFakeGemini();
  const { conversation, results } = await started(fake, {
    isWrongAnswer: () => {
      throw new Error("broken check");
    }
  });
  try {
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
    fake.used()[0].answer("你好", "สวัสดี");
    await until(() => results.length === 1, "finished");
    assert.equal(results[0].translatedText, "สวัสดี");
    assert.equal(fake.used().length, 1);
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("Gemini finding nothing to translate shows nothing and listening goes on", async () => {
  const fake = await startFakeGemini();
  const { conversation, events } = await started(fake);
  try {
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
    fake.used()[0].answerNothing();
    await until(() => events.includes("empty:1"), "reported as empty");
    assert.equal(conversation.isTranslating(), false);
    assert.equal(fake.used().length, 1); // not asked again
    assert.equal(events.some((event) => event.startsWith("start:")), false);

    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 2, "next sentence is taken");
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("Gemini saying \"no speech\" without a voice is not asked again", async () => {
  const fake = await startFakeGemini();
  const { conversation, events } = await started(fake);
  try {
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
    // Voices from a television: it guesses at what it heard, then gives up.
    fake.used()[0].answerNoSpeech("da da", "<no speech detected>");
    await until(() => events.includes("empty:1"), "dropped as not speech");
    await wait(40);
    assert.equal(fake.used().length, 1); // no second call
    assert.equal(conversation.isTranslating(), false);
    assert.equal(events.some((event) => event.startsWith("retry:") || event.startsWith("error:")), false);

    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 2, "the next sentence is taken");
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("Gemini answering \"<no speech>\" is reported as not being speech; a voice without text is not", async () => {
  const fake = await startFakeGemini();
  const { conversation, events, results } = await started(fake);
  const answerWith = async (text) => {
    speak(conversation, 3);
    await pause(conversation);
    const index = results.length;
    await until(() => fake.used().length === index + 1 && fake.used()[index].log.includes("end"), "sent");
    const connection = fake.used()[index];
    connection.send({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: AUDIO_100MS } }] },
        ...(text ? { outputTranscription: { text } } : {})
      }
    });
    connection.send({ serverContent: { generationComplete: true } });
    connection.send({ serverContent: { turnComplete: true } });
    await until(() => results.length === index + 1, "finished");
    await until(() => !conversation.isTranslating(), "listening again");
    return results[index];
  };
  try {
    const noise = await answerWith("<no speech>{pause}");
    assert.equal(noise.noSpeech, true);
    assert.equal((await answerWith("<no speech detected>")).noSpeech, true);
    assert.equal(noise.translatedText, "");
    assert.equal(noise.outputSeconds, 0.1); // still settled: it was produced
    assert.equal(events.some((event) => event.startsWith("text:")), false);
    // Real words next to the marker: that is a translation.
    const words = await answerWith("<no speech> สวัสดี");
    assert.equal(words.noSpeech, false);
    assert.equal(words.translatedText, "สวัสดี");

    // A real translation whose text never arrived must not be thrown away.
    const voiceOnly = await answerWith("");
    assert.equal(voiceOnly.noSpeech, false);
    assert.equal(voiceOnly.translatedText, "");
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("a dropped connection is tried once more, then the sentence is reported as lost", async () => {
  const fake = await startFakeGemini();
  const { conversation, events } = await started(fake);
  try {
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
    fake.used()[0].terminate();
    await until(() => fake.used().length === 2 && fake.used()[1].log.includes("end"), "sent again");
    assert.deepEqual(fake.used()[1].log, fake.used()[0].log);
    fake.used()[1].terminate();

    await until(() => events.some((event) => event.startsWith("error:")), "reported");
    assert.deepEqual(events.slice(2), ["start:1", "error:Gemini connection closed"]);
    await until(() => !conversation.isTranslating(), "listening again");
    assert.equal(conversation.isRunning(), true);
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("\"Done speaking\" ends the sentence for good, even if it stays loud", async () => {
  const fake = await startFakeGemini();
  const { conversation, results } = await started(fake);
  try {
    assert.equal(conversation.endUtterance(), false); // nothing to end yet
    speak(conversation, 3);
    assert.equal(conversation.endUtterance(), true);
    assert.equal(conversation.isHearing(), false);
    assert.equal(conversation.isAwaitingAnswer(), true);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent at once");
    assert.deepEqual(fake.used()[0].log, ["start", "speech", "speech", "speech", "end"]);

    // The room is still loud. That must not take the sentence back.
    speak(conversation, 6);
    await wait(40);
    assert.equal(conversation.isHearing(), false);
    assert.equal(fake.used().length, 1);
    assert.equal(fake.used()[0].closed, false);

    fake.used()[0].answer("你好", "สวัสดี");
    await until(() => results.length === 1, "answered");
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("a place that never gets quiet: the sentence is sent at the length limit", async () => {
  const fake = await startFakeGemini();
  const { conversation, results } = await started(fake, { maxUtteranceSeconds: 0.6 });
  try {
    speak(conversation, 30);
    await until(() => fake.used().length >= 1 && fake.used()[0].log.includes("end"), "sent at the limit");
    await wait(40);
    // Sent once, at the limit. The noise that follows neither takes it back
    // nor starts sentence after sentence.
    assert.equal(fake.used().length, 1);
    assert.equal(fake.used()[0].closed, false);
    assert.equal(fake.connections.length, 3); // the two that waited + one replacement
    assert.deepEqual(fake.used()[0].log, [
      "start",
      "speech",
      "speech",
      "speech",
      "speech",
      "speech",
      "speech",
      "end"
    ]);
    fake.used()[0].answer("很吵", "เสียงดัง");
    await until(() => results.length === 1, "answered");
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("steady background noise stops counting as speech", async () => {
  const fake = await startFakeGemini();
  const { conversation, events } = await started(fake);
  const noise = (frames) => {
    for (let i = 0; i < frames; i += 1) conversation.pushAudio(QUIET, 100, 0.01);
  };
  try {
    // A fan is switched on. At first it stands out from the quiet room and is
    // taken for speech; within some seconds it has become the background.
    noise(160);
    await wait(70);
    noise(1);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "noise sent once");
    fake.used()[0].answerNothing();
    await until(() => events.includes("empty:1"), "nothing came of it");

    noise(100);
    await wait(70);
    noise(1);
    await wait(30);
    assert.equal(fake.used().length, 1);
    assert.equal(conversation.isHearing(), false);

    // Someone speaking over the fan is still heard.
    speak(conversation, 3);
    assert.equal(conversation.isHearing(), true);
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("pausing drops the sentence in progress and closes its session", async () => {
  const fake = await startFakeGemini();
  const { conversation } = await started(fake);
  try {
    speak(conversation, 3);
    await until(() => fake.used().length === 1, "being sent");
    conversation.setPaused(true);
    assert.equal(conversation.isHearing(), false);
    await until(() => fake.used()[0].closed, "session closed");
    speak(conversation, 3);
    await wait(30);
    assert.equal(fake.used().length, 1);

    conversation.setPaused(false);
    speak(conversation, 3);
    await until(() => fake.used().length === 2, "listening again");
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("stop closes every session and ignores later audio", async () => {
  const fake = await startFakeGemini();
  const { conversation } = await started(fake);
  try {
    conversation.stop();
    await until(() => fake.connections.every((connection) => connection.closed), "all closed");
    speak(conversation, 3);
    await wait(40);
    assert.equal(fake.connections.length, 2);
    assert.equal(fake.used().length, 0);
  } finally {
    await fake.close();
  }
});

test("backs off and then stops after repeated lease failures", async () => {
  const attempts = [];
  const events = [];
  const conversation = createConversation({
    WebSocketImpl: WebSocket,
    poolSize: 2,
    retryDelayMs: 15,
    maxConsecutiveFailures: 3,
    requestLease: async () => {
      attempts.push(Date.now());
      throw new Error("lease refused");
    },
    handlers: { onError: (error) => events.push(error.message) }
  });
  try {
    conversation.start();
    await until(() => events.length >= 1, "error reported");
    await wait(120);
    // Two sessions at start, one more pair after a pause, then it gives up:
    // never a tight loop of lease requests.
    assert.equal(attempts.length, 4);
    assert.ok(attempts[2] - attempts[1] >= 15);
    assert.deepEqual(events, ["lease refused"]);
    assert.equal(conversation.isRunning(), false);
  } finally {
    conversation.stop();
  }
});

// --- with a speech detector -------------------------------------------------------

test("with a speech detector, loud sound that is not speech is never sent", async () => {
  const fake = await startFakeGemini();
  const { conversation, events } = await started(fake);
  try {
    // As loud as someone speaking, but the detector says it is not speech.
    for (let i = 0; i < 30; i += 1) conversation.pushAudio(FRAME, 100, 0.2, 0.08);
    await wait(30);
    assert.equal(conversation.isHearing(), false);
    assert.equal(fake.used().length, 0);
    assert.deepEqual(events, []);
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("with a speech detector, quiet speech is heard and ends when the speaking stops, however loud the room", async () => {
  const fake = await startFakeGemini();
  const { conversation } = await started(fake);
  try {
    // Hardly louder than the room, but clearly speech.
    for (let i = 0; i < 3; i += 1) conversation.pushAudio(FRAME, 100, 0.001, 0.9);
    assert.equal(conversation.isHearing(), true);
    // Still speech while the likelihood stays above the lower mark.
    conversation.pushAudio(FRAME, 100, 0.001, 0.4);
    conversation.pushAudio(FRAME, 100, 0.001, 0.4);
    assert.equal(conversation.isHearing(), true);
    // The speaker stops; the room is loud. Loudness no longer counts.
    conversation.pushAudio(QUIET, 100, 0.3, 0.05);
    assert.equal(conversation.isHearing(), false);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
    assert.deepEqual(fake.used()[0].log, ["start", "speech", "speech", "speech", "speech", "speech", "room", "end"]);
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("a frame without a detector's verdict falls back to loudness", async () => {
  const fake = await startFakeGemini();
  const { conversation } = await started(fake);
  try {
    conversation.pushAudio(FRAME, 100, 0.2, undefined);
    conversation.pushAudio(FRAME, 100, 0.2, Number.NaN);
    conversation.pushAudio(FRAME, 100, 0.2);
    assert.equal(conversation.isHearing(), true);
  } finally {
    conversation.stop();
    await fake.close();
  }
});

// --- a real microphone ---------------------------------------------------------

// Loudness of every frame from a real laptop microphone through the browser
// (echo cancelling, noise suppression, automatic gain), while sentences were
// played in a room that was not quiet. Clean test audio hid the fact that a
// real room never goes silent after someone stops speaking.
test("real microphone: sentences end soon after the speaker stops", async () => {
  const recording = require("./fixtures/real-mic-levels.json");
  const sessions = [];
  const createSession = () => {
    const session = {
      handlers: {},
      begun: false,
      prepare: () => Promise.resolve(),
      begin() {
        this.begun = true;
      },
      pushAudio() {},
      // "Gemini" finds nothing to translate, so listening simply goes on.
      end() {
        const error = new Error("Gemini returned no translated audio.");
        error.code = "NO_AUDIO";
        error.usage = { inputSeconds: 0, outputSeconds: 0 };
        return Promise.reject(error);
      },
      cancel() {},
      isAvailable() {
        return !this.begun;
      },
      isReady: () => true,
      ageMs: () => 0
    };
    sessions.push(session);
    return session;
  };
  const conversation = createConversation({
    createSession,
    requestLease: async () => ({}),
    handlers: {}
  });
  conversation.start();
  try {
    const hearing = [];
    for (const level of recording.levels) {
      conversation.pushAudio("AAAA", recording.frameMs, level / 10000);
      await new Promise((resolve) => setImmediate(resolve));
      hearing.push(conversation.isHearing());
    }
    const sentences = [];
    let openedAt = -1;
    hearing.forEach((open, frame) => {
      if (open && openedAt < 0) openedAt = frame;
      if (!open && openedAt >= 0) {
        sentences.push({ from: openedAt, to: frame });
        openedAt = -1;
      }
    });
    const seconds = (frames) => (frames * recording.frameMs) / 1000;
    const containing = (frame) => sentences.find((s) => s.from <= frame && frame < s.to);

    // Nothing is left hanging when the recording ends in a quiet room.
    assert.equal(openedAt, -1, "a sentence was still open at the end");

    // The first played sentence (frames 150-215) and the last one (584-615,
    // English): each is heard, and each ends within 2 s of its last word.
    const first = containing(180);
    assert.ok(first, "the first sentence was not heard");
    assert.ok(first.from <= 160, "the first sentence was picked up late");
    assert.ok(first.to > 215, "the first sentence was cut before its last word");
    assert.ok(seconds(first.to - 215) <= 2, `the first sentence ended ${seconds(first.to - 215)} s late`);
    const last = containing(595);
    assert.ok(last, "the last sentence was not heard");
    assert.ok(last.to > 615, "the last sentence was cut before its last word");
    assert.ok(seconds(last.to - 615) <= 2, `the last sentence ended ${seconds(last.to - 615)} s late`);

    // The quiet stretches of the room are not taken for speech.
    for (const frame of [10, 70, 125, 140, 419, 500, 560, 660]) {
      assert.equal(hearing[frame], false, `frame ${frame} was taken for speech`);
    }

    // No sentence drags on, and the room's noises do not open session after session.
    for (const sentence of sentences) {
      assert.ok(seconds(sentence.to - sentence.from) <= 8, "a sentence lasted more than 8 s");
    }
    assert.ok(sentences.length <= 12, `${sentences.length} sentences in under a minute`);
    assert.equal(sessions.filter((session) => session.begun).length, sentences.length);
  } finally {
    conversation.stop();
  }
});

// --- server: the lease decides push-to-talk or hands-free ---------------------

test("hands-free leases are refused while Auto Detect is offline", async () => {
  const requests = [];
  const tokens = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      requests.push(JSON.parse(raw));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ name: "auth_tokens/abc" }));
    });
  });
  await new Promise((resolve) => tokens.listen(0, "127.0.0.1", resolve));
  const api = http.createServer(app);
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  process.env.GEMINI_ENGINE_ALLOWED_EMAILS = "*";
  process.env.GEMINI_AUTH_TOKENS_URL = `http://127.0.0.1:${tokens.address().port}/v1beta/auth_tokens`;
  try {
    const post = async (body) => {
      const response = await fetch(`http://127.0.0.1:${api.address().port}/api/gemini-live/lease`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languageA: "Chinese", languageB: "Thai", ...body })
      });
      return { status: response.status, body: await response.json() };
    };
    const pushToTalk = await post({});
    const handsFree = await post({ mode: "handsfree" });
    const unknown = await post({ mode: "something-else" });

    assert.equal(pushToTalk.body.mode, "push-to-talk");
    // The page falls back to Push to Talk on 404 / GEMINI_DIRECT_UNAVAILABLE.
    assert.equal(handsFree.status, 404);
    assert.equal(handsFree.body.code, "GEMINI_DIRECT_UNAVAILABLE");
    assert.equal(unknown.body.mode, "push-to-talk");
    // No Gemini token is minted for the refused hands-free request.
    assert.deepEqual(
      requests.map((request) => request.bidiGenerateContentSetup.realtimeInputConfig),
      [
        { automaticActivityDetection: { disabled: true } },
        { automaticActivityDetection: { disabled: true } }
      ]
    );
  } finally {
    process.env.GEMINI_ENGINE_ALLOWED_EMAILS = "";
    process.env.GEMINI_AUTH_TOKENS_URL = "";
    await new Promise((resolve) => api.close(resolve));
    await new Promise((resolve) => tokens.close(resolve));
  }
});

// Stands in for the page's check on an answer that is still arriving.
const sameAsHeard = ({ sourceText, translatedText }) =>
  Boolean(sourceText) && translatedText.length >= 2 && sourceText.startsWith(translatedText);

test("an answer seen to be wrong while it arrives is stopped and asked for again at once", async () => {
  const fake = await startFakeGemini();
  const { conversation, events, results } = await started(fake, {
    isWrongAnswer: () => false,
    isWrongSoFar: sameAsHeard
  });
  try {
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
    const first = fake.used()[0];
    // The sentence is being said back; Gemini has not finished it.
    first.send({ serverContent: { inputTranscription: { text: "你好吗" } } });
    first.send({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: AUDIO_100MS } }] },
        outputTranscription: { text: "你好" }
      }
    });

    await until(() => fake.used().length === 2 && fake.used()[1].log.includes("end"), "sent again");
    assert.equal(results.length, 0);
    // The words that gave it away were never shown.
    assert.equal(events.includes("text:你好"), false);
    const second = fake.used()[1];
    assert.deepEqual(second.log, first.log);
    // The second answer is not stopped, whatever it is.
    second.answer("你好吗", "你好");
    await until(() => results.length === 1, "finished");
    assert.equal(fake.used().length, 2);
    assert.equal(results[0].translatedText, "你好");
    assert.equal(events.filter((event) => event.startsWith("retry")).length, 1);
    assert.equal(events.includes("retry:1:rejected:你好"), true);
  } finally {
    conversation.stop();
    await fake.close();
  }
});

test("a broken check on an arriving answer lets it through", async () => {
  const fake = await startFakeGemini();
  const { conversation, results } = await started(fake, {
    isWrongSoFar: () => {
      throw new Error("broken check");
    }
  });
  try {
    speak(conversation, 3);
    await pause(conversation);
    await until(() => fake.used().length === 1 && fake.used()[0].log.includes("end"), "sent");
    fake.used()[0].answer("你好", "สวัสดี");
    await until(() => results.length === 1, "finished");
    assert.equal(results[0].translatedText, "สวัสดี");
    assert.equal(fake.used().length, 1);
  } finally {
    conversation.stop();
    await fake.close();
  }
});
