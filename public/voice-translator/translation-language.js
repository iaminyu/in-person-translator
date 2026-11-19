// Checks that a translation came out in the language it should be in.
//
// Now and then the model answers in a language outside the chosen pair
// (Chinese in, German or English out when the pair is Chinese and Thai), or
// repeats the sentence in the language it was spoken in (alone, or before its
// translation). These are judged here
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
  //   "partly-translated"  translated, but with words of the speaker's
  //                     language in it that the speaker did not say
  //   "much-shorter"    far shorter than what was heard: most of it was left
  //                     out (see isMuchShorterThanHeard). `translationIncomplete`:
  //                     the text stopped halfway, so its length says nothing.
  //   "unknown"         cannot be told (too short, same writing system, ...)
  function checkTranslationLanguage(input) {
    const options = input || {};
    const scriptsA = scriptsOf(options.languageA);
    const scriptsB = scriptsOf(options.languageB);
    const verdict = checkWholeAnswer(options, scriptsA, scriptsB);
    // Asked last, and only of an answer nothing else is held against: a
    // sentence said back with a word changed stays "not-translated", which
    // is what stops it while it is still arriving.
    if (
      (verdict === "ok" || verdict === "unknown") &&
      leavesWordsUntranslated(options, measure(options.sourceText), scriptsA, scriptsB)
    ) {
      return "partly-translated";
    }
    // Judged by length alone, so for any pair, but after the language: an
    // answer in the wrong language is that first.
    if ((verdict === "ok" || verdict === "unknown") && isMuchShorterThanHeard(options)) {
      return "much-shorter";
    }
    return verdict;
  }

  function checkWholeAnswer(options, scriptsA, scriptsB) {
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
    const sourceSide = sideOf(source, scriptsA, scriptsB);
    if (translatedSide && sourceSide === translatedSide) return "not-translated";
    if (sourceSide && saysSentenceBack(options, sourceSide === "A" ? scriptsA : scriptsB, sourceSide === "A" ? scriptsB : scriptsA)) {
      return "not-translated";
    }
    if (!translatedSide) return "unknown";
    return "ok";
  }

  // Writing of one kind only, letters and characters alone.
  function textInScripts(text, scripts) {
    let kept = "";
    for (const char of stripMarkers(text)) {
      for (let i = 0; i < SCRIPT_RANGES.length; i += 1) {
        if (SCRIPT_RANGES[i][1].test(char)) {
          if (scripts.indexOf(SCRIPT_RANGES[i][0]) !== -1) kept += char;
          break;
        }
      }
    }
    return kept;
  }

  function pairsOf(text) {
    const chars = Array.from(text);
    const pairs = [];
    for (let i = 0; i + 1 < chars.length; i += 1) pairs.push(chars[i] + chars[i + 1]);
    return pairs;
  }

  // The answer says the sentence back in the language it was spoken in and
  // then (or first) translates it. Seen on 2026-11-18 with Chinese and Thai:
  // "然后万一我偷偷跟别的女人聊天了怎么办呀?แล้วถ้าฉันแอบไปคุย...", the
  // heard sentence word for word, then its Thai. Half of each, so the check
  // above could not tell which language the answer was in.
  //
  // Judged by the speaker's own writing that the other language does not use
  // (Chinese characters against Thai). It counts when the answer holds at
  // least half of the heard sentence in it, made of the same runs of letters.
  // Latin letters are not judged this way: an answer in Thai may rightly keep
  // a long English name ("Samsung Galaxy S24 Ultra") from the sentence.
  const SAID_BACK_SHARE_OF_HEARD = 0.5;
  const SAID_BACK_MATCHING_PAIRS = 0.6;
  function saysSentenceBack(options, sourceScripts, otherScripts) {
    const ownScripts = sourceScripts.filter(function (script) {
      return script !== "latin" && otherScripts.indexOf(script) === -1;
    });
    if (!ownScripts.length) return false;
    const heard = textInScripts(options.sourceText, ownScripts);
    const said = textInScripts(options.translatedText, ownScripts);
    const heardWeight = measure(heard).total;
    const saidWeight = measure(said).total;
    if (saidWeight < MIN_WEIGHT || saidWeight < heardWeight * SAID_BACK_SHARE_OF_HEARD) {
      return false;
    }
    const heardPairs = new Set(pairsOf(heard));
    const saidPairs = pairsOf(said);
    if (!saidPairs.length) return false;
    let matching = 0;
    for (let i = 0; i < saidPairs.length; i += 1) {
      if (heardPairs.has(saidPairs[i])) matching += 1;
    }
    return matching / saidPairs.length >= SAID_BACK_MATCHING_PAIRS;
  }

  // Runs of writing of the given kinds, each a string of letters with
  // nothing else between them.
  // The Thai marks for "and so on" and "said twice" are not letters: a
  // name may be written with or without them ("กรุงเทพฯ").
  const THAI_SHORTHAND_MARK = /[\u0e2f\u0e46]/;
  function runsInScripts(text, scripts) {
    const runs = [];
    let run = "";
    for (const char of stripMarkers(text).normalize("NFKC")) {
      let own = false;
      for (let i = 0; i < SCRIPT_RANGES.length && !THAI_SHORTHAND_MARK.test(char); i += 1) {
        if (SCRIPT_RANGES[i][1].test(char)) {
          own = scripts.indexOf(SCRIPT_RANGES[i][0]) !== -1;
          break;
        }
      }
      if (own) {
        run += char;
      } else if (run) {
        runs.push(run);
        run = "";
      }
    }
    if (run) runs.push(run);
    return runs;
  }

  // The answer is a translation, but a word or two of it stayed in the
  // speaker's language. Seen on 2026-11-18 with Chinese and Thai:
  // "不着急不着急, 我就是想到了..." came back as "不用รีบนะครับ พอดี...",
  // two Chinese characters and then Thai. Far too little Chinese for the
  // checks on the whole answer to notice.
  //
  // A name kept as the speaker said it ("ฉันชื่อ 王小明") is a good
  // translation, so only writing that is nowhere in the heard sentence
  // counts: "不用" was never said, "王小明" was. A word left over that the
  // speaker did say ("ฉัน还ยัง..." for "...我四级还没有过") is not caught.
  //
  // Only for pairs with no writing in common (Chinese and Thai), only when
  // it is clear which of the two was spoken, and never for Latin letters,
  // which turn up in any language.
  function leavesWordsUntranslated(options, source, scriptsA, scriptsB) {
    const shared = scriptsA.some(function (script) {
      return scriptsB.indexOf(script) !== -1;
    });
    if (shared) return false;
    const sourceSide = sideOf(source, scriptsA, scriptsB);
    if (!sourceSide) return false;
    const sourceScripts = (sourceSide === "A" ? scriptsA : scriptsB).filter(function (script) {
      return script !== "latin";
    });
    const otherScripts = (sourceSide === "A" ? scriptsB : scriptsA).filter(function (script) {
      return script !== "latin";
    });
    if (!sourceScripts.length || !otherScripts.length) return false;
    // Not a translation at all is judged by the other checks.
    if (!runsInScripts(options.translatedText, otherScripts).length) return false;
    const leftOver = runsInScripts(options.translatedText, sourceScripts);
    if (!leftOver.length) return false;
    // What was heard, with everything but its own writing taken out, so a
    // name is found whatever stood between its parts.
    const heard = runsInScripts(options.sourceText, sourceScripts).join("");
    for (let i = 0; i < leftOver.length; i += 1) {
      if (heard.indexOf(leftOver[i]) === -1) return true;
    }
    return false;
  }

  // --- Length -----------------------------------------------------------
  // How long a text takes to say at an ordinary pace, for comparing a
  // translation with what was heard and with the recording. Measured on
  // 2,620 saved answers to real Chinese and Thai speech (2026-11-18): at
  // these rates a translation came out at 0.59x to 2.8x the length of the
  // heard sentence (1 in 100 under 0.59x), and English (FLEURS) at 0.59x to
  // 1.55x of the same sentence in Thai or Chinese. Other writing is not
  // measured, so a text with much of it is not judged.
  const SPEAKING_RATE = { han: 4.5, thai: 12, latin: 13, digit: 3 };
  const HAN_LETTER = /\p{Script=Han}/u;
  const THAI_LETTER = /\p{Script=Thai}/u;
  const LATIN_LETTER = /\p{Script=Latin}/u;
  const DIGIT = /\p{Nd}/u;
  const NOT_SPOKEN = /[\s\p{P}\p{S}\p{M}]/u;
  const MAX_UNMEASURED_SHARE = 0.1;

  // Seconds at an ordinary pace, or null when too much of the text is in
  // writing whose pace was not measured.
  function speakingSeconds(text) {
    let seconds = 0;
    let letters = 0;
    let unmeasured = 0;
    for (const char of stripMarkers(text).normalize("NFC")) {
      if (NOT_SPOKEN.test(char)) continue;
      letters += 1;
      if (HAN_LETTER.test(char)) seconds += 1 / SPEAKING_RATE.han;
      else if (THAI_LETTER.test(char)) seconds += 1 / SPEAKING_RATE.thai;
      else if (LATIN_LETTER.test(char)) seconds += 1 / SPEAKING_RATE.latin;
      else if (DIGIT.test(char)) seconds += 1 / SPEAKING_RATE.digit;
      else unmeasured += 1;
    }
    if (!letters || unmeasured / letters > MAX_UNMEASURED_SHARE) return null;
    return seconds;
  }

  // A translation that holds a small part of what was heard: "就是成就感比较
  // 低, 自己不会做题什么的, 然后导数也是。" came back as "แล้วก็เรื่องอนุพันธ์
  // ด้วย" ("and the derivatives too"), 0.39x its length. Of the 2,620 saved
  // answers, the two under 0.4x were both failures (the other answered "The
  // audio is incomplete."); trial users' recordings show the same on the
  // site, a 26-32 s sentence answered in about a second. Only for a heard
  // sentence of 3 s or more, so a short reply ("好的" -> "OK") is never
  // judged; text that is missing or stopped halfway is judged elsewhere.
  const SHORTEST_SHARE_OF_HEARD = 0.4;
  const MIN_HEARD_SECONDS_FOR_LENGTH = 3;
  function isMuchShorterThanHeard(options) {
    if (options.translationIncomplete) return false;
    const translated = speakingSeconds(options.translatedText);
    const heard = speakingSeconds(options.sourceText);
    if (!translated || heard === null || heard < MIN_HEARD_SECONDS_FOR_LENGTH) return false;
    return translated < SHORTEST_SHARE_OF_HEARD * heard;
  }

  // A translation far longer than anything that fits in the recording: the
  // words were made up. On the site a 0.5 s press came back as 3.4 s of
  // speech and a 2.6 s one as 23.6 s (trial users, Aug-Nov 2026). Over the
  // 2,608 saved real recordings, no translation took more than 2.4x the
  // recording's length to say; the allowance is wider still, and 1 s more
  // for a short phrase that grows in translation ("加油" -> "Keep going, you
  // can do it!").
  const LONGEST_SHARE_OF_RECORDING = 2.5;
  const RECORDING_ALLOWANCE_SECONDS = 1;
  function isTooLongForRecording(input) {
    const options = input || {};
    const recordingSeconds = Number(options.recordingSeconds);
    if (!Number.isFinite(recordingSeconds) || recordingSeconds <= 0) return false;
    const translated = speakingSeconds(options.translatedText);
    if (!translated) return false;
    return (
      translated >
      LONGEST_SHARE_OF_RECORDING * recordingSeconds + RECORDING_ALLOWANCE_SECONDS
    );
  }

  // True when the translation should be thrown away and made again.
  function isWrongLanguage(input) {
    const verdict = checkTranslationLanguage(input);
    return (
      verdict === "third-language" ||
      verdict === "not-translated" ||
      verdict === "partly-translated" ||
      verdict === "much-shorter"
    );
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
    isTooLongForRecording: isTooLongForRecording,
    speakingSeconds: speakingSeconds,
    recordingHasSound: recordingHasSound,
    MIC_SETTLE_MS: MIC_SETTLE_MS
  };
});
