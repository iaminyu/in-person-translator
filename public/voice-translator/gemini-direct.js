// Direct Gemini Live translation session for push-to-talk turns.
//
// The server hands out a short-lived, single-use token whose session setup
// (model and translation instructions) is fixed on the server. With it the
// browser connects to Gemini itself and sends microphone audio while the
// person is still speaking, so nothing has to be uploaded after they let go.
//
// This file has no DOM dependencies: voice-page.js feeds it audio frames and
// renders what it reports. It also runs under Node for tests and evaluation.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LiveTalkGeminiDirect = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // If the connection is still not ready this long after the speaker let go,
  // the server path is the faster way to finish the turn.
  const READY_AFTER_RELEASE_TIMEOUT_MS = 2500;
  // How long a typed sentence waits for its connection, which starts with it.
  const TYPED_READY_TIMEOUT_MS = 8000;
  // From the end of the speaker's turn to the first translated sound. In 439
  // evaluation turns (2026-11-15/16) it was under 1.3 s nine times in ten,
  // over 2.5 s once and never over 2.9 s. Past this, Gemini is unlikely to
  // answer: giving up lets the page turn to its second connection, which
  // has heard the same press and answers in about a second, instead of
  // leaving the speaker waiting. Cutting off the rare slow answer costs
  // about that second.
  const FIRST_AUDIO_TIMEOUT_MS = 2500;
  // A typed sentence has no second connection to turn to, so cutting its
  // wait short gains nothing.
  const TYPED_FIRST_AUDIO_TIMEOUT_MS = 8000;
  // The longest a turn may take to leave the browser (see startFirstAudioTimer).
  const UPLOAD_MAX_MS = 8000;
  // The transcript of the translation can trail the audio by a moment. Wait
  // briefly for it once the audio is complete, so the text is not cut short.
  const TRAILING_TEXT_GRACE_MS = 350;
  const TRAILING_TEXT_MAX_MS = 1200;
  // A transcript that has not arrived at all, or visibly stops halfway (see
  // transcriptLooksUnfinished), gets longer: the rest may still arrive before
  // Gemini closes the turn.
  const UNFINISHED_TEXT_MAX_MS = 3000;
  // Gemini's transcript of what the speaker said is sent apart from its
  // answer, with no set order, and now and then comes after the answer is
  // over (or never). Without it the card shows the translation alone, so the
  // turn waits this long past the audio for it. If it still does not come,
  // the page has the recording written down instead.
  const HEARD_TEXT_MAX_MS = 1000;
  const TURN_TIMEOUT_MS = 45000;
  // Gemini closes a session after about two minutes without client activity.
  const KEEP_ALIVE_INTERVAL_MS = 45000;
  const OUTPUT_BYTES_PER_SECOND = 24000 * 2;
  const MAX_QUEUED_AUDIO_SECONDS = 65;

  let silentChunkBase64 = "";
  function getSilentChunkBase64() {
    if (!silentChunkBase64) {
      // 100 ms of 24 kHz PCM16 silence = 4800 zero bytes = 6400 base64 "A"s.
      silentChunkBase64 = new Array(6401).join("A");
    }
    return silentChunkBase64;
  }

  function base64ByteLength(base64) {
    const length = base64.length;
    if (!length) return 0;
    let padding = 0;
    if (base64.charCodeAt(length - 1) === 61) padding += 1;
    if (base64.charCodeAt(length - 2) === 61) padding += 1;
    return Math.floor((length * 3) / 4) - padding;
  }

  function decodeMessageData(data) {
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
    if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
    return "";
  }

  function audioMessage(base64, sampleRate) {
    return JSON.stringify({
      realtimeInput: {
        audio: { data: base64, mimeType: "audio/pcm;rate=" + sampleRate }
      }
    });
  }

  // Now and then Gemini's transcript of its own speech carries markers that
  // were never spoken: "<no speech>", "{pause}", "<partial>", "[th]", "🧠",
  // "✨". They are removed before the text is shown. (The same rules live in
  // server.js; keep the two in step.)
  const TRANSCRIPT_MARKER =
    "<[a-z][a-z _-]{0,30}>|\\{[a-z][a-z _-]{0,30}\\}|\\[[a-z]{2,3}\\]|\\u{1F9E0}|\\u2728";
  const TRANSCRIPT_MARKERS = new RegExp(TRANSCRIPT_MARKER, "giu");
  const TRAILING_MARKERS = new RegExp("(?:\\s*(?:" + TRANSCRIPT_MARKER + "))+\\s*$", "iu");
  // A marker that has only half arrived, at the end of the text so far.
  const UNCLOSED_MARKER = /[<{[](?:[a-z][a-z _-]{0,30})?$/i;

  function cleanTranscript(raw) {
    return String(raw || "")
      .replace(TRANSCRIPT_MARKERS, "")
      .replace(/ {2,}/g, " ")
      .trim();
  }

  // True while the transcript says of itself that more should follow: it ends
  // in "<partial>", stops inside a marker, or holds nothing but markers.
  function transcriptLooksUnfinished(raw) {
    const text = String(raw || "");
    if (!text.trim()) return false;
    if (UNCLOSED_MARKER.test(text)) return true;
    if (!cleanTranscript(text)) return true;
    const tail = text.match(TRAILING_MARKERS);
    return Boolean(tail && /<\s*partial/i.test(tail[0]));
  }

  // Gemini's whole answer was a marker saying it heard no speech
  // ("<no speech>", "<no speech detected>"): a noise, not words.
  function saysNoSpeech(raw) {
    const text = String(raw || "");
    return /<\s*no[ _-]?speech[^<>]*>/i.test(text) && !cleanTranscript(text);
  }

  // Now and then Gemini stops speaking after a second or less although its
  // text holds the whole sentence. Measured on 220 real turns (2026-11-16):
  // Thai is spoken at 8-16 letters a second and Chinese at 3-6 characters a
  // second, while the turns that stopped early came out at 28-140 and 25.
  // Nobody speaks faster than the rates below, so audio shorter than they
  // allow for its text was cut short. Scripts that were not measured get a
  // wider margin: reading a sentence out twice by mistake is worse than
  // missing one that stopped halfway. (The same rule lives in server.js; keep
  // the two in step.)
  const FASTEST_SPEECH_PER_SECOND = { han: 9, kana: 14, hangul: 11, thai: 22, other: 30 };
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
      if (NOT_SPOKEN_CHARACTER.test(character)) continue;
      if (HAN_CHARACTER.test(character)) seconds += 1 / FASTEST_SPEECH_PER_SECOND.han;
      else if (THAI_CHARACTER.test(character)) seconds += 1 / FASTEST_SPEECH_PER_SECOND.thai;
      else if (KANA_CHARACTER.test(character)) seconds += 1 / FASTEST_SPEECH_PER_SECOND.kana;
      else if (HANGUL_CHARACTER.test(character)) seconds += 1 / FASTEST_SPEECH_PER_SECOND.hangul;
      else seconds += 1 / FASTEST_SPEECH_PER_SECOND.other;
    }
    return seconds;
  }

  // True when the translated speech is too short to hold the whole text.
  // Speech that never started is a different failure and is not counted here.
  function audioTooShortForText(text, audioSeconds) {
    const seconds = Number(audioSeconds) || 0;
    return seconds > 0 && seconds < shortestSpeechSeconds(text);
  }

  // An error with a short `reason` the page records with the turn, so slow
  // and failed turns can be counted by cause.
  function reasonError(reason, message) {
    const error = new Error(message);
    error.reason = reason;
    return error;
  }

  // The turn ended, or the wait ran out, without any translated speech.
  function noAudioError(reason, message) {
    const error = reasonError(reason, message);
    error.code = "NO_AUDIO";
    return error;
  }

  function createSession(options) {
    const requestLease = options.requestLease;
    const WebSocketImpl = options.WebSocketImpl || (typeof WebSocket !== "undefined" ? WebSocket : null);
    const firstAudioTimeoutMs = options.firstAudioTimeoutMs || FIRST_AUDIO_TIMEOUT_MS;
    const typedFirstAudioTimeoutMs = options.firstAudioTimeoutMs || TYPED_FIRST_AUDIO_TIMEOUT_MS;
    const turnTimeoutMs = options.turnTimeoutMs || TURN_TIMEOUT_MS;
    const readyAfterReleaseTimeoutMs =
      options.readyAfterReleaseTimeoutMs || READY_AFTER_RELEASE_TIMEOUT_MS;
    const keepAliveIntervalMs = options.keepAliveIntervalMs || KEEP_ALIVE_INTERVAL_MS;
    const unfinishedTextMaxMs = options.unfinishedTextMaxMs || UNFINISHED_TEXT_MAX_MS;
    const handlers = options.handlers || {};
    // The caller can read aloud an answer that came as text without audio
    // (see textWithoutAudio): wait for the whole text before failing. Off,
    // such an answer fails at once, as the caller only asks again.
    const waitForTextWithoutAudio = Boolean(options.waitForTextWithoutAudio);

    const createdAt = Date.now();
    let lease = null;
    let ws = null;
    let phase = "new"; // new -> connecting -> ready -> done | failed | cancelled
    let failure = null;

    let began = false;
    let ended = false;
    let activityStartSent = false;
    let activityEndSent = false;
    let audioStarted = false;
    // The page ended the turn before Gemini had finished (see stopEarly).
    let stoppedEarly = false;
    // A typed sentence to translate instead of a spoken one (see sendText).
    let typedText = "";
    // The caller takes a typed sentence's translation as words alone when
    // Gemini does not speak it (see sendText).
    let acceptTextOnly = false;
    // That happened: the turn has its translated text and no audio.
    let audioMissing = false;
    // Gemini ended its answer with text and no audio, and the caller does not
    // take words alone: the rest of the text is waited for (it can trail the
    // end of the answer), then the turn fails with the whole of it, so the
    // page can have it read aloud (failure.translatedText).
    let textWithoutAudio = false;

    let queuedAudio = [];
    let queuedSeconds = 0;
    let inputSeconds = 0;
    let outputBytes = 0;
    let sourceText = "";
    let translatedText = "";
    // The cleaned part of translatedText already reported to the page.
    let shownText = "";

    let readyAt = 0;
    let endedAt = 0;
    let activityEndSentAt = 0;
    let firstAudioAt = 0;

    let preparePromise = null;
    let resolvePrepare = null;
    let rejectPrepare = null;
    let resultPromise = null;
    let resolveResult = null;
    let rejectResult = null;

    let keepAliveTimer = null;
    let readyDeadlineTimer = null;
    let firstAudioTimer = null;
    let turnTimer = null;
    let trailingTimer = null;
    let audioCompleteAt = 0;
    // Gemini said its answer is over (turnComplete); only the words it heard
    // may still be on their way.
    let turnCompleted = false;
    let waitedForHeardText = false;

    const isFinished = () => phase === "done" || phase === "failed" || phase === "cancelled";

    function clearTimers() {
      clearInterval(keepAliveTimer);
      clearTimeout(readyDeadlineTimer);
      clearTimeout(firstAudioTimer);
      clearTimeout(turnTimer);
      clearTimeout(trailingTimer);
      keepAliveTimer = null;
    }

    function closeSocket() {
      const socket = ws;
      ws = null;
      if (!socket) return;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      // Keep a handler so a late socket error is swallowed, not thrown.
      socket.onerror = function () {};
      try {
        socket.close();
      } catch (error) {
        // ignored
      }
    }

    function usage() {
      return {
        inputSeconds: inputSeconds,
        outputSeconds: outputBytes / OUTPUT_BYTES_PER_SECOND
      };
    }

    function fail(error) {
      if (isFinished()) return;
      phase = "failed";
      failure = error instanceof Error ? error : new Error(String(error));
      failure.audioStarted = audioStarted;
      // Gemini said in so many words that there was nothing to translate.
      failure.noSpeech = saysNoSpeech(translatedText);
      failure.usage = usage();
      failure.leaseId = lease ? lease.leaseId : "";
      // What had come when it failed, and whether the translation's text
      // still looks unfinished (then it must not be read out as the answer).
      failure.translatedText = cleanTranscript(translatedText);
      failure.sourceText = sourceText.trim();
      // Text without audio is only whole once Gemini has said its answer is
      // over (turnComplete): a connection that drops before that may have cut
      // the text off with nothing to show for it.
      failure.textIncomplete =
        !failure.translatedText ||
        transcriptLooksUnfinished(translatedText) ||
        (textWithoutAudio && !turnCompleted);
      clearTimers();
      closeSocket();
      if (rejectPrepare) rejectPrepare(failure);
      if (rejectResult) rejectResult(failure);
    }

    function succeed() {
      if (isFinished()) return;
      if (textWithoutAudio) {
        fail(noAudioError("no-audio", "Gemini returned no translated audio."));
        return;
      }
      phase = "done";
      clearTimers();
      closeSocket();
      const totals = usage();
      resolveResult({
        leaseId: lease.leaseId,
        sourceText: sourceText.trim(),
        translatedText: cleanTranscript(translatedText),
        // The text stops halfway although the audio is complete.
        translatedTextIncomplete: transcriptLooksUnfinished(translatedText),
        // The other way round: the text is whole, but Gemini stopped speaking
        // long before the end of it.
        translatedAudioCutShort:
          !stoppedEarly &&
          audioTooShortForText(cleanTranscript(translatedText), totals.outputSeconds),
        // A typed sentence that came back as words alone, without a voice.
        translatedAudioMissing: audioMissing,
        // The page stopped this answer halfway: text and audio are partial.
        stoppedEarly: stoppedEarly,
        // Gemini's whole answer was "<no speech>": it heard a noise, not words.
        noSpeech: saysNoSpeech(translatedText),
        inputSeconds: totals.inputSeconds,
        outputSeconds: totals.outputSeconds,
        timings: {
          readyMs: readyAt ? readyAt - createdAt : null,
          wasReadyAtRelease: readyAt > 0 && readyAt <= endedAt,
          firstAudioAfterReleaseMs: firstAudioAt ? firstAudioAt - endedAt : null
        }
      });
    }

    function send(payload) {
      if (!ws || ws.readyState !== 1) {
        fail(reasonError("connection", "Gemini connection is not open."));
        return false;
      }
      try {
        ws.send(payload);
        return true;
      } catch (error) {
        fail(error);
        return false;
      }
    }

    // Sends whatever the current state allows. Called whenever the connection
    // becomes ready, the speaker starts, audio arrives, or the speaker stops.
    function flush() {
      if (phase !== "ready" || !began) return;
      if (typedText) {
        if (activityEndSent) return;
        // Sent the way live input is sent. As a finished "client content"
        // turn, about one sentence in six came back without any speech.
        if (!send(JSON.stringify({ realtimeInput: { text: typedText } }))) return;
        activityStartSent = true;
        activityEndSent = true;
        activityEndSentAt = Date.now();
        clearTimeout(readyDeadlineTimer);
        startFirstAudioTimer(typedFirstAudioTimeoutMs);
        return;
      }
      if (!activityStartSent) {
        if (!send(JSON.stringify({ realtimeInput: { activityStart: {} } }))) return;
        activityStartSent = true;
      }
      while (queuedAudio.length) {
        if (!send(audioMessage(queuedAudio.shift(), lease.inputRate || 24000))) return;
      }
      queuedSeconds = 0;
      if (ended && !activityEndSent) {
        if (!send(JSON.stringify({ realtimeInput: { activityEnd: {} } }))) return;
        activityEndSent = true;
        activityEndSentAt = Date.now();
        clearTimeout(readyDeadlineTimer);
        startFirstAudioTimer(firstAudioTimeoutMs);
      }
    }

    // The wait for the first translated sound starts once the end of the
    // turn has actually left the browser. A whole recording handed over at
    // once (a second attempt) can take seconds to upload on a phone; that
    // time is not Gemini's to answer in.
    // A socket whose upload has not moved on for this long has stalled (a
    // phone changing networks mid-turn): the turn fails as a connection
    // failure, so the page turns to another connection at once.
    function startFirstAudioTimer(ms) {
      clearTimeout(firstAudioTimer);
      const sendingSince = Date.now();
      const startWhenSent = function () {
        if (isFinished() || audioStarted) return;
        if (ws && ws.bufferedAmount > 0) {
          if (Date.now() - sendingSince > UPLOAD_MAX_MS) {
            fail(reasonError("connection", "The turn could not be sent to Gemini in time."));
            return;
          }
          firstAudioTimer = setTimeout(startWhenSent, 100);
          return;
        }
        firstAudioTimer = setTimeout(function () {
          fail(noAudioError("first-audio-timeout", "Gemini sent no translated audio in time."));
        }, ms);
      };
      startWhenSent();
    }

    function startKeepAlive() {
      clearInterval(keepAliveTimer);
      keepAliveTimer = setInterval(function () {
        if (phase !== "ready" || began) {
          clearInterval(keepAliveTimer);
          return;
        }
        send(audioMessage(getSilentChunkBase64(), 24000));
      }, keepAliveIntervalMs);
    }

    function handleServerMessage(event) {
      let message;
      try {
        message = JSON.parse(decodeMessageData(event.data));
      } catch (error) {
        return;
      }
      if (!message || typeof message !== "object") return;

      if (message.error) {
        // All the audio already arrived: only trailing text was pending.
        if (audioCompleteAt) succeed();
        else fail(reasonError("gemini-error", "Gemini error: " + String(message.error.message || "unknown error")));
        return;
      }

      if (message.setupComplete && phase === "connecting") {
        phase = "ready";
        readyAt = Date.now();
        if (!began) startKeepAlive();
        if (resolvePrepare) resolvePrepare();
        flush();
        return;
      }

      // The server is about to drop this connection. Fine mid-turn (the turn is
      // short), but an idle prepared session should not be used after this.
      if (message.goAway && !began) {
        fail(reasonError("go-away", "Gemini asked to close the prepared session."));
        return;
      }

      const content = message.serverContent;
      if (!content || !activityStartSent) return;

      if (
        !typedText &&
        content.inputTranscription &&
        typeof content.inputTranscription.text === "string"
      ) {
        sourceText += content.inputTranscription.text;
        if (typeof handlers.onSourceText === "function") {
          handlers.onSourceText(sourceText.trim());
        }
      }

      if (content.outputTranscription && typeof content.outputTranscription.text === "string") {
        translatedText += content.outputTranscription.text;
        const cleaned = cleanTranscript(translatedText.replace(UNCLOSED_MARKER, ""));
        if (cleaned.length > shownText.length && cleaned.startsWith(shownText)) {
          const delta = cleaned.slice(shownText.length);
          shownText = cleaned;
          if (typeof handlers.onTranslatedTextDelta === "function") {
            handlers.onTranslatedTextDelta(delta);
          }
        }
      }

      const parts = content.modelTurn && Array.isArray(content.modelTurn.parts)
        ? content.modelTurn.parts
        : [];
      for (let i = 0; i < parts.length; i += 1) {
        const data = parts[i] && parts[i].inlineData ? parts[i].inlineData.data : "";
        if (typeof data !== "string" || !data) continue;
        // The answer was over with no audio: none is played now, as the page
        // may be about to have the text read aloud.
        if (textWithoutAudio) continue;
        if (!audioStarted) {
          audioStarted = true;
          firstAudioAt = Date.now();
          clearTimeout(firstAudioTimer);
        }
        outputBytes += base64ByteLength(data);
        if (typeof handlers.onAudioDelta === "function") {
          handlers.onAudioDelta(data);
        }
      }

      if (audioCompleteAt) {
        if (content.turnComplete) turnCompleted = true;
        settleAfterAudio();
        return;
      }

      if ((content.generationComplete || content.turnComplete) && activityEndSent) {
        if (!audioStarted) {
          const wordsAlone =
            acceptTextOnly &&
            Boolean(typedText) &&
            Boolean(cleanTranscript(translatedText)) &&
            !saysNoSpeech(translatedText);
          if (!wordsAlone) {
            if (
              !waitForTextWithoutAudio ||
              !cleanTranscript(translatedText) ||
              saysNoSpeech(translatedText)
            ) {
              fail(noAudioError("no-audio", "Gemini returned no translated audio."));
              return;
            }
            textWithoutAudio = true;
          } else {
            audioMissing = true;
          }
          clearTimeout(firstAudioTimer);
        }
        audioCompleteAt = Date.now();
        if (content.turnComplete) turnCompleted = true;
        settleAfterAudio();
      }
    }

    // The audio is complete: finish once the transcripts have stopped
    // arriving. A translation transcript that is missing or visibly unfinished
    // is given until its longer limit, and missing heard words until theirs.
    // Once Gemini says the turn is over (turnComplete), only the heard words
    // are still waited for. Called again on every message.
    function settleAfterAudio() {
      clearTimeout(trailingTimer);
      const elapsed = Date.now() - audioCompleteAt;
      const heardMissing = !typedText && !sourceText.trim();
      if (turnCompleted) {
        let remaining = 0;
        if (heardMissing) {
          waitedForHeardText = true;
          remaining = HEARD_TEXT_MAX_MS - elapsed;
        } else if (waitedForHeardText) {
          // They came late: the rest of them may be just behind.
          remaining = Math.min(TRAILING_TEXT_GRACE_MS, HEARD_TEXT_MAX_MS + TRAILING_TEXT_GRACE_MS - elapsed);
        }
        if (remaining <= 0) {
          succeed();
          return;
        }
        trailingTimer = setTimeout(succeed, remaining);
        return;
      }
      // Text without audio also waits for turnComplete (see failure.textIncomplete).
      const unfinished =
        textWithoutAudio ||
        !cleanTranscript(translatedText) ||
        transcriptLooksUnfinished(translatedText);
      let limit = unfinished ? unfinishedTextMaxMs : TRAILING_TEXT_MAX_MS;
      if (heardMissing) limit = Math.max(limit, HEARD_TEXT_MAX_MS);
      const remaining = limit - elapsed;
      if (remaining <= 0) {
        succeed();
        return;
      }
      trailingTimer = setTimeout(
        succeed,
        unfinished || heardMissing ? remaining : Math.min(remaining, TRAILING_TEXT_GRACE_MS)
      );
    }

    // Gets a token and opens the connection. Safe to call early (before the
    // speaker presses) so the session is ready and waiting.
    function prepare() {
      if (preparePromise) return preparePromise;
      preparePromise = new Promise(function (resolve, reject) {
        resolvePrepare = resolve;
        rejectPrepare = reject;
      });
      // The caller may not be listening yet; failures are also reported by end().
      preparePromise.catch(function () {});

      if (!WebSocketImpl) {
        fail(new Error("WebSocket is not available."));
        return preparePromise;
      }

      phase = "connecting";
      Promise.resolve()
        .then(requestLease)
        .then(function (nextLease) {
          if (isFinished()) return;
          if (!nextLease || !nextLease.token || !nextLease.wsUrl || !nextLease.leaseId) {
            throw new Error("Lease response is incomplete.");
          }
          lease = nextLease;
          const socket = new WebSocketImpl(
            lease.wsUrl + "?access_token=" + encodeURIComponent(lease.token)
          );
          ws = socket;
          socket.binaryType = "arraybuffer";
          socket.onopen = function () {
            send(JSON.stringify({ setup: { model: lease.model } }));
          };
          socket.onmessage = handleServerMessage;
          socket.onerror = function () {
            if (audioCompleteAt) succeed();
            else fail(reasonError("connection", "Gemini connection failed."));
          };
          socket.onclose = function (event) {
            // All the audio already arrived: only trailing text was pending.
            if (audioCompleteAt) {
              succeed();
              return;
            }
            const reason = event && event.reason ? ": " + event.reason : "";
            fail(reasonError("connection", "Gemini connection closed" + reason));
          };
        })
        .catch(function (error) {
          // Before there is a lease, the failure is in getting one.
          if (!lease && error && typeof error === "object" && !error.reason) error.reason = "lease";
          fail(error);
        });
      return preparePromise;
    }

    // The speaker pressed the button.
    function begin() {
      if (began || isFinished()) return;
      began = true;
      clearInterval(keepAliveTimer);
      if (phase === "new") prepare();
      flush();
    }

    // One captured audio frame: base64 PCM16 at the lease's input rate.
    function pushAudio(base64, durationMs) {
      if (!began || ended || isFinished() || !base64) return;
      const seconds = Math.max(0, Number(durationMs) || 0) / 1000;
      inputSeconds += seconds;
      if (phase === "ready" && activityStartSent) {
        send(audioMessage(base64, lease.inputRate || 24000));
        return;
      }
      if (queuedSeconds + seconds > MAX_QUEUED_AUDIO_SECONDS) {
        fail(new Error("Too much audio was waiting for the Gemini connection."));
        return;
      }
      queuedAudio.push(base64);
      queuedSeconds += seconds;
    }

    // A sentence given as text instead of speech: the speaker corrected what
    // was heard. It is translated and spoken like a recorded turn, and the
    // result resolves the same way. `shownText` is what the turn reports as
    // its source text (defaults to the text itself).
    // Some typed sentences Gemini translates without speaking them: the words
    // arrive and no audio does (seen on gemini-3.8-live, 2026-11-17; the same
    // sentence does it again and again). With `acceptTextOnly` such a turn
    // resolves with its text and `translatedAudioMissing`, instead of failing
    // for want of audio.
    function sendText(text, shownText, sendOptions) {
      acceptTextOnly = Boolean(sendOptions && sendOptions.acceptTextOnly);
      const value = String(text || "").trim();
      if (began || isFinished() || !value) {
        const error = new Error("Turn was cancelled.");
        error.audioStarted = false;
        error.usage = usage();
        error.cancelled = true;
        return Promise.reject(error);
      }
      typedText = value;
      sourceText = String(shownText || value).trim();
      began = true;
      clearInterval(keepAliveTimer);
      if (phase === "new") prepare();
      return end();
    }

    // The speaker let go. Resolves with the finished turn, or rejects with an
    // error whose `audioStarted` says whether any translation was already heard.
    function end() {
      if (resultPromise) return resultPromise;
      resultPromise = new Promise(function (resolve, reject) {
        resolveResult = resolve;
        rejectResult = reject;
      });
      resultPromise.catch(function () {});

      if (phase === "failed") {
        rejectResult(failure);
        return resultPromise;
      }
      if (phase === "cancelled" || !began) {
        const error = new Error("Turn was cancelled.");
        error.audioStarted = false;
        error.usage = usage();
        error.cancelled = true;
        rejectResult(error);
        return resultPromise;
      }

      ended = true;
      endedAt = Date.now();
      turnTimer = setTimeout(function () {
        fail(reasonError("turn-timeout", "Gemini turn timed out."));
      }, turnTimeoutMs);
      if (phase !== "ready") {
        // A typed sentence starts its connection only now, so it gets the
        // time a connection needs; a spoken one was connecting all along.
        readyDeadlineTimer = setTimeout(function () {
          fail(reasonError("not-ready", "Gemini connection was not ready in time."));
        }, typedText ? Math.max(readyAfterReleaseTimeoutMs, TYPED_READY_TIMEOUT_MS) : readyAfterReleaseTimeoutMs);
      }
      flush();
      return resultPromise;
    }

    // The page has seen enough of the answer to know it will be thrown away
    // (the sentence is being said back untranslated). Ends the turn now with
    // what has arrived, so it is counted and the page can ask again at once.
    function stopEarly() {
      if (isFinished() || !resultPromise || !lease || !activityStartSent) return false;
      if (stoppedEarly) return true;
      stoppedEarly = true;
      // After the message being handled, so the audio it carries is counted.
      Promise.resolve().then(succeed);
      return true;
    }

    function cancel() {
      if (isFinished()) return;
      phase = "cancelled";
      clearTimers();
      closeSocket();
      const error = new Error("Turn was cancelled.");
      error.audioStarted = audioStarted;
      error.usage = usage();
      error.cancelled = true;
      if (rejectPrepare) rejectPrepare(error);
      if (rejectResult) rejectResult(error);
    }

    return {
      prepare: prepare,
      begin: begin,
      pushAudio: pushAudio,
      end: end,
      sendText: sendText,
      stopEarly: stopEarly,
      cancel: cancel,
      handlers: handlers,
      // True while the session can still take a new turn (not begun, not dead).
      isAvailable: function () {
        return !began && (phase === "connecting" || phase === "ready");
      },
      isReady: function () {
        return phase === "ready";
      },
      hasBegun: function () {
        return began;
      },
      ageMs: function () {
        return Date.now() - createdAt;
      },
      getLease: function () {
        return lease;
      },
      getUsage: usage
    };
  }

  return {
    createSession: createSession,
    cleanTranscript: cleanTranscript,
    transcriptLooksUnfinished: transcriptLooksUnfinished,
    audioTooShortForText: audioTooShortForText
  };
});
