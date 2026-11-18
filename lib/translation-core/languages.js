// Language names, as the page shows them, to the codes each provider takes.

// The page's languages as Gemini Live writes them (BCP-47, from the Live
// API's list of supported languages).
const GEMINI_LANGUAGE_CODES = {
  Chinese: "zh-Hans", English: "en", Japanese: "ja", Korean: "ko", Spanish: "es",
  French: "fr", German: "de", Italian: "it", Portuguese: "pt-BR", Russian: "ru",
  Arabic: "ar", Hindi: "hi", Thai: "th", Vietnamese: "vi", Indonesian: "id",
  Malay: "ms", Dutch: "nl", Polish: "pl", Turkish: "tr", Swedish: "sv",
  Danish: "da", Norwegian: "no", Finnish: "fi", Greek: "el", Hebrew: "he",
  Czech: "cs", Romanian: "ro", Hungarian: "hu", Ukrainian: "uk", Uzbek: "uz",
  Bengali: "bn", Tamil: "ta", Telugu: "te", Marathi: "mr", Urdu: "ur",
  Persian: "fa", Filipino: "fil", Slovak: "sk", Bulgarian: "bg", Croatian: "hr",
  Serbian: "sr", Slovenian: "sl", Lithuanian: "lt", Latvian: "lv", Estonian: "et",
  Catalan: "ca", Basque: "eu", Galician: "gl", Welsh: "cy", Irish: "ga",
  Icelandic: "is", Maltese: "mt", Afrikaans: "af", Swahili: "sw", Zulu: "zu"
};

// The page's language names as OpenAI's transcription takes them
// (ISO-639-1). Filipino has no two-letter code of its own; Tagalog's is used.
function toOpenAiLanguageCode(languageName) {
  if (languageName === "Filipino") return "tl";
  return Object.hasOwn(GEMINI_LANGUAGE_CODES, languageName)
    ? GEMINI_LANGUAGE_CODES[languageName].split("-")[0]
    : "";
}

module.exports = {
  GEMINI_LANGUAGE_CODES,
  toOpenAiLanguageCode
};
