const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  checkTranslationLanguage,
  isWrongLanguage,
  isNotTranslatedSoFar
} = require("../public/voice-translator/translation-language.js");

const zhTh = (sourceText, translatedText) =>
  checkTranslationLanguage({
    sourceText,
    translatedText,
    languageA: "Chinese",
    languageB: "Thai"
  });

test("a translation in the other language of the pair is fine, in both directions", () => {
  assert.equal(
    zhTh("你好，请问去曼谷大皇宫怎么走？", "สวัสดีครับ ไปพระบรมมหาราชวังที่กรุงเทพฯ ยังไงครับ"),
    "ok"
  );
  assert.equal(
    zhTh("สวัสดีครับ ไปพระบรมมหาราชวังที่กรุงเทพฯ ยังไงครับ", "你好，请问去曼谷大皇宫怎么走？"),
    "ok"
  );
});

test("the reported case: Chinese in, German out with the pair Chinese and Thai", () => {
  const input = {
    sourceText: "我做了一个就是那个不同语言之间通过语音做翻译的一个工具, 并且我觉得准确率还挺高的。",
    translatedText:
      "Ich habe ein Tool zur Sprachübersetzung zwischen verschiedenen Sprachen entwickelt und ich finde, die Genauigkeit ist ziemlich hoch.",
    languageA: "Chinese",
    languageB: "Thai"
  };
  assert.equal(checkTranslationLanguage(input), "third-language");
  assert.equal(isWrongLanguage(input), true);
  // Also when nothing was heard as text.
  assert.equal(isWrongLanguage({ ...input, sourceText: "" }), true);
});

test("English answers seen in the evaluation are caught", () => {
  assert.equal(zhTh("他制作了一个 WiFi 门铃。", "He made a Wi-Fi doorbell."), "third-language");
  assert.equal(
    zhTh("然后拉卡辛格带头唱了半赞歌。", "From there, Lakkha Singh led in singing praises."),
    "third-language"
  );
});

test("a sentence repeated in the language it was spoken in is caught", () => {
  assert.equal(
    zhTh("我们明天早上 7 点半出发, 下午 4 点之前回来。", "我們明天早上七點半出發,下午四點之前回來。"),
    "not-translated"
  );
  assert.equal(
    zhTh("พรุ่งนี้เราจะออกเดินทางตอนเจ็ดโมงครึ่ง", "พรุ่งนี้เราจะออกเดินทางตอนเจ็ดโมงครึ่ง"),
    "not-translated"
  );
});

test("names and brands in Latin letters do not make a translation wrong", () => {
  assert.equal(zhTh("他制作了一个 WiFi 门铃。", "เขาทำกริ่งประตู Wi-Fi ขึ้นมา"), "ok");
  // Nearly half of this one is a company name: too mixed to call, so it is
  // left alone rather than called wrong.
  assert.equal(
    isWrongLanguage({
      sourceText: "นี่เป็นซีอีพีครั้งที่ 5 ของเมาเทลลี่ในรอบ 4 ปี",
      translatedText: "这是Morrow Telematics四年来的第五次CEP。",
      languageA: "Chinese",
      languageB: "Thai"
    }),
    false
  );
});

test("short answers and stray markers are left alone", () => {
  assert.equal(zhTh("好的。", "ได้ค่ะ"), "unknown");
  assert.equal(zhTh("好的。", "OK"), "unknown");
  assert.equal(zhTh("好的。", "<speaker:default_api:voice>ได้ค่ะ</speaker:default_api:voice>"), "unknown");
  assert.equal(zhTh("", ""), "unknown");
  assert.equal(isWrongLanguage({ sourceText: "好的。", translatedText: "OK", languageA: "Chinese", languageB: "Thai" }), false);
});

test("a translation of mostly foreign names is not judged when the speech was too", () => {
  assert.equal(
    zhTh("Point Marion, Fairmont, Buffalo, Pittsburgh", "Point Marion, Fairmont, Buffalo, Pittsburgh"),
    "unknown"
  );
});

test("pairs that share a writing system cannot be checked for a third language of the same kind", () => {
  const input = {
    sourceText: "I built a tool that translates speech between languages.",
    translatedText: "Ich habe ein Tool zur Sprachübersetzung zwischen Sprachen entwickelt.",
    languageA: "English",
    languageB: "Spanish"
  };
  assert.equal(checkTranslationLanguage(input), "unknown");
  assert.equal(isWrongLanguage(input), false);
  // A different writing system altogether still stands out.
  assert.equal(
    checkTranslationLanguage({ ...input, translatedText: "我做了一个在不同语言之间翻译语音的工具。" }),
    "third-language"
  );
});

test("one Latin language and one other: both directions and the untranslated case", () => {
  const enZh = (sourceText, translatedText) =>
    checkTranslationLanguage({ sourceText, translatedText, languageA: "English", languageB: "Chinese" });
  assert.equal(enZh("Where is the nearest train station?", "最近的火车站在哪里？"), "ok");
  assert.equal(enZh("最近的火车站在哪里？", "Where is the nearest train station?"), "ok");
  assert.equal(enZh("最近的火车站在哪里？", "最近的火車站在哪裡？"), "not-translated");
  assert.equal(enZh("最近的火车站在哪里？", "ที่สถานีรถไฟที่ใกล้ที่สุดอยู่ที่ไหน"), "third-language");
});

test("Chinese and Japanese share characters; kana tells them apart", () => {
  const zhJa = (sourceText, translatedText) =>
    checkTranslationLanguage({ sourceText, translatedText, languageA: "Chinese", languageB: "Japanese" });
  assert.equal(zhJa("最近的火车站在哪里？请告诉我。", "一番近い駅はどこですか。教えてください。"), "ok");
  assert.equal(zhJa("一番近い駅はどこですか。教えてください。", "最近的火车站在哪里？请告诉我。"), "ok");
  assert.equal(zhJa("最近的火车站在哪里？请告诉我。", "最近的火車站在哪裡？請告訴我。"), "not-translated");
  assert.equal(zhJa("最近的火车站在哪里？请告诉我。", "Where is the nearest train station?"), "third-language");
  // A Japanese name kept in kana does not make a Chinese translation wrong.
  assert.equal(
    isWrongLanguage({
      sourceText: "フランスから来た友達と一緒に東京駅へ行きました。",
      translatedText: "我和从フランス来的朋友一起去了东京站，然后在那里吃了午饭。",
      languageA: "Chinese",
      languageB: "Japanese"
    }),
    false
  );
  // Japanese with many characters and little kana is not taken for Chinese.
  assert.equal(zhJa("经济产业省发表了新的事业计划", "経済産業省は新規事業計画を発表した"), "unknown");
  assert.equal(zhJa("経済産業省は新規事業計画を発表した", "经济产业省发表了新的事业计划"), "ok");
});

test("Serbian in Latin letters is not mistaken for another language", () => {
  const sr = (other, sourceText, translatedText) =>
    checkTranslationLanguage({ sourceText, translatedText, languageA: "Serbian", languageB: other });
  assert.equal(
    isWrongLanguage({
      sourceText: "Where is the train station, please?",
      translatedText: "Gde je železnička stanica, molim vas?",
      languageA: "Serbian",
      languageB: "English"
    }),
    false
  );
  assert.equal(sr("Chinese", "请问火车站在哪里？谢谢你。", "Gde je železnička stanica, molim vas?"), "ok");
  assert.equal(sr("Chinese", "请问火车站在哪里？谢谢你。", "Где је железничка станица, молим вас?"), "ok");
  assert.equal(sr("Chinese", "请问火车站在哪里？谢谢你。", "請問火車站在哪裡？謝謝你。"), "not-translated");
});

test("replaying the saved evaluation translations flags only real mistakes", (t) => {
  const file = path.join(__dirname, "..", "eval", "results", "2026-11-15", "outputs.jsonl");
  if (!fs.existsSync(file)) {
    t.skip("evaluation results are not in this checkout");
    return;
  }
  const flagged = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const verdict = zhTh(row.heardText, row.outputText);
    if (verdict === "third-language" || verdict === "not-translated") {
      flagged.push(`${verdict}:${row.system}:${row.sampleId}:${row.pass}`);
    }
  }
  // Read one by one on 2026-11-15: each of these really is in the wrong language.
  assert.deepEqual(flagged.sort(), [
    "not-translated:gemini-direct:sc-zh-06:2",
    "not-translated:gemini-handsfree-normalized:fleurs-zh-1519:1",
    "third-language:gemini-handsfree:fleurs-zh-1554:2",
    "third-language:gemini-handsfree:fleurs-zh-1578:1"
  ]);
});

test("while it is still arriving: a sentence said back untranslated is caught after a few words", () => {
  const soFar = (sourceText, translatedText, languageA = "Chinese", languageB = "Thai") =>
    isNotTranslatedSoFar({ sourceText, translatedText, languageA, languageB });
  const heard = "我想问一下这个东西多少钱，可以便宜一点吗？";
  // Too little to judge yet.
  assert.equal(soFar(heard, "我想问一下"), false);
  // Eight characters of the same Chinese: enough.
  assert.equal(soFar(heard, "我想问一下这个东"), true);
  // The other way round.
  assert.equal(
    soFar("ห้องน้ำอยู่ที่ไหนครับ ช่วยบอกทางหน่อย", "ห้องน้ำอยู่ที่ไหนครับ ช่วยบอก"),
    true
  );
  // A real translation never trips it, however much of it has arrived.
  const thai = "ขอถามหน่อยว่าอันนี้ราคาเท่าไหร่ ลดได้ไหม";
  for (let length = 1; length <= thai.length; length += 1) {
    assert.equal(soFar(heard, thai.slice(0, length)), false);
  }
  // Nothing heard as text yet: cannot be told.
  assert.equal(soFar("", "我想问一下这个东西多少钱"), false);
  assert.equal(soFar("我想", "我想问一下这个东西多少钱"), false);
  // An answer in a third language is left to the check at the end.
  assert.equal(soFar(heard, "I would like to ask how much this is"), false);
  // Japanese may open with characters alone, which is how Chinese looks.
  assert.equal(soFar(heard, "東京都渋谷区神宮前一丁目", "Chinese", "Japanese"), false);
  assert.equal(soFar("How much is this one, please?", "How much is this one, please?", "English", "German"), false);
});

test("a sentence said back and then translated is caught (reported 2026-11-18)", () => {
  const heard = "然后万一我偷偷跟别的女人聊天了怎么办呀?";
  const thai = "แล้วถ้าฉันแอบไปคุยกับผู้หญิงคนอื่นล่ะจะทำยังไง?";
  assert.equal(zhTh(heard, heard + thai), "not-translated");
  assert.equal(isWrongLanguage({ sourceText: heard, translatedText: heard + thai, languageA: "Chinese", languageB: "Thai" }), true);
  // Translation first, the sentence after it; or with its wording a little changed.
  assert.equal(zhTh(heard, thai + " " + heard), "not-translated");
  assert.equal(zhTh(heard, "然后万一我偷偷跟别的女人聊天了怎么办？" + thai), "not-translated");
  // The other way round.
  const heardThai = "ห้องน้ำอยู่ที่ไหนครับ ช่วยบอกทางหน่อย";
  assert.equal(zhTh(heardThai, heardThai + "请问洗手间在哪里？麻烦告诉我怎么走。"), "not-translated");
  // A Thai translation alone is still fine.
  assert.equal(zhTh(heard, thai), "ok");
});

test("names kept from the sentence are not taken for a sentence said back", () => {
  // A Chinese name or a Thai place kept in the translation.
  assert.equal(zhTh("我叫王小明，我在曼谷工作了三年多了。", "ฉันชื่อ 王小明 ฉันทำงานที่กรุงเทพฯ มาสามปีกว่าแล้ว"), "ok");
  // (Too mixed to say which language it is in; it is not thrown away.)
  assert.equal(
    isWrongLanguage({
      sourceText: "พรุ่งนี้เราไปเที่ยวตลาดน้ำดำเนินสะดวกกันไหมครับ ไปแต่เช้าเลย",
      translatedText: "明天我们去ดำเนินสะดวก水上市场玩吧？一大早就出发。",
      languageA: "Chinese",
      languageB: "Thai"
    }),
    false
  );
  // A long English name, with Thai and English.
  assert.equal(
    isWrongLanguage({
      sourceText: "Do you sell the Samsung Galaxy Ultra here?",
      translatedText: "ที่นี่ขาย Samsung Galaxy Ultra ไหมครับ",
      languageA: "English",
      languageB: "Thai"
    }),
    false
  );
});

test("a word or two left in the speaker's language is caught (reported 2026-11-18)", () => {
  const heard = "不着急不着急, 我就是想到了, 我就提醒你一下。";
  const said = "不用รีบนะครับ พอดีนึกขึ้นได้เลยเตือนคุณไว้ก่อนครับ";
  assert.equal(zhTh(heard, said), "partly-translated");
  assert.equal(isWrongLanguage({ sourceText: heard, translatedText: said, languageA: "Chinese", languageB: "Thai" }), true);
  // Short answers too: this is not a matter of how much was written.
  assert.equal(zhTh("你要往不好的想想, 那就是心眼太多了。", "如果คิดมาก"), "partly-translated");
  // The other way round: Thai words nobody said, in a Chinese answer.
  assert.equal(
    zhTh("พรุ่งนี้เราไปเที่ยวตลาดน้ำกันไหมครับ ไปแต่เช้าเลย", "明天我们去水上市场玩吧？ไปกัน一大早就出发。"),
    "partly-translated"
  );
  // A name kept as it was said is not: 王小明, and a Thai name in two parts.
  assert.equal(zhTh("我叫王小明，我在曼谷工作了三年多了。", "ฉันชื่อ 王小明 ฉันทำงานที่กรุงเทพฯ มาสามปีกว่าแล้ว"), "ok");
  assert.notEqual(
    zhTh("สวัสดีครับ วันนี้เราคุยกับคุณปริญญา เทวานฤมิตรกุล เรื่องกฎหมาย", "大家好，今天我们和ปริญญา เทวานฤมิตรกุล聊聊法律。"),
    "partly-translated"
  );
  // The same Thai written with its vowel in two parts, as Gemini writes its own speech.
  assert.notEqual(
    zhTh("พรุ่งนี้เราไปเที่ยวตลาดน้ำดำเนินสะดวกกันไหมครับ", "明天我们去ดําเนินสะดวก水上市场玩吧？"),
    "partly-translated"
  );
  // Too little heard to know which language was spoken: left alone.
  assert.equal(zhTh("好的", "不用รีบนะครับ"), "unknown");
  // A Thai place written with its shorthand mark is still the place that was said.
  assert.notEqual(zhTh("ฉันอยู่ที่กรุงเทพมาสามปีกว่าแล้วครับ", "我住在กรุงเทพฯ已经三年多了。"), "partly-translated");
  // A sentence said back with a word changed is still "not-translated",
  // and is still stopped while it is arriving.
  const heardBack = "然后万一我偷偷跟别的女人聊天了怎么办呀?";
  const saidBack = "然后万一我偷偷和别的女人聊天了怎么办呀?แล้ว";
  assert.equal(zhTh(heardBack, saidBack), "not-translated");
  assert.equal(
    isNotTranslatedSoFar({ sourceText: heardBack, translatedText: saidBack, languageA: "Chinese", languageB: "Thai" }),
    true
  );
  assert.equal(
    isNotTranslatedSoFar({
      sourceText: "我们明天去台湾吃饭吧好不好呀",
      translatedText: "我們明天去台灣吃飯吧好不好呀 พรุ่ง",
      languageA: "Chinese",
      languageB: "Thai"
    }),
    true
  );
  // Latin letters are never judged this way.
  assert.equal(
    isWrongLanguage({
      sourceText: "Could you tell me where the station is?",
      translatedText: "ช่วยบอกหน่อยได้ไหมว่า station อยู่ที่ไหน Please",
      languageA: "English",
      languageB: "Thai"
    }),
    false
  );
  // Chinese and Japanese share characters: not judged.
  assert.notEqual(
    checkTranslationLanguage({
      sourceText: "駅はどこにありますか、教えてください。",
      translatedText: "请问车站在哪里？ください",
      languageA: "Chinese",
      languageB: "Japanese"
    }),
    "partly-translated"
  );
});

test("while it is still arriving: the heard words coming after a said-back sentence still stop it", () => {
  const heard = "然后万一我偷偷跟别的女人聊天了怎么办呀?";
  const said = heard + "แล้วถ้าฉันแอบ";
  // The heard words had not come yet: cannot be told.
  assert.equal(isNotTranslatedSoFar({ sourceText: "", translatedText: said, languageA: "Chinese", languageB: "Thai" }), false);
  // Once they come, it is.
  assert.equal(isNotTranslatedSoFar({ sourceText: heard, translatedText: said, languageA: "Chinese", languageB: "Thai" }), true);
});

const {
  isHeardTextOutsidePair,
  recordingHasSound
} = require("../public/voice-translator/translation-language.js");

test("heard text made up from silence is spotted (Chinese and Thai)", () => {
  const pair = { languageA: "Chinese", languageB: "Thai" };
  // What a silent turn came back with on 2026-11-16.
  assert.equal(isHeardTextOutsidePair({ ...pair, sourceText: "¿Qué tal?" }), true);
  assert.equal(isHeardTextOutsidePair({ ...pair, sourceText: "こんにちは" }), true);
  assert.equal(isHeardTextOutsidePair({ ...pair, sourceText: "Привет" }), true);
  assert.equal(isHeardTextOutsidePair({ ...pair, sourceText: "감사합니다" }), true);
});

test("real sentences with foreign words in them are kept", () => {
  const pair = { languageA: "Chinese", languageB: "Thai" };
  const kept = [
    "明天我要去tesco买iPhone",
    "Señor 王明天来",
    "ไป Tesco กัน",
    // Plain letters alone are a real answer, not another language.
    "Tesco",
    "OK",
    "iPhone 15",
    "Thank you",
    // Nothing to judge.
    "",
    "<no speech>",
    "123"
  ];
  for (const sourceText of kept) {
    assert.equal(isHeardTextOutsidePair({ ...pair, sourceText }), false, sourceText);
  }
});

test("accents mean nothing when a language of the pair is written in Latin letters", () => {
  const pair = { languageA: "English", languageB: "Spanish" };
  assert.equal(isHeardTextOutsidePair({ ...pair, sourceText: "¿Qué tal?" }), false);
  assert.equal(isHeardTextOutsidePair({ ...pair, sourceText: "你好" }), true);
  assert.equal(
    isHeardTextOutsidePair({ languageA: "Chinese", languageB: "English", sourceText: "Café" }),
    false
  );
});

test("a recording with nothing said holds no sound; one with speech does (real microphone)", () => {
  const capture = require("./fixtures/real-mic-levels.json");
  const frames = capture.levels.map((level) => ({
    rms: level / 10000,
    durationMs: capture.frameMs
  }));
  // 8.4 s to 12.6 s: nobody speaking. 12.8 s to 18.3 s: a Chinese sentence.
  assert.equal(recordingHasSound(frames.slice(99, 148)), false);
  assert.equal(recordingHasSound(frames.slice(150, 215)), true);
  // A single short word, about a quarter of a second, among silence.
  assert.equal(recordingHasSound(frames.slice(99, 148).concat(frames.slice(151, 154))), true);
  // One stray knock is not a voice.
  assert.equal(
    recordingHasSound([
      { rms: 0.002, durationMs: 85 },
      { rms: 0.05, durationMs: 85 },
      { rms: 0.002, durationMs: 85 }
    ]),
    false
  );
  assert.equal(recordingHasSound([]), false);
});

const { isTurnOutsidePair } = require("../public/voice-translator/translation-language.js");

test("a turn with none of the pair's writing on either side is made up (Chinese and Thai)", () => {
  const pair = { languageA: "Chinese", languageB: "Thai" };
  // 2026-11-16: a very quiet Chinese sentence, heard and translated as this.
  assert.equal(
    isTurnOutsidePair({ ...pair, sourceText: "ellos ellos ellos", translatedText: "No." }),
    true
  );
  assert.equal(
    isTurnOutsidePair({ ...pair, sourceText: "Thank you for watching", translatedText: "Gracias." }),
    true
  );
});

test("turns with the pair's writing on either side, or a word kept as it is, are real", () => {
  const pair = { languageA: "Chinese", languageB: "Thai" };
  const kept = [
    ["Tesco", "เทสโก้"],
    ["OK", "好的"],
    ["OK", "OK"],
    ["OK", "Okay."],
    ["iPhone 15", "iPhone 15"],
    ["Starbucks", "Starbucks!"],
    ["你好", "Hello"],
    ["Hello", "สวัสดี"],
    // Nothing to judge on one side: left to the other checks.
    ["ellos ellos ellos", ""],
    ["", "No."],
    ["<no speech>", "No."],
    ["123", "123"]
  ];
  for (const [sourceText, translatedText] of kept) {
    assert.equal(
      isTurnOutsidePair({ ...pair, sourceText, translatedText }),
      false,
      `${sourceText} -> ${translatedText}`
    );
  }
});

test("a pair written in Latin letters is never judged this way", () => {
  assert.equal(
    isTurnOutsidePair({
      languageA: "English",
      languageB: "Thai",
      sourceText: "ellos ellos ellos",
      translatedText: "No."
    }),
    false
  );
});

test("sound while a just-opened microphone settles is not taken for a voice", () => {
  const { MIC_SETTLE_MS } = require("../public/voice-translator/translation-language.js");
  const frameMs = 85.33;
  const settling = Math.ceil(MIC_SETTLE_MS / frameMs);
  const frame = (rms, index) => ({ rms, durationMs: frameMs, settling: index < settling });
  // A click and loud room noise at the start, then a quiet microphone:
  // the first press after the page opened, with nothing said.
  const silentFirstPress = [0.05, 0.02, 0.012, 0.008, 0.003, 0.002, 0.002, 0.002, 0.002].map(frame);
  assert.equal(recordingHasSound(silentFirstPress), false);
  // The same frames on a microphone that was already open do count.
  assert.equal(recordingHasSound(silentFirstPress.map((f) => ({ ...f, settling: false }))), true);
  // A short word said straight away, a third of a second in, still counts.
  const quickWord = [0.004, 0.004, 0.004, 0.004, 0.03, 0.04, 0.02, 0.003].map(frame);
  assert.equal(recordingHasSound(quickWord), true);
});

test("words still coming in are judged outside the pair as soon as they plainly are", () => {
  const { isHeardSoFarOutsidePair } = require("../public/voice-translator/translation-language.js");
  const pair = { languageA: "Chinese", languageB: "Thai" };
  // 2026-11-17: a silent first press, heard as this, word by word.
  assert.equal(isHeardSoFarOutsidePair({ ...pair, sourceText: "¿Qué" }), true);
  assert.equal(isHeardSoFarOutsidePair({ ...pair, sourceText: "こんにちは" }), true);
  // The start of real sentences is not, nor a name with accents that the
  // rest of the sentence may follow ("Café Amazon 在哪").
  for (const sourceText of ["我", "我想", "ผม", "Tesco", "OK 我", "iPhone", "Café Amazon", "Pokémon"]) {
    assert.equal(isHeardSoFarOutsidePair({ ...pair, sourceText }), false, sourceText);
  }
});

test("where the voice falls quiet: the quiet after the last sound and the pauses within", () => {
  const { describeSpeechPauses } = require("../public/voice-translator/translation-language.js");
  const frameMs = 100;
  const frames = (levels, settling = 0) =>
    levels.map((rms, index) => ({ rms, durationMs: frameMs, settling: index < settling }));
  // Speech, a 0.2 s breath, speech, a 0.4 s pause, speech, then 0.6 s held.
  const turn = frames([0.03, 0.04, 0.002, 0.001, 0.05, 0.003, 0.002, 0.002, 0.001, 0.04, 0.002, 0.002, 0.001, 0.002, 0.002, 0.002]);
  assert.deepEqual(describeSpeechPauses(turn, 300), {
    speechEndMs: 1000,
    tailQuietMs: 600,
    pauses: 1,
    longestPauseMs: 400
  });
  // Counted against a longer quiet, the 0.4 s pause no longer counts.
  assert.equal(describeSpeechPauses(turn, 500).pauses, 0);
  // Let go straight after the last word.
  assert.equal(describeSpeechPauses(frames([0.002, 0.03, 0.04]), 300).tailQuietMs, 0);
  // A click while the microphone settles is not the start of the speech.
  assert.deepEqual(describeSpeechPauses(frames([0.05, 0.002, 0.002, 0.002, 0.002, 0.03], 1), 300), {
    speechEndMs: 600,
    tailQuietMs: 0,
    pauses: 0,
    longestPauseMs: 0
  });
  assert.equal(describeSpeechPauses(frames([0.002, 0.001]), 300), null);
  assert.equal(describeSpeechPauses([], 300), null);
});

test("where the voice falls quiet, on a real microphone", () => {
  const { describeSpeechPauses } = require("../public/voice-translator/translation-language.js");
  const capture = require("./fixtures/real-mic-levels.json");
  const frames = capture.levels.map((level) => ({ rms: level / 10000, durationMs: capture.frameMs }));
  // 12.8 s to 18.3 s holds a Chinese sentence; add a second of quiet after it.
  const sentence = describeSpeechPauses(frames.slice(150, 215).concat(frames.slice(100, 112)), 300);
  assert.ok(sentence);
  assert.ok(sentence.tailQuietMs >= 1000, `held on ${sentence.tailQuietMs} ms`);
});

test("an answer holding a small part of what was heard is made again", () => {
  // A real answer (saved evaluation turn ramc-zh-03): only the last clause.
  const heard = "就是成就感比较低, 自己不会做题什么的, 然后导数也是。";
  const said = "แล้วก็เรื่องอนุพันธ์ด้วย";
  assert.equal(zhTh(heard, said), "much-shorter");
  assert.equal(isWrongLanguage({ sourceText: heard, translatedText: said, languageA: "Chinese", languageB: "Thai" }), true);
  // Any pair: judged by length, not writing.
  assert.equal(
    checkTranslationLanguage({
      sourceText: "Kailangan kong pumunta sa ospital ngayon dahil masakit ang tiyan ko mula kagabi pa",
      translatedText: "Hospital.",
      languageA: "Filipino",
      languageB: "English"
    }),
    "much-shorter"
  );
  // A whole translation that is shorter, as Chinese usually is, stays.
  assert.equal(
    zhTh(
      "ไม่รู้ฉันยังไม่หาแต่ฉันก็ดูในเน็ตอยู่มันมีหาดที่เราไปกินข้าววันแรก",
      "不知道我还没找，但我正在网上看，有一个我们第一天去吃饭的沙滩。"
    ),
    "ok"
  );
  // A short sentence and its short reply are not judged.
  assert.notEqual(zhTh("好的好的，没问题", "ได้"), "much-shorter");
  // Text that stopped halfway says nothing about the answer's length.
  assert.equal(
    checkTranslationLanguage({
      sourceText: heard,
      translatedText: said,
      languageA: "Chinese",
      languageB: "Thai",
      translationIncomplete: true
    }),
    "ok"
  );
  // Nor does a missing one, or writing whose pace was not measured.
  assert.equal(zhTh(heard, ""), "unknown");
  assert.notEqual(
    checkTranslationLanguage({
      sourceText: "오늘 저녁에 같이 시장에 가서 해산물을 사고 집에서 요리해 먹을까요",
      translatedText: "去市场",
      languageA: "Korean",
      languageB: "Chinese"
    }),
    "much-shorter"
  );
});

test("a translation longer than anything said in the recording is made up", () => {
  const { isTooLongForRecording } = require("../public/voice-translator/translation-language.js");
  const tooLong = (translatedText, recordingSeconds) => isTooLongForRecording({ translatedText, recordingSeconds });
  // A brief press that came back as a whole sentence.
  assert.equal(tooLong("你好，我想问一下这附近有没有便利店？", 0.5), true);
  assert.equal(tooLong("Hello, how are you doing today? I am looking for the train station.", 1), true);
  // Short words fit in a short press.
  assert.equal(tooLong("ครับ", 0.4), false);
  assert.equal(tooLong("สวัสดีครับ", 0.6), false);
  assert.equal(tooLong("Thank you very much.", 0.7), false);
  // The longest translation of a real recording in the evaluation set
  // (ramc-zh-18, 6.44 s): well inside the allowance.
  assert.equal(
    tooLong(
      "เมื่อเช้านี้ เพราะว่าฉันยังสอบผ่านระดับสี่ไม่ได้เลย ทั้งที่อยู่ปีสามแล้ว ก็เลยต้องไปสอบอีกครั้ง และรู้สึกกดดันมากจริงๆ เพราะว่าถ้าไม่ผ่านอีกก็ไม่รู้จะทำยังไงดี",
      6.44
    ),
    false
  );
  // Without a recording's length, nothing is judged.
  assert.equal(tooLong("你好，我想问一下这附近有没有便利店？", 0), false);
  assert.equal(tooLong("你好，我想问一下这附近有没有便利店？", undefined), false);
});
