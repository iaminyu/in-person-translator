const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.VERCEL = "1";
process.env.OPENAI_REALTIME_MODEL = "gpt-realtime-2.1";
process.env.OPENAI_REALTIME_REASONING_EFFORT = "low";

const app = require("../server");
const realtime = app.__test?.realtime;

test("Realtime 2 uses GA variants only", () => {
  assert.ok(realtime);

  const variants = realtime.getRealtimeConfigVariants({ includeText: true });

  assert.deepEqual(variants, [
    { schema: "ga", includeReasoning: true },
    { schema: "ga", includeReasoning: false }
  ]);
  assert.equal(variants.some((variant) => variant.useBetaHeader), false);
  assert.equal(variants.some((variant) => "modalitiesKey" in variant), false);
  assert.equal(variants.some((variant) => "outputModalities" in variant), false);
});

test("Reasoning config applies to the whole gpt-realtime-2 family only", () => {
  for (const model of [
    "gpt-realtime-2",
    "gpt-realtime-2.1",
    "gpt-realtime-2.1-mini",
    "GPT-Realtime-2.1",
    "gpt-realtime-2-2026-05-07"
  ]) {
    assert.equal(realtime.isRealtime2Model(model), true, model);
  }
  for (const model of [
    "gpt-realtime",
    "gpt-realtime-1.5",
    "gpt-realtime-mini",
    "gpt-realtime-translate",
    "gpt-realtime-20",
    ""
  ]) {
    assert.equal(realtime.isRealtime2Model(model), false, model);
  }
});

test("Realtime headers never opt into removed beta API", () => {
  const headers = realtime.buildRealtimeHeaders("sk-test");

  assert.deepEqual(headers, {
    Authorization: "Bearer sk-test"
  });
  assert.equal("OpenAI-Beta" in headers, false);
});

test("Realtime 2 session payload matches GA audio schema", () => {
  const [withReasoning, withoutReasoning] = realtime.getRealtimeConfigVariants({
    includeText: true
  });
  const session = realtime.buildRealtimeSessionConfig({
    languageA: "English",
    languageB: "Chinese",
    voice: "marin",
    configVariant: withReasoning
  });

  assert.equal(session.type, "realtime");
  assert.equal(session.instructions.includes("English and Chinese"), true);
  assert.deepEqual(session.output_modalities, ["audio"]);
  assert.deepEqual(session.audio, {
    input: {
      format: { type: "audio/pcm", rate: 24000 },
      turn_detection: null
    },
    output: {
      format: { type: "audio/pcm", rate: 24000 },
      voice: "marin"
    }
  });
  assert.deepEqual(session.reasoning, { effort: "low" });
  assert.equal("modalities" in session, false);
  assert.equal("input_audio_format" in session, false);
  assert.equal("output_audio_format" in session, false);

  const fallbackSession = realtime.buildRealtimeSessionConfig({
    languageA: "English",
    languageB: "Chinese",
    voice: "marin",
    configVariant: withoutReasoning
  });
  assert.equal("reasoning" in fallbackSession, false);
});

test("Realtime 2 response payload stays audio-only and session-scoped", () => {
  const [variant] = realtime.getRealtimeConfigVariants({ includeText: true });
  const response = realtime.buildRealtimeResponseConfig({
    languageA: "English",
    languageB: "Chinese",
    configVariant: variant
  });

  assert.equal(response.instructions.includes("English and Chinese"), true);
  assert.deepEqual(response.output_modalities, ["audio"]);
  assert.equal("modalities" in response, false);
  assert.equal("audio" in response, false);
  assert.equal("reasoning" in response, false);
});

test("Server code does not contain removed Realtime beta API opt-in", () => {
  const source = readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

  assert.equal(source.includes("OpenAI-Beta"), false);
  assert.equal(source.includes("realtime=v1"), false);
});
