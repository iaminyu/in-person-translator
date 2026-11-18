// Tells speech from other sound, in the browser.
//
// Loudness alone cannot do that: a busy room, music or a keyboard is as loud
// as a person speaking, and hands-free translation then sends noise off as
// sentences. This runs a small speech-detection model (Silero VAD v5, MIT
// licence) on the microphone signal and reports, for every piece of audio,
// how likely it is that someone is speaking in it. Nothing leaves the device.
//
// The model runs on ONNX Runtime Web 1.19.2 (Microsoft, MIT licence). Its two
// small script files and the model are served by this site (public/vendor/).
// The 11 MB WebAssembly engine is too large for this site's hosting to serve
// in one response, so it is fetched from a public package CDN and only used
// if its SHA-256 checksum is the expected one.
//
// No DOM dependencies beyond loading the runtime script; under Node the
// runtime is injected for tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
  } else {
    root.LiveTalkSpeechDetector = factory(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  const MODEL_RATE = 16000;
  // The model looks at 32 ms at a time, with the 4 ms before it for context.
  const WINDOW_SAMPLES = 512;
  const CONTEXT_SAMPLES = 64;

  const DEFAULT_ASSETS = {
    runtimeScript: "/vendor/onnxruntime-web-1.19.2/ort.wasm.min.js",
    runtimePath: "/vendor/onnxruntime-web-1.19.2/",
    model: {
      urls: ["/vendor/silero-vad/silero_vad_v5.onnx"],
      sha256: "2623a2953f6ff3d2c1e61740c6cdb7168133479b267dfef114a4a3cc5bdd788f"
    },
    engine: {
      urls: [
        "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort-wasm-simd-threaded.wasm",
        "https://unpkg.com/onnxruntime-web@1.19.2/dist/ort-wasm-simd-threaded.wasm"
      ],
      sha256: "1bf0b9ed7ad025cf9ca88ce6da29e54df3f128a169f8241d71823e81f078d578"
    }
  };

  async function sha256Hex(buffer) {
    const subtle = root.crypto && root.crypto.subtle;
    if (!subtle) throw new Error("Checksums are not available in this browser.");
    const digest = new Uint8Array(await subtle.digest("SHA-256", buffer));
    let hex = "";
    for (let i = 0; i < digest.length; i += 1) hex += digest[i].toString(16).padStart(2, "0");
    return hex;
  }

  // Fetches a file from the first address that delivers exactly the expected
  // bytes. A wrong checksum is treated like a failed download, and so is an
  // address that accepts the connection and then stalls: without the time
  // limit the next address would never be tried.
  async function fetchVerified(file, fetchImpl, timeoutMs) {
    let lastError = new Error("No address to fetch from.");
    for (let i = 0; i < file.urls.length; i += 1) {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      let timedOut = null;
      const timer = setTimeout(function () {
        if (controller) controller.abort();
        if (timedOut) timedOut(new Error("Download timed out."));
      }, timeoutMs);
      try {
        const download = (async function () {
          const response = await fetchImpl(file.urls[i], controller ? { signal: controller.signal } : undefined);
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.arrayBuffer();
        })();
        const buffer = await Promise.race([
          download,
          new Promise(function (resolve, reject) {
            timedOut = reject;
          })
        ]);
        if ((await sha256Hex(buffer)) !== file.sha256) throw new Error("Checksum mismatch.");
        return buffer;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }

  function loadRuntimeScript(src) {
    if (root.ort && root.ort.InferenceSession) return Promise.resolve(root.ort);
    return new Promise(function (resolve, reject) {
      const script = root.document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = function () {
        if (root.ort && root.ort.InferenceSession) resolve(root.ort);
        else reject(new Error("The speech detection runtime did not load."));
      };
      script.onerror = function () {
        reject(new Error("The speech detection runtime failed to load."));
      };
      root.document.head.appendChild(script);
    });
  }

  // Brings microphone audio (usually 48 kHz) down to the model's 16 kHz by
  // averaging. Keeps its place between calls, so chunks join up seamlessly.
  function createResampler(fromRate) {
    const ratio = fromRate / MODEL_RATE;
    let carry = new Float32Array(0);
    let offset = 0;
    return function resample(input) {
      if (ratio === 1) return input;
      const data = new Float32Array(carry.length + input.length);
      data.set(carry, 0);
      data.set(input, carry.length);
      const out = [];
      let start = offset;
      while (start + ratio <= data.length) {
        const from = Math.floor(start);
        const to = Math.max(from + 1, Math.floor(start + ratio));
        let sum = 0;
        for (let i = from; i < to; i += 1) sum += data[i];
        out.push(sum / (to - from));
        start += ratio;
      }
      const keepFrom = Math.floor(start);
      carry = data.slice(keepFrom);
      offset = start - keepFrom;
      return Float32Array.from(out);
    };
  }

  function createDetector(options) {
    options = options || {};
    const assets = options.assets || DEFAULT_ASSETS;
    const fetchImpl = options.fetchImpl || (root.fetch ? root.fetch.bind(root) : null);
    // Long enough for 11 MB on a slow phone connection, short enough that a
    // stalled address gives way to the next one.
    const fetchTimeoutMs = options.fetchTimeoutMs || 45000;

    let runtime = null;
    let session = null;
    let loadPromise = null;
    let state = null;
    let rateTensor = null;
    let context = new Float32Array(CONTEXT_SAMPLES);
    let waiting = new Float32Array(0); // 16 kHz samples not yet a full window
    let resample = null;
    let resampleRate = 0;
    let lastProbability = null;
    let queue = Promise.resolve();

    function reset() {
      if (runtime) {
        state = new runtime.Tensor("float32", new Float32Array(2 * 128), [2, 1, 128]);
      }
      context = new Float32Array(CONTEXT_SAMPLES);
      waiting = new Float32Array(0);
      resample = null;
      resampleRate = 0;
      lastProbability = null;
    }

    // Downloads and starts the model. Safe to call more than once; a failed
    // attempt can be tried again later.
    function load() {
      if (!loadPromise) {
        loadPromise = (async function () {
          if (!fetchImpl) throw new Error("fetch is not available.");
          const ort = await (options.loadRuntime
            ? options.loadRuntime()
            : loadRuntimeScript(assets.runtimeScript));
          const files = await Promise.all([
            fetchVerified(assets.engine, fetchImpl, fetchTimeoutMs),
            fetchVerified(assets.model, fetchImpl, fetchTimeoutMs)
          ]);
          // One thread: more would need cross-origin isolation headers, and
          // the model takes well under a millisecond per window as it is.
          ort.env.wasm.numThreads = 1;
          ort.env.wasm.wasmPaths = assets.runtimePath;
          ort.env.wasm.wasmBinary = files[0];
          const created = await ort.InferenceSession.create(new Uint8Array(files[1]), {
            executionProviders: ["wasm"]
          });
          runtime = ort;
          rateTensor = new ort.Tensor("int64", BigInt64Array.from([BigInt(MODEL_RATE)]), []);
          reset();
          session = created;
        })().catch(function (error) {
          loadPromise = null;
          throw error;
        });
      }
      return loadPromise;
    }

    async function run(samples, sampleRate) {
      if (!session) return null;
      if (!resample || resampleRate !== sampleRate) {
        resample = createResampler(sampleRate);
        resampleRate = sampleRate;
      }
      const fresh = resample(samples);
      const joined = new Float32Array(waiting.length + fresh.length);
      joined.set(waiting, 0);
      joined.set(fresh, waiting.length);

      let best = null;
      let position = 0;
      while (position + WINDOW_SAMPLES <= joined.length) {
        const windowSamples = joined.subarray(position, position + WINDOW_SAMPLES);
        const input = new Float32Array(CONTEXT_SAMPLES + WINDOW_SAMPLES);
        input.set(context, 0);
        input.set(windowSamples, CONTEXT_SAMPLES);
        const output = await session.run({
          input: new runtime.Tensor("float32", input, [1, input.length]),
          state: state,
          sr: rateTensor
        });
        state = output.stateN;
        context = windowSamples.slice(WINDOW_SAMPLES - CONTEXT_SAMPLES);
        const probability = Number(output.output.data[0]);
        if (best === null || probability > best) best = probability;
        position += WINDOW_SAMPLES;
      }
      waiting = joined.slice(position);
      if (best !== null) lastProbability = best;
      return lastProbability;
    }

    // One chunk of microphone audio (mono floats) in, the likelihood (0..1)
    // that someone is speaking in it out: the highest of the windows it
    // completed. null until the model is ready, or if it stops working.
    // Calls are answered in the order they were made.
    function process(samples, sampleRate) {
      const result = queue.then(function () {
        return run(samples, sampleRate);
      });
      queue = result.catch(function () {
        // A model that fails once is not asked again; loudness takes over.
        session = null;
        return null;
      });
      return queue;
    }

    return {
      load: load,
      process: process,
      reset: reset,
      isReady: function () {
        return Boolean(session);
      }
    };
  }

  return {
    createDetector: createDetector,
    createResampler: createResampler,
    DEFAULT_ASSETS: DEFAULT_ASSETS
  };
});
