# 0007: Tell speech-to-text which two languages to expect, except for the model's own speech

Status: in use since 2026-11-17. The comparisons are in
`eval/transcription-hint.js`.

## The problem

Each card shows the words that were heard next to the translation. That text is
what lets the speaker see a mishearing and fix it
([0006](0006-output-checks-and-retries.md)), and it is what the language checks
read. Left to guess the language, speech-to-text took a Thai sentence with one
English word in it ("Grab") for English and kept only that word.

## What was measured

Three places where speech is written down, each with and without being told
the language pair, on real recordings.

| Where | Without | With the pair |
|---|---|---|
| Gemini Live's transcript of what it heard (150 recordings) | character error rate 16.1%; 9 sentences mostly lost; 6 came out as English only | 11.2%; 2; 0 |
| `gpt-transcribe`, the fallback for writing down heard words | 9.2% | 8.6%, no group worse |
| Gemini Live's transcript of its own translation (290 recordings) | | barely better, and see below |

## What was chosen

- The transcript of what was heard gets the pair as `languageCodes`.
- `gpt-transcribe` gets the pair. Some codes it refuses outright (Zulu returns
  an error); the request is then sent once more without the hint.
- **The transcript of the model's own translation gets no hint.** With the
  hint, twice the voice said the Thai sentence back untranslated while the
  hinted text showed a Chinese translation. The text looked right and the sound
  was wrong, which hides exactly the failure the page checks the text for.
- For the same reason, when a spoken translation has to be written down
  afterwards, speech-to-text is given the pair and never forced to the expected
  language: a sentence said back untranslated must come out in its own
  language, not look translated.

## The general point

A hint makes a transcript read better. Where the transcript is also the
evidence for a check, a hint can make the evidence agree with what was
expected instead of with what happened.
