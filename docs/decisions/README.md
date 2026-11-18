# Decisions

Why the translator works the way it does. Each page covers one decision: what
was tried, what was measured, what was chosen, and what is still open.

Read these with three things in mind:

- **Everything is dated.** Speech models change every few months. A result
  here says what was true on the day it was measured, with the model named.
- **Almost everything was measured on Chinese and Thai.** Other pairs work,
  but have not been measured.
- **Sample sizes are small** (30 to 120 clips per comparison) and some
  comparisons had a single judge. Each page says which. Treat a difference of
  a few clips as "no difference shown".

How the measurements are made is described in [../evaluation.md](../evaluation.md).

| # | Decision | Status |
|---|---|---|
| [0001](0001-speech-model.md) | Gemini 3.8 Live does the listening, translating and speaking | In use; a slower, more accurate alternative was turned down |
| [0002](0002-direct-browser-connection.md) | The browser connects to Gemini itself and sends audio while the person speaks | In use |
| [0003](0003-fresh-session-per-sentence.md) | Every sentence gets a fresh session | In use |
| [0004](0004-push-to-talk-over-hands-free.md) | Push to talk only; hands-free is switched off | In use |
| [0005](0005-prompt.md) | The translation instructions, rule by rule | In use |
| [0006](0006-output-checks-and-retries.md) | Checks on every answer, and one retry | In use |
| [0007](0007-transcription-hints.md) | Tell speech-to-text which two languages to expect, except for the model's own speech | In use |
| [0008](0008-iphone-audio.md) | iPhone: microphone closed during playback, tap or hold to record | In use |
