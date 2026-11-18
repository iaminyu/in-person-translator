const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  createDetector,
  createResampler,
  DEFAULT_ASSETS
} = require("../public/voice-translator/speech-detector.js");

const sha256 = (bytes) => createHash("sha256").update(Buffer.from(bytes)).digest("hex");

// Stand-in for ONNX Runtime: "speech" is any window whose samples are large.
function fakeRuntime(log = []) {
  class Tensor {
    constructor(type, data, dims) {
      this.type = type;
      this.data = data;
      this.dims = dims;
    }
  }
  return {
    log,
    Tensor,
    env: { wasm: {} },
    InferenceSession: {
      create: async (modelBytes, sessionOptions) => {
        log.push({ created: modelBytes.length, providers: sessionOptions.executionProviders });
        let calls = 0;
        return {
          run: async ({ input, state, sr }) => {
            calls += 1;
            const window = input.data.subarray(64);
            let sum = 0;
            for (const sample of window) sum += Math.abs(sample);
            log.push({
              call: calls,
              inputLength: input.data.length,
              contextFirst: input.data[0],
              stateMarker: state.data[0],
              rate: Number(sr.data[0])
            });
            const nextState = new Tensor("float32", new Float32Array(2 * 128).fill(calls), [2, 1, 128]);
            return { output: { data: [sum / window.length > 0.1 ? 0.9 : 0.02] }, stateN: nextState };
          }
        };
      }
    }
  };
}

const ENGINE = new Uint8Array([1, 2, 3, 4]);
const MODEL = new Uint8Array([9, 8, 7]);
const assets = (overrides = {}) => ({
  runtimeScript: "/runtime.js",
  runtimePath: "/runtime/",
  model: { urls: ["/model.onnx"], sha256: sha256(MODEL) },
  engine: { urls: ["https://cdn-one.example/engine.wasm", "https://cdn-two.example/engine.wasm"], sha256: sha256(ENGINE) },
  ...overrides
});
const fetchFrom = (files, requested = []) => async (url) => {
  requested.push(url);
  const bytes = files[url];
  if (!bytes) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
const constant = (length, value) => new Float32Array(length).fill(value);

test("the files this site serves are the ones whose checksums are pinned", () => {
  const publicDir = path.join(__dirname, "..", "public");
  const modelPath = path.join(publicDir, DEFAULT_ASSETS.model.urls[0]);
  assert.equal(sha256(readFileSync(modelPath)), DEFAULT_ASSETS.model.sha256);
  assert.equal(existsSync(path.join(publicDir, DEFAULT_ASSETS.runtimeScript)), true);
  // The runtime script imports this loader from the same folder.
  assert.equal(existsSync(path.join(publicDir, DEFAULT_ASSETS.runtimePath, "ort-wasm-simd-threaded.mjs")), true);
  // The engine comes from package CDNs, pinned to one version and one checksum.
  for (const url of DEFAULT_ASSETS.engine.urls) {
    assert.match(url, /^https:\/\/(cdn\.jsdelivr\.net\/npm|unpkg\.com)\/onnxruntime-web@1\.19\.2\/dist\/ort-wasm-simd-threaded\.wasm$/);
  }
  assert.match(DEFAULT_ASSETS.engine.sha256, /^[0-9a-f]{64}$/);
});

test("loads the engine and the model, checks them, and starts single-threaded", async () => {
  const runtime = fakeRuntime();
  const requested = [];
  const detector = createDetector({
    assets: assets(),
    loadRuntime: async () => runtime,
    fetchImpl: fetchFrom({ "https://cdn-one.example/engine.wasm": ENGINE, "/model.onnx": MODEL }, requested)
  });
  assert.equal(detector.isReady(), false);
  assert.equal(await detector.process(constant(4096, 0.5), 48000), null); // not ready: no verdict
  await detector.load();
  assert.equal(detector.isReady(), true);
  assert.deepEqual(requested.sort(), ["/model.onnx", "https://cdn-one.example/engine.wasm"]);
  assert.equal(runtime.env.wasm.numThreads, 1);
  assert.equal(runtime.env.wasm.wasmPaths, "/runtime/");
  assert.deepEqual(new Uint8Array(runtime.env.wasm.wasmBinary), ENGINE);
  assert.deepEqual(runtime.log[0], { created: MODEL.length, providers: ["wasm"] });
});

test("an engine with the wrong checksum is not used; the next address is tried", async () => {
  const runtime = fakeRuntime();
  const requested = [];
  const detector = createDetector({
    assets: assets(),
    loadRuntime: async () => runtime,
    fetchImpl: fetchFrom(
      {
        "https://cdn-one.example/engine.wasm": new Uint8Array([6, 6, 6]), // tampered
        "https://cdn-two.example/engine.wasm": ENGINE,
        "/model.onnx": MODEL
      },
      requested
    )
  });
  await detector.load();
  assert.equal(detector.isReady(), true);
  assert.deepEqual(new Uint8Array(runtime.env.wasm.wasmBinary), ENGINE);
  assert.ok(requested.includes("https://cdn-two.example/engine.wasm"));
});

test("an address that stalls gives way to the next one", async () => {
  const runtime = fakeRuntime();
  const good = fetchFrom({ "https://cdn-two.example/engine.wasm": ENGINE, "/model.onnx": MODEL });
  let aborted = false;
  const detector = createDetector({
    assets: assets(),
    loadRuntime: async () => runtime,
    fetchTimeoutMs: 40,
    fetchImpl: (url, init) => {
      if (url !== "https://cdn-one.example/engine.wasm") return good(url);
      // Accepts the request and never answers.
      init.signal.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise(() => {});
    }
  });
  await detector.load();
  assert.equal(detector.isReady(), true);
  assert.equal(aborted, true);
  assert.deepEqual(new Uint8Array(runtime.env.wasm.wasmBinary), ENGINE);
});

test("when no address delivers the right bytes the detector stays off, and can be tried again", async () => {
  const runtime = fakeRuntime();
  const files = { "https://cdn-one.example/engine.wasm": new Uint8Array([6]), "/model.onnx": MODEL };
  const detector = createDetector({ assets: assets(), loadRuntime: async () => runtime, fetchImpl: fetchFrom(files) });
  await assert.rejects(detector.load());
  assert.equal(detector.isReady(), false);
  assert.equal(runtime.env.wasm.wasmBinary, undefined);
  assert.equal(await detector.process(constant(4096, 0.5), 48000), null);

  files["https://cdn-two.example/engine.wasm"] = ENGINE;
  await detector.load();
  assert.equal(detector.isReady(), true);
});

test("audio is brought to 16 kHz and judged in 32 ms windows, each with the 4 ms before it", async () => {
  const runtime = fakeRuntime();
  const detector = createDetector({
    assets: assets(),
    loadRuntime: async () => runtime,
    fetchImpl: fetchFrom({ "https://cdn-one.example/engine.wasm": ENGINE, "/model.onnx": MODEL })
  });
  await detector.load();
  runtime.log.length = 0;

  // 4096 samples at 48 kHz are 1365 at 16 kHz: two whole windows, 341 left.
  assert.equal(await detector.process(constant(4096, 0.5), 48000), 0.9);
  assert.equal(runtime.log.length, 2);
  assert.deepEqual(
    runtime.log.map((entry) => [entry.inputLength, entry.rate]),
    [
      [576, 16000],
      [576, 16000]
    ]
  );
  assert.equal(runtime.log[0].contextFirst, 0); // nothing came before
  assert.equal(runtime.log[1].contextFirst, 0.5); // the end of the first window
  assert.equal(runtime.log[0].stateMarker, 0);
  assert.equal(runtime.log[1].stateMarker, 1); // the model's memory is carried along

  // The 341 left over join the next chunk: 341 + 1365 = 1706, three windows.
  assert.equal(await detector.process(constant(4096, 0), 48000), 0.9); // the first of them is still the loud part
  assert.equal(runtime.log.length, 5);
  assert.equal(await detector.process(constant(4096, 0), 48000), 0.02);
});

test("verdicts come back in the order the audio went in", async () => {
  const runtime = fakeRuntime();
  const detector = createDetector({
    assets: assets(),
    loadRuntime: async () => runtime,
    fetchImpl: fetchFrom({ "https://cdn-one.example/engine.wasm": ENGINE, "/model.onnx": MODEL })
  });
  await detector.load();
  const order = [];
  const chunks = [0.5, 0, 0, 0.5, 0];
  await Promise.all(
    chunks.map((value, index) =>
      detector.process(constant(4800, value), 16000).then((probability) => order.push([index, probability]))
    )
  );
  assert.deepEqual(order.map(([index]) => index), [0, 1, 2, 3, 4]);
  // 4800 samples at 16 kHz: nine windows each, the rest carried over.
  assert.deepEqual(order.map(([, probability]) => probability), [0.9, 0.9, 0.02, 0.9, 0.9]);
});

test("a model that breaks is switched off instead of failing every frame", async () => {
  const runtime = fakeRuntime();
  const create = runtime.InferenceSession.create;
  runtime.InferenceSession.create = async (...args) => {
    const session = await create(...args);
    return {
      run: async () => {
        throw new Error("out of memory");
      }
    };
  };
  const detector = createDetector({
    assets: assets(),
    loadRuntime: async () => runtime,
    fetchImpl: fetchFrom({ "https://cdn-one.example/engine.wasm": ENGINE, "/model.onnx": MODEL })
  });
  await detector.load();
  assert.equal(await detector.process(constant(4096, 0.5), 48000), null);
  assert.equal(detector.isReady(), false);
  assert.equal(await detector.process(constant(4096, 0.5), 48000), null);
});

test("resampling keeps its place between chunks", () => {
  const ramp = Float32Array.from({ length: 4410 }, (_, index) => index / 4410);
  const whole = createResampler(44100)(ramp);
  const inParts = createResampler(44100);
  const parts = [inParts(ramp.subarray(0, 1000)), inParts(ramp.subarray(1000, 2500)), inParts(ramp.subarray(2500))];
  const joined = Float32Array.from(parts.flatMap((part) => Array.from(part)));
  assert.equal(whole.length, 1600);
  assert.equal(joined.length, whole.length);
  // The same signal either way (rounding may pick a neighbouring sample at a join).
  for (let i = 0; i < whole.length; i += 1) {
    assert.ok(Math.abs(joined[i] - whole[i]) < 0.001, `sample ${i} differs`);
  }
  // 48 kHz to 16 kHz is the mean of every three samples.
  assert.deepEqual(Array.from(createResampler(48000)(Float32Array.from([3, 6, 9, 0, 0, 3]))), [6, 1]);
  // Already at 16 kHz: passed through.
  const same = Float32Array.from([1, 2, 3]);
  assert.equal(createResampler(16000)(same), same);
});
