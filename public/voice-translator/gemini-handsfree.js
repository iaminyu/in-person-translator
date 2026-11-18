// Hands-free Gemini Live translation: no button per sentence.
//
// The microphone stays on and this code decides where a sentence starts and
// where it ends, the way a finger on the push-to-talk button would. Each
// sentence is then sent, complete and on its own, through the same kind of
// session a push-to-talk turn uses (gemini-direct.js): a fresh session that
// hears that one sentence and nothing else.
//
// Why not let Gemini find the sentences in an open audio stream? It was
// tried. The first words of a sentence were often lost before Gemini noticed
// someone was speaking, and sound left over from before (the echo of the last
// translation, a half sentence) was heard as part of the new one. With the
// start and end marked here, including a moment of audio from before the
// speaker began, neither can happen.
//
// A fresh session per sentence also keeps the model translating instead of
// drifting into conversation, and is cheaper than a long session, which is
// billed for its whole history on every turn. A small pool of connected
// sessions waits in the background so a sentence never waits for a connection.
//
// While a translation is being played the microphone input is dropped
// (half-duplex), otherwise the phone would hear and translate its own voice.
//
// No DOM dependencies: the page feeds microphone frames in and renders what
// the handlers report. Also runs under Node for tests and evaluation.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(function () {
      return require("./gemini-direct.js");
    });
  } else {
    root.LiveTalkGeminiHandsFree = factory(function () {
      return root.LiveTalkGeminiDirect;
    });
  }
})(typeof self !== "undefined" ? self : this, function (getDirectModule) {
  "use strict";

  const OUTPUT_BYTES_PER_SECOND = 24000 * 2;
  const NO_AUDIO_CODE = "NO_AUDIO";

  const DEFAULTS = {
    poolSize: 2,
    // Tokens last 10 minutes; replace a waiting session before that.
    sessionMaxAgeMs: 8 * 60 * 1000,

    // --- speech or not --------------------------------------------------
    // The page can pass, with every frame, how likely it is that someone is
    // speaking in it (speech-detector.js). That is what decides, when it is
    // there: loudness cannot tell a person from a busy room, music or a
    // keyboard. Speech starts at the first value, and counts as carrying on
    // down to the second. Without it (the model did not load) the loudness
    // rules below are used instead.
    speechStartProbability: 0.5,
    speechContinueProbability: 0.35,

    // --- where a sentence starts ---------------------------------------
    // All of this was set against a real microphone (a laptop's, through the
    // browser's echo cancelling, noise suppression and automatic gain; see
    // test/fixtures/real-mic-levels.json), not against clean recordings: a
    // real room is never silent. Its quietest moments were around 0.002,
    // ordinary sounds in it reached 0.01, speech 0.03 to 0.17.
    //
    // Sound clearly above the room's background level may be speech.
    startMinRms: 0.008,
    startRatio: 3,
    // It is speech once it has been that loud for this long in total. A
    // click or a cup put down is shorter and is dropped without being sent.
    minSpeechMs: 240,
    candidateTimeoutMs: 700,
    // Audio from just before the first loud moment is sent too, so a soft
    // first syllable is not cut off.
    preRollMs: 1000,

    // --- where it ends -------------------------------------------------
    // "Quiet" is judged against how loud THIS speaker is, not against the
    // room at its quietest: after someone stops, a real microphone keeps
    // delivering several times the room's minimum for seconds (the room's
    // tail, the automatic gain turning itself up, a keyboard). Anything
    // below this share of the speaker's usual level counts as not speaking.
    endRatio: 0.35,
    // ...and so does anything this close to the background level, which
    // matters for steady noise that was taken for speech at first.
    holdRatio: 2.5,
    // A single blip does not mean the speaker carried on; sound has to last
    // this long to count.
    resumeMs: 250,
    // ...and a dip this short inside it (the gap between two syllables) does
    // not break it off.
    dipMs: 100,
    // This long without speech: the speaker has finished. Long enough for a
    // breath or a short pause to think. From then on the sentence stands:
    // nothing more is listened to until its translation has been played.
    // (An earlier version took the sentence back and sent it again when
    // more sound followed. In a real room any noise in that moment did so,
    // and the translation kept not arriving.)
    endSilenceMs: 1200,
    // Nobody speaks this long without a pause; in a place that never gets
    // quiet the sentence is sent at this length ("Done speaking" is faster).
    maxUtteranceSeconds: 45,
    // No translated speech this long after a sentence was sent: give up on
    // that answer. Shorter than for push-to-talk, where a person is waiting
    // on purpose; here it may have been a noise, and listening must go on.
    answerTimeoutMs: 7000,
    retryConnectTimeoutMs: 6000,
    // Whatever goes wrong, a sentence is given up after this long without
    // its translation starting, or this long in all, and listening goes on.
    answerWatchdogMs: 11000,
    turnTimeoutMs: 25000,
    // A microphone that has just been switched on delivers a burst while it
    // settles. Nothing is listened to for this long after the start.
    warmUpMs: 800,

    // How fast the background level may creep upwards (time to double), in
    // seconds of audio. Slower while someone is speaking, so that a sentence
    // is not mistaken for the room getting louder, but never frozen: moving
    // from a quiet room to a busy street must not leave it stuck listening.
    floorDoublingSecondsClosed: 3,
    floorDoublingSecondsOpen: 4,
    // Wait this long after playback ends before listening again, so the tail
    // of the translation (and room echo) is not picked up.
    playbackGuardMs: 350,
    retryDelayMs: 2000,
    maxConsecutiveFailures: 4
  };

  function base64ByteLength(base64) {
    const length = base64.length;
    if (!length) return 0;
    let padding = 0;
    if (base64.charCodeAt(length - 1) === 61) padding += 1;
    if (base64.charCodeAt(length - 2) === 61) padding += 1;
    return Math.floor((length * 3) / 4) - padding;
  }

  // The level a speaker usually reaches: the middle value of their loud
  // frames, which a single shout or bang does not move.
  function typicalLevel(levels) {
    if (!levels.length) return 0;
    const sorted = levels.slice().sort(function (a, b) {
      return a - b;
    });
    // The lower of the two middle values: with only a few frames so far, the
    // loud start of a word must not set the bar too high.
    return sorted[Math.floor((sorted.length - 1) / 2)];
  }

  function totalMs(frames) {
    let sum = 0;
    for (let i = 0; i < frames.length; i += 1) sum += frames[i].durationMs;
    return sum;
  }

  // Runs a whole hands-free conversation on top of single-sentence sessions.
  function createConversation(options) {
    const config = {};
    for (const key in DEFAULTS) {
      config[key] = options[key] !== undefined ? options[key] : DEFAULTS[key];
    }
    const requestLease = options.requestLease;
    const WebSocketImpl = options.WebSocketImpl;
    const handlers = options.handlers || {};
    const sessionOptions = options.sessionOptions || {};
    const createSession =
      options.createSession || (getDirectModule() || {}).createSession;
    if (typeof createSession !== "function") {
      throw new Error("gemini-direct.js must be loaded before a hands-free conversation.");
    }
    // Optional: the page says when a finished answer has to be thrown away
    // and asked for again, for instance because it is in the wrong language.
    const isWrongAnswer = typeof options.isWrongAnswer === "function" ? options.isWrongAnswer : null;
    // Asked while an answer is still arriving: true when it can already be
    // seen to be wrong, so it is stopped and asked for again without waiting.
    const isWrongSoFar = typeof options.isWrongSoFar === "function" ? options.isWrongSoFar : null;

    let running = false;
    let paused = false;
    let pool = []; // sessions connected (or connecting) and not yet used
    let consecutiveFailures = 0;
    let retryTimer = null;
    let maintenanceTimer = null;
    let turnCounter = 0;

    // The sentence being listened to. Until it is confirmed as speech it is
    // only a candidate: recorded here, not sent anywhere.
    let capture = null;
    // A sentence that was sent and whose translation has not started to play.
    let pending = null;
    // The sentence whose translation is playing (or being asked for again).
    let responding = null;

    // half-duplex
    let playbackEndsAt = 0;
    let micBlockedUntil = 0;

    // Pauses are measured in audio that was heard, not in time on the clock:
    // a phone that stalls for a moment delivers its frames late and in a
    // burst, and that must not look like the speaker going quiet.
    let audioClockMs = 0;
    let warmUpLeftMs = 0;

    // background level and the audio from just before a sentence
    let noiseFloor = 0.001;
    let preRoll = [];
    let preRollMs = 0;
    let hearing = false;

    function emit(name, a, b, c) {
      if (typeof handlers[name] === "function") handlers[name](a, b, c);
    }

    function setHearing(next) {
      if (hearing === next) return;
      hearing = next;
      emit("onHearingChange", next);
    }

    // --- sessions ---------------------------------------------------------

    function makeSession(extra) {
      const merged = {
        requestLease: requestLease,
        WebSocketImpl: WebSocketImpl,
        firstAudioTimeoutMs: config.answerTimeoutMs,
        turnTimeoutMs: config.turnTimeoutMs,
        handlers: {}
      };
      for (const key in sessionOptions) merged[key] = sessionOptions[key];
      for (const key in extra || {}) merged[key] = extra[key];
      return createSession(merged);
    }

    function removeFromPool(session) {
      pool = pool.filter(function (item) {
        return item !== session;
      });
    }

    function createPooledSession() {
      const session = makeSession();
      pool.push(session);
      session.prepare().then(
        function () {
          consecutiveFailures = 0;
        },
        function (error) {
          // A session already taken for a sentence reports through its turn.
          if (pool.indexOf(session) === -1) return;
          removeFromPool(session);
          if (!running || (error && error.cancelled)) return;
          // Replace it, but never in a tight loop: wait longer after each
          // failure in a row, and stop the conversation if it keeps failing.
          consecutiveFailures += 1;
          if (consecutiveFailures >= config.maxConsecutiveFailures) {
            stop();
            emit("onError", error);
            return;
          }
          clearTimeout(retryTimer);
          retryTimer = setTimeout(fillPool, config.retryDelayMs * consecutiveFailures);
        }
      );
      return session;
    }

    function fillPool() {
      if (!running) return;
      while (pool.length < config.poolSize) createPooledSession();
    }

    function takeSession() {
      // A waiting session can have been closed by the server in the meantime.
      pool = pool.filter(function (session) {
        return session.isAvailable();
      });
      let chosen = null;
      for (let i = 0; i < pool.length; i += 1) {
        if (pool[i].isReady()) {
          chosen = pool[i];
          break;
        }
      }
      if (!chosen && pool.length) chosen = pool[0];
      if (!chosen) chosen = createPooledSession();
      removeFromPool(chosen);
      fillPool();
      return chosen;
    }

    function maintain() {
      if (!running) return;
      // Replace waiting sessions that died or whose tokens are about to expire.
      pool.slice().forEach(function (session) {
        if (session.isAvailable() && session.ageMs() <= config.sessionMaxAgeMs) return;
        removeFromPool(session);
        session.cancel();
      });
      fillPool();
    }

    // --- one sentence -----------------------------------------------------

    function startTurn(turn) {
      if (turn.started) return;
      turn.started = true;
      emit("onTurnStart", turn);
    }

    // Connects a session's events to the sentence it is translating.
    function wire(turn, session) {
      const isLive = function () {
        return running && !turn.dropped && turn.session === session;
      };
      // Only the first answer is stopped early; the second one is shown as
      // it comes, whatever it is.
      const stopIfWrongSoFar = function () {
        if (!isWrongSoFar || turn.firstTry || !turn.frames.length) return false;
        if (typeof session.stopEarly !== "function") return false;
        let wrong = false;
        try {
          wrong =
            isWrongSoFar({ sourceText: turn.sourceText, translatedText: turn.translatedSoFar }) ===
            true;
        } catch (error) {
          // A broken check must never cost a good translation.
        }
        return wrong && session.stopEarly() === true;
      };
      session.handlers.onSourceText = function (text) {
        if (!isLive() || !String(text || "").trim()) return;
        turn.sourceText = text;
        startTurn(turn);
        emit("onSourceText", turn, text);
        stopIfWrongSoFar();
      };
      session.handlers.onTranslatedTextDelta = function (delta) {
        if (!isLive() || !delta) return;
        turn.translatedSoFar += delta;
        if (!turn.translatedSoFar.trim()) return;
        startTurn(turn);
        // Words that are about to be thrown away are not shown.
        if (stopIfWrongSoFar()) return;
        emit("onTranslatedTextDelta", turn, delta);
      };
      session.handlers.onAudioDelta = function (base64) {
        if (!isLive()) return;
        turn.audioStarted = true;
        startTurn(turn);
        if (responding !== turn) {
          // The translation is starting to play: from here on the microphone
          // is ignored until it has finished.
          if (pending === turn) pending = null;
          responding = turn;
          micBlockedUntil = Infinity;
          dropListening();
        }
        const seconds = base64ByteLength(base64) / OUTPUT_BYTES_PER_SECOND;
        playbackEndsAt = Math.max(Date.now(), playbackEndsAt) + seconds * 1000;
        emit("onAudioDelta", turn, base64, seconds);
      };
    }

    function sendFrames(session, frames) {
      session.begin();
      for (let i = 0; i < frames.length; i += 1) {
        session.pushAudio(frames[i].base64, frames[i].durationMs);
      }
    }

    function release(turn) {
      if (pending === turn) pending = null;
      if (responding === turn) {
        responding = null;
        micBlockedUntil = Math.max(Date.now(), playbackEndsAt) + config.playbackGuardMs;
      }
    }

    function finishTurn(turn, result) {
      release(turn);
      consecutiveFailures = 0;
      startTurn(turn);
      emit("onTurnEnd", turn, result);
      fillPool();
    }

    function answerIsWrong(result) {
      if (!isWrongAnswer) return false;
      try {
        return isWrongAnswer(result) === true;
      } catch (error) {
        // A broken check must never cost a good translation.
        return false;
      }
    }

    // Once more, on a fresh session, with the same audio. `rejected` is the
    // finished answer that is being thrown away, when there was one.
    function askAgain(turn, firstTry, rejected) {
      turn.firstTry = firstTry;
      if (pending === turn) pending = null;
      responding = turn;
      micBlockedUntil = Infinity;
      dropListening();
      turn.translatedSoFar = "";
      turn.audioStarted = false;
      // The page stops playing a rejected answer: nothing is left to wait for.
      if (rejected) playbackEndsAt = 0;
      if (turn.started) emit("onTurnRetry", turn, rejected);
      // Not from the pool, so it still has to connect: give it the time.
      const session = makeSession({ readyAfterReleaseTimeoutMs: config.retryConnectTimeoutMs });
      turn.session = session;
      wire(turn, session);
      sendFrames(session, turn.frames);
      awaitAnswer(turn, session);
    }

    function awaitAnswer(turn, session) {
      // Last line of defence: no translation has begun to play after this
      // long, for whatever reason. Give the sentence up so listening goes on.
      let gaveUp = false;
      const watchdog = setTimeout(function () {
        if (!running || turn.dropped || turn.session !== session || turn.audioStarted) return;
        gaveUp = true;
        session.cancel();
      }, config.answerWatchdogMs);
      session.end().then(
        function (result) {
          clearTimeout(watchdog);
          if (!running || turn.dropped || turn.session !== session) return;
          if (
            !turn.firstTry &&
            turn.frames.length &&
            (result.stoppedEarly || answerIsWrong(result))
          ) {
            // The answer is complete but wrong (in another language, say).
            // Asked again once; a second wrong answer is reported as it is.
            askAgain(turn, { rejected: result, text: "", sourceText: turn.sourceText }, result);
            return;
          }
          finishTurn(turn, result);
        },
        function (error) {
          clearTimeout(watchdog);
          if (!running || turn.dropped || turn.session !== session) return;
          if (gaveUp) {
            release(turn);
            if (turn.started) emit("onTurnError", turn, new Error("No translation arrived in time."));
            else emit("onTurnEmpty", turn);
            fillPool();
            return;
          }
          handleFailure(turn, error || new Error("Translation failed."));
        }
      );
    }

    function handleFailure(turn, error) {
      if (error.audioStarted) {
        // Part of the translation was heard; asking again would repeat it.
        release(turn);
        emit("onTurnError", turn, error);
        fillPool();
        return;
      }
      const noAudio = error.code === NO_AUDIO_CODE;
      const nothingHeard = !turn.translatedSoFar.trim() && !turn.sourceText;
      if (noAudio && (nothingHeard || error.noSpeech) && !turn.firstTry) {
        // Gemini heard nothing to translate, or said so itself ("<no speech
        // detected>", often with a guess such as "da da" as what it heard):
        // it was not speech in these two languages. Asking again would only
        // cost a second call and keep the microphone closed for longer.
        release(turn);
        emit("onTurnEmpty", turn);
        fillPool();
        return;
      }
      if (!turn.firstTry) {
        // Once more, on a fresh session, with the same audio. Now and then
        // Gemini answers with text and no voice, or a connection drops.
        askAgain(turn, {
          error: error,
          text: turn.translatedSoFar.trim(),
          sourceText: turn.sourceText
        });
        return;
      }
      // The second try failed as well. If either try produced the text of
      // the translation, show that; otherwise report the sentence as lost.
      // (A first answer that was thrown away as wrong has no text to show.)
      const secondText = turn.translatedSoFar.trim();
      const best = secondText
        ? { error: error, text: secondText, sourceText: turn.sourceText }
        : turn.firstTry;
      if (best.text) {
        const usage = best.error.usage || {};
        finishTurn(turn, {
          leaseId: best.error.leaseId || "",
          sourceText: best.sourceText || turn.sourceText || "",
          translatedText: best.text,
          inputSeconds: Number(usage.inputSeconds) || 0,
          outputSeconds: 0,
          noAudio: true
        });
        return;
      }
      release(turn);
      startTurn(turn);
      emit("onTurnError", turn, error);
      fillPool();
    }

    // --- listening --------------------------------------------------------

    function dropListening() {
      if (capture) {
        if (capture.turn) {
          capture.turn.dropped = true;
          capture.turn.session.cancel();
          if (capture.turn.started) emit("onTurnInterrupted", capture.turn);
        }
        capture = null;
      }
      preRoll = [];
      preRollMs = 0;
      setHearing(false);
    }

    // The candidate turned out to be speech: start sending it.
    function confirmCapture() {
      turnCounter += 1;
      const session = takeSession();
      const turn = {
        id: turnCounter,
        session: session,
        startedAt: Date.now(),
        frames: capture.frames,
        // The module's own record of the translation's text. The page keeps
        // its own on the same object (turn.text), so the names must differ.
        translatedSoFar: "",
        sourceText: "",
        started: false,
        audioStarted: false,
        // Set when the sentence was abandoned while it was still being
        // spoken (listening was paused): its session's events are ignored.
        dropped: false,
        firstTry: null
      };
      wire(turn, session);
      sendFrames(session, capture.frames);
      capture.turn = turn;
      // The speaker is in the middle of speaking: the sound that follows at
      // once is the same stretch of speech, not a new blip.
      capture.soundRunMs = config.resumeMs;
      setHearing(true);
    }

    function finalizeCapture() {
      const turn = capture.turn;
      capture = null;
      preRoll = [];
      preRollMs = 0;
      pending = turn;
      setHearing(false);
      awaitAnswer(turn, turn.session);
    }

    // One microphone frame: base64 PCM16, its length, its loudness (RMS,
    // 0..1) and, when a speech detector is running, the likelihood (0..1)
    // that someone is speaking in it. Call this for every frame while the
    // conversation is running.
    function pushAudio(base64, durationMs, rms, speech) {
      if (!running || !base64) return;
      durationMs = Math.max(0, Number(durationMs) || 0);
      if (paused || responding || pending || Date.now() < micBlockedUntil) {
        if (capture || preRoll.length) dropListening();
        return;
      }
      if (warmUpLeftMs > 0) {
        warmUpLeftMs -= durationMs;
        return;
      }
      audioClockMs += durationMs;
      const now = audioClockMs;

      const level = Math.max(0, Number(rms) || 0);
      const speaking = Boolean(capture && capture.turn);
      // Track the room's background level as the quietest recent sound: it
      // follows the room down at once and creeps up slowly. Speech has gaps
      // that keep pulling it back down; steady noise has none, so the level
      // catches up with it and the noise stops counting as someone speaking.
      const seconds = durationMs / 1000;
      const doublingSeconds = speaking
        ? config.floorDoublingSecondsOpen
        : config.floorDoublingSecondsClosed;
      // The small constant lets the level rise from exact silence (0).
      noiseFloor = Math.min(
        level,
        noiseFloor * Math.pow(2, seconds / doublingSeconds) + 0.0001 * seconds
      );
      const startThreshold = Math.max(config.startMinRms, noiseFloor * config.startRatio);
      const heard = typeof speech === "number" && isFinite(speech) ? speech : null;
      const startsSpeech =
        heard !== null ? heard >= config.speechStartProbability : level >= startThreshold;
      const frame = { base64: base64, durationMs: durationMs };

      if (!capture) {
        preRoll.push(frame);
        preRollMs += durationMs;
        while (preRollMs - preRoll[0].durationMs >= config.preRollMs) {
          preRollMs -= preRoll.shift().durationMs;
        }
        if (!startsSpeech) return;
        // Maybe speech. Keep recording, starting with the moment before it.
        capture = {
          frames: preRoll,
          ms: preRollMs,
          loudMs: durationMs,
          lastLoudAt: now,
          // Levels of the clearly loud frames: how loud this speaker is.
          loudLevels: [level],
          // How long the current stretch of sound has lasted, and how long
          // it has been quiet since.
          soundRunMs: durationMs,
          quietRunMs: 0,
          turn: null
        };
        preRoll = [];
        preRollMs = 0;
      } else {
        capture.frames.push(frame);
        capture.ms += durationMs;
        if (startsSpeech) {
          capture.loudLevels.push(level);
          if (capture.loudLevels.length > 120) capture.loudLevels.shift();
        }
        if (capture.turn) {
          capture.turn.session.pushAudio(base64, durationMs);
          const quietBelow = Math.max(
            noiseFloor * config.holdRatio,
            typicalLevel(capture.loudLevels) * config.endRatio
          );
          const stillSpeaking =
            heard !== null ? heard >= config.speechContinueProbability : level >= quietBelow;
          if (stillSpeaking) {
            capture.quietRunMs = 0;
            capture.soundRunMs += durationMs;
            if (capture.soundRunMs >= config.resumeMs) capture.lastLoudAt = now;
          } else {
            capture.quietRunMs += durationMs;
            if (capture.quietRunMs > config.dipMs) capture.soundRunMs = 0;
          }
        } else if (startsSpeech) {
          capture.lastLoudAt = now;
          capture.loudMs += durationMs;
        }
      }

      if (!capture.turn) {
        if (capture.loudMs >= config.minSpeechMs) {
          confirmCapture();
        } else if (now - capture.lastLoudAt > config.candidateTimeoutMs) {
          // A short noise, not speech. Nothing was sent. Its last moment is
          // kept as the lead-in to whatever comes next.
          preRoll = capture.frames;
          preRollMs = capture.ms;
          capture = null;
          while (preRoll.length > 1 && preRollMs - preRoll[0].durationMs >= config.preRollMs) {
            preRollMs -= preRoll.shift().durationMs;
          }
        }
        return;
      }

      if (capture.ms >= config.maxUtteranceSeconds * 1000) {
        finalizeCapture();
      } else if (capture.soundRunMs === 0 && now - capture.lastLoudAt >= config.endSilenceMs) {
        // Not while a sound is still being weighed: the speaker may have just
        // started again.
        finalizeCapture();
      }
    }

    // "I have finished speaking": do not wait for the pause to be noticed.
    // Useful when other people are talking nearby and it never gets quiet.
    function endUtterance() {
      if (!running || !capture || !capture.turn) return false;
      finalizeCapture();
      return true;
    }

    // Stop listening for a while without closing the waiting sessions (for
    // example while a push-to-talk turn is being recorded).
    function setPaused(nextPaused) {
      paused = Boolean(nextPaused);
      if (paused) dropListening();
    }

    function start() {
      if (running) return;
      running = true;
      paused = false;
      consecutiveFailures = 0;
      playbackEndsAt = 0;
      micBlockedUntil = 0;
      warmUpLeftMs = config.warmUpMs;
      fillPool();
      maintenanceTimer = setInterval(maintain, 20000);
    }

    function stop() {
      if (!running) return;
      running = false;
      clearTimeout(retryTimer);
      clearInterval(maintenanceTimer);
      const sessions = pool.slice();
      if (capture && capture.turn) sessions.push(capture.turn.session);
      if (pending) sessions.push(pending.session);
      if (responding) sessions.push(responding.session);
      pool = [];
      capture = null;
      pending = null;
      responding = null;
      preRoll = [];
      preRollMs = 0;
      setHearing(false);
      sessions.forEach(function (session) {
        session.cancel();
      });
    }

    return {
      start: start,
      stop: stop,
      pushAudio: pushAudio,
      endUtterance: endUtterance,
      setPaused: setPaused,
      isRunning: function () {
        return running;
      },
      // A sentence is being recorded and sent.
      isHearing: function () {
        return hearing;
      },
      // A sentence was sent and its translation is awaited or playing.
      isTranslating: function () {
        return Boolean(pending || responding) || Date.now() < micBlockedUntil;
      },
      // ...awaited: nothing of the translation has been heard yet.
      isAwaitingAnswer: function () {
        return Boolean(pending) || Boolean(responding && !responding.audioStarted);
      },
      getPoolState: function () {
        return {
          waiting: pool.length,
          ready: pool.filter(function (session) {
            return session.isReady();
          }).length
        };
      }
    };
  }

  return { createConversation: createConversation };
});
