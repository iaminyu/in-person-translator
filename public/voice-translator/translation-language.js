// Checks that a translation came out in the language it should be in.
//
// Now and then the model answers in a language outside the chosen pair
// (Chinese in, German or English out when the pair is Chinese and Thai), or
// repeats the sentence in the language it was spoken in. Both are judged here
// by writing system alone, so only pairs whose writing systems differ can be
// checked: Chinese and Thai yes, English and German no. When nothing can be
// said for sure the answer is "unknown" and the translation is left alone.
//
// Two smaller checks for a turn in which nobody spoke live here too: whether
// a recording holds any sound, and whether the text "heard" in it is plainly
// in some other language.
//
// No DOM dependencies: voice-page.js uses it, and it runs under Node for tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LiveTalkTranslationLanguage = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SCRIPT_RANGES = [
    ["han", /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/],
    ["kana", /[\u3040-\u30ff]/],
    ["hangul", /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/],
    ["thai", /[\u0e00-\u0e7f]/],
    ["cyrillic", /[\u0400-\u052f]/],
    ["arabic", /[\u0600-\u06ff\u0750-\u077f]/],
    ["hebrew", /[\u0590-\u05ff]/],
    ["greek", /[\u0370-\u03ff]/],
    ["devanagari", /[\u0900-\u097f]/],
    ["bengali", /[\u0980-\u09ff]/],
    ["tamil", /[\u0b80-\u0bff]/],
    ["telugu", /[\u0c00-\u0c7f]/],
    ["latin", /[A-Za-z\u00c0-\u024f\u1e00-\u1eff]/]
  ];

  // Every language not listed here is written in Latin letters.
  const LANGUAGE_SCRIPTS = {
    Chinese: ["han"],
    Japanese: ["han", "kana"],
    Korean: ["hangul"],
    Thai: ["thai"],
    Russian: ["cyrillic"],
    Ukrainian: ["cyrillic"],
    Bulgarian: ["cyrillic"],
    // Serbian is written in both alphabets.
    Serbian: ["cyrillic", "latin"],
    Arabic: ["arabic"],
    Persian: ["arabic"],
    Urdu: ["arabic"],
    Hebrew: ["hebrew"],
    Greek: ["greek"],
    Hindi: ["devanagari"],
    Marathi: ["devanagari"],
    Bengali: ["bengali"],
    Tamil: ["tamil"],
    Telugu: ["telugu"]
  };

  // One Chinese character, kana or Korean syllable says about as much as
  // three letters of an alphabet.
  const SCRIPT_WEIGHT = { han: 3, kana: 3, hangul: 3 };

  // Below this much writing there is too little to judge.
  const MIN_WEIGHT = 16;
  // A translation that is still arriving needs this much before it is judged:
  // eight Chinese characters, or two dozen letters.
  const EARLY_MIN_WEIGHT = 24;
  // A translation counts as written in a language when this share of it is.
  const DOMINANT_SHARE = 0.6;
  // A language counts as showing its own writing (kana for Japanese) from this
  // share on; a single name kept in kana does not make a sentence Japanese.
  const OWN_SCRIPT_SHARE = 0.25;
  // Names and brands in other letters are normal ("Wi-Fi", "Bangkok"). Only
  // when the pair's own writing all but disappears is it another language.
  const MAX_PAIR_SHARE_FOR_THIRD_LANGUAGE = 0.2;

  function scriptsOf(language) {
    return LANGUAGE_SCRIPTS[String(language || "").trim()] || ["latin"];
  }

  // Markers such as "<no speech>" or "{pause}" are not part of the sentence.
  function stripMarkers(text) {
    return String(text || "").replace(/<[^<>]{0,80}>|\{[^{}]{0,80}\}/g, " ");
  }

  // How much of the text is in each writing system.
  function measure(text) {
    const weights = {};
    let total = 0;
    const content = stripMarkers(text);
    for (const char of content) {
      for (let i = 0; i < SCRIPT_RANGES.length; i += 1) {
        if (SCRIPT_RANGES[i][1].test(char)) {
          const script = SCRIPT_RANGES[i][0];
          const weight = SCRIPT_WEIGHT[script] || 1;
          weights[script] = (weights[script] || 0) + weight;
          total += weight;
          break;
        }
      }
    }
    return { weights: weights, total: total };
  }

  function shareOf(measured, scripts) {
    if (!measured.total) return 0;
    let sum = 0;
    for (let i = 0; i < scripts.length; i += 1) {
      sum += measured.weights[scripts[i]] || 0;
    }
    return sum / measured.total;
  }

  // Which of the two languages the text is written in: "A", "B" or "".
  // Japanese and Chinese share characters, so kana decides between them.
  function sideOf(measured, scriptsA, scriptsB) {
    if (measured.total < MIN_WEIGHT) return "";
    const onlyA = scriptsA.filter(function (script) {
      return scriptsB.indexOf(script) === -1;
    });
    const onlyB = scriptsB.filter(function (script) {
      return scriptsA.indexOf(script) === -1;
    });
    if (!onlyA.length && !onlyB.length) return "";
    const shareA = shareOf(measured, scriptsA);
    const shareB = shareOf(measured, scriptsB);
    const hasOnlyA = shareOf(measured, onlyA) >= OWN_SCRIPT_SHARE;
    const hasOnlyB = shareOf(measured, onlyB) >= OWN_SCRIPT_SHARE;
    if (shareA >= DOMINANT_SHARE && shareB < DOMINANT_SHARE) return "A";
    if (shareB >= DOMINANT_SHARE && shareA < DOMINANT_SHARE) return "B";
    if (shareA >= DOMINANT_SHARE && shareB >= DOMINANT_SHARE) {
      // Shared writing: the side with writing of its own wins.
      if (hasOnlyA && !hasOnlyB) return "A";
      if (hasOnlyB && !hasOnlyA) return "B";
      // Japanese is not written without kana: characters with no kana at all
      // are Chinese. A little kana (a name, or Japanese with many characters)
      // stays undecided. No such rule holds for alphabets either: Serbian in
      // Latin letters is not English.
      const kana = measured.weights.kana || 0;
      if (!kana && !onlyA.length && onlyB.length === 1 && onlyB[0] === "kana") return "A";
      if (!kana && !onlyB.length && onlyA.length === 1 && onlyA[0] === "kana") return "B";
    }
    return "";
  }

  // Returns one of:
  //   "ok"              written in one of the two languages, and not the one spoken
  //   "third-language"  written in neither of the two languages
  //   "not-translated"  written in the language it was spoken in
  //   "unknown"         cannot be told (too short, same writing system, ...)
  function checkTranslationLanguage(input) {
    const options = input || {};
    const scriptsA = scriptsOf(options.languageA);
    const scriptsB = scriptsOf(options.languageB);
    const pairScripts = scriptsA.concat(scriptsB);
    const translated = measure(options.translatedText);
    const source = measure(options.sourceText);
    if (translated.total < MIN_WEIGHT) return "unknown";

    const translatedPairShare = shareOf(translated, pairScripts);
    if (translatedPairShare <= MAX_PAIR_SHARE_FOR_THIRD_LANGUAGE) {
      // When what was heard is itself mostly outside the pair's writing (a
      // list of foreign names, say), the translation may rightly be too.
      if (source.total >= MIN_WEIGHT && shareOf(source, pairScripts) < 0.5) {
        return "unknown";
      }
      return "third-language";
    }

    const translatedSide = sideOf(translated, scriptsA, scriptsB);
    if (!translatedSide) return "unknown";
    const sourceSide = sideOf(source, scriptsA, scriptsB);
    if (sourceSide && sourceSide === translatedSide) return "not-translated";
    return "ok";
  }

  // True when the translation should be thrown away and made again.
  function isWrongLanguage(input) {
    const verdict = checkTranslationLanguage(input);
    return verdict === "third-language" || verdict === "not-translated";
  }

  // While a translation is still arriving: true as soon as enough of it is
  // there to see that the sentence is being said back in the language it was
  // spoken in. The caller then stops that answer and asks again, instead of
  // waiting for it to finish.
  //
  // Only for pairs with no writing in common (Chinese and Thai). A Japanese
  // sentence can open with a run of characters and no kana yet, which is how
  // Chinese looks. Answers in a third language are left to the check at the
  // end as well: a translation may rightly begin with a foreign name.
  function isNotTranslatedSoFar(input) {
    const options = input || {};
    const scriptsA = scriptsOf(options.languageA);
    const scriptsB = scriptsOf(options.languageB);
    const shared = scriptsA.some(function (script) {
      return scriptsB.indexOf(script) !== -1;
    });
    if (shared) return false;
    if (measure(options.translatedText).total < EARLY_MIN_WEIGHT) return false;
    return checkTranslationLanguage(options) === "not-translated";
  }

  // Marks that English words do not carry: accented letters and the Spanish
  // opening question and exclamation marks.
  const OTHER_LANGUAGE_MARKS = /[\u00a1\u00bf\u00c0-\u024f\u1e00-\u1eff]/;

  // True when what was "heard" is plainly a sentence in some other language:
  // none of it is in either language's writing, and it carries writing that
  // belongs elsewhere. With nobody speaking, the model that writes down the
  // speech sometimes makes up a short phrase in any language ("¿Qué tal?"
  // for a silent Chinese and Thai turn).
  //
  // Deliberately narrow. A sentence with a single character of the pair's
  // writing is kept, however many foreign names it holds. Plain unaccented
  // letters are kept as well: "Tesco", "OK" or "iPhone 15" is a real answer.
  // Accents only count when neither language is written in Latin letters.
  function isHeardTextOutsidePair(input) {
    const options = input || {};
    const pairScripts = scriptsOf(options.languageA).concat(scriptsOf(options.languageB));
    const content = stripMarkers(options.sourceText);
    const measured = measure(content);
    if (!measured.total) return false;
    let outside = false;
    for (const script in measured.weights) {
      if (pairScripts.indexOf(script) !== -1) return false;
      if (script !== "latin") outside = true;
    }
    return outside || OTHER_LANGUAGE_MARKS.test(content);
  }

  // For words still coming in, before the whole sentence is there: true
  // only when what has been heard so far holds writing that cannot start a
  // sentence of the pair, the Spanish opening marks or a writing system
  // other than Latin letters that neither language uses ("¿Qué",
  // "こんにちは"). Accented Latin letters alone are left to the check on the
  // whole sentence: "Café Amazon" may well go on "在哪", and a turn stopped
  // there would be dropped with only "Café Amazon" heard.
  const SPANISH_OPENING_MARKS = /[\u00a1\u00bf]/;
  function isHeardSoFarOutsidePair(input) {
    const options = input || {};
    const pairScripts = scriptsOf(options.languageA).concat(scriptsOf(options.languageB));
    const content = stripMarkers(options.sourceText);
    const measured = measure(content);
    if (!measured.total) return false;
    let otherWriting = false;
    for (const script in measured.weights) {
      if (pairScripts.indexOf(script) !== -1) return false;
      if (script !== "latin") otherWriting = true;
    }
    return otherWriting || SPANISH_OPENING_MARKS.test(content);
  }

  // Letters and digits only, lower case: "OK!" and "ok" are the same word.
  function bareWords(text) {
    return stripMarkers(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }

  // True when neither side of a finished turn holds a single character of
  // either language's writing, and the translation is not simply the heard
  // words carried over. Nothing of the pair was heard and nothing of the
  // pair came out: very quiet speech or noise, written down as made-up
  // words. Seen on 2026-11-16 with Chinese and Thai: a very quiet Chinese
  // sentence came back heard as "ellos ellos ellos" and translated "No."
  //
  // Plain letters on one side alone are kept, as before: "Tesco" heard and
  // "เทสโก้" said back is a real turn. So is a name kept as it is on both
  // sides ("OK" -> "OK", "iPhone 15" -> "iPhone 15").
  function isTurnOutsidePair(input) {
    const options = input || {};
    const pairScripts = scriptsOf(options.languageA).concat(scriptsOf(options.languageB));
    const heard = measure(options.sourceText);
    const said = measure(options.translatedText);
    if (!heard.total || !said.total) return false;
    if (shareOf(heard, pairScripts) > 0 || shareOf(said, pairScripts) > 0) return false;
    const heardWords = bareWords(options.sourceText);
    const saidWords = bareWords(options.translatedText);
    if (heardWords.indexOf(saidWords) !== -1 || saidWords.indexOf(heardWords) !== -1) {
      return false;
    }
    return true;
  }

  // A recording is taken to hold a voice (or any other sound) once this much
  // of it is louder than a quiet microphone. Loudness is the RMS of a frame,
  // full scale being 1.
  //
  // Set from a real microphone through Chrome (test/fixtures/
  // real-mic-levels.json): with nobody speaking, frames stay under 0.006
  // apart from a stray knock; speech sits between 0.02 and 0.17. This only
  // catches a button held with nothing said. It does not tell speech from
  // noise, and is kept low so that quiet speech is never turned away.
  const SOUND_LEVEL = 0.006;
  const MIN_SOUND_MS = 120;

  // A microphone that has just been opened is not to be trusted for this
  // long: it may start with a click, and its automatic gain has not
  // settled yet, so the room can come through loud. Reported on an iPhone
  // on 2026-11-17 (the cause inferred, not measured there): only
  // the first press after opening the page (or after the microphone had
  // been closed) let a silent recording through, which came back made up
  // as "¿Qué hora es?"; later silent presses, on a microphone already open,
  // were turned away. Kept short, so that a word said straight away still
  // has most of its sound counted.
  const MIC_SETTLE_MS = 300;

  // `frames`: [{ rms, durationMs, settling }], in order. Frames marked
  // `settling` (taken within MIC_SETTLE_MS of the microphone opening) are
  // not counted. They are still sent off with the rest of the recording.
  function recordingHasSound(frames) {
    const list = frames || [];
    let soundMs = 0;
    for (let i = 0; i < list.length; i += 1) {
      const frame = list[i] || {};
      if (frame.settling) continue;
      if ((Number(frame.rms) || 0) >= SOUND_LEVEL) {
        soundMs += Number(frame.durationMs) || 0;
        if (soundMs >= MIN_SOUND_MS) return true;
      }
    }
    return false;
  }

  // Where the voice falls quiet in a recording, for judging whether to let
  // Gemini answer as soon as the speaker stops (instead of when they let go
  // of the button). `frames` as for recordingHasSound; a frame at
  // SOUND_LEVEL or louder is sound. Null if nothing in it is.
  // - speechEndMs: from the start to the end of the last sound.
  // - tailQuietMs: from there to the end of the recording, i.e. how long the
  //   speaker held on after finishing. An answer started `pauseMs` into
  //   that quiet would have come this much minus `pauseMs` sooner.
  // - pauses: quiet stretches of at least `pauseMs` between two sounds. Each
  //   would have started an answer that then had to be thrown away.
  // - longestPauseMs: the longest quiet stretch between two sounds.
  function describeSpeechPauses(frames, pauseMs) {
    const list = frames || [];
    const minPauseMs = Number(pauseMs) > 0 ? Number(pauseMs) : 300;
    let elapsedMs = 0;
    let lastSoundEndMs = null;
    let pauses = 0;
    let longestPauseMs = 0;
    for (let i = 0; i < list.length; i += 1) {
      const frame = list[i] || {};
      const durationMs = Number(frame.durationMs) || 0;
      if (!frame.settling && (Number(frame.rms) || 0) >= SOUND_LEVEL) {
        if (lastSoundEndMs !== null) {
          const quietMs = elapsedMs - lastSoundEndMs;
          if (quietMs >= minPauseMs) pauses += 1;
          if (quietMs > longestPauseMs) longestPauseMs = quietMs;
        }
        lastSoundEndMs = elapsedMs + durationMs;
      }
      elapsedMs += durationMs;
    }
    if (lastSoundEndMs === null) return null;
    return {
      speechEndMs: Math.round(lastSoundEndMs),
      tailQuietMs: Math.round(elapsedMs - lastSoundEndMs),
      pauses: pauses,
      longestPauseMs: Math.round(longestPauseMs)
    };
  }

  return {
    describeSpeechPauses: describeSpeechPauses,
    checkTranslationLanguage: checkTranslationLanguage,
    isWrongLanguage: isWrongLanguage,
    isNotTranslatedSoFar: isNotTranslatedSoFar,
    isHeardTextOutsidePair: isHeardTextOutsidePair,
    isHeardSoFarOutsidePair: isHeardSoFarOutsidePair,
    isTurnOutsidePair: isTurnOutsidePair,
    recordingHasSound: recordingHasSound,
    MIC_SETTLE_MS: MIC_SETTLE_MS
  };
});
