# 0001: Gemini 3.8 Live does the listening, translating and speaking

Status: in use since 2026-11-15. A slower, more accurate alternative was
considered and turned down on 2026-11-17; see "The slower, more accurate
alternative" below.

## The question

One person speaks, the other has to hear it in their language. Which model, or
chain of models, gets the meaning across most often, and how long does the
listener wait?

## What was compared

First round, 2026-11-15. 60 read recordings (FLEURS, Thai and Mandarin) and 40
hand-written travel sentences in synthetic voices, each run twice. Two
independent judges (one OpenAI text model, one Gemini text model) who could not
see which system produced a translation. A "serious error" below is one both
judges called serious: the listener would get wrong or clearly incomplete
information.

| System | Serious errors, read recordings (120 runs) | Serious errors, travel sentences (80 runs) |
|---|---|---|
| `gpt-realtime-2.1`, speech in and speech out | 21 (17.5%) | 7 (8.8%) |
| `gemini-3.8-live`, speech in and speech out, recording uploaded after release | 9 (7.5%) | 3 (3.8%) |
| `gemini-3.8-live`, audio sent while speaking ([0002](0002-direct-browser-connection.md)) | 8 (6.7%) | 4 (5.1%) |
| `gemini-3.5-live-translate-preview`, Gemini's dedicated interpreting model | 50 (41.7%) | 12 (15.0%) |
| `gpt-transcribe`, then a text model translates | 13 (10.8%) | 4 (5.0%) |

The dedicated interpreting model starts speaking before the speaker has
finished (about 3 s before, at the median). That is what it is built for, and
it is why it does badly here: in a face-to-face exchange of single sentences it
commits to a translation before it has heard the end.

`gpt-realtime-2.1` made most of its errors by mishearing (25 of its serious
errors were a misheard or wrong word, against 5 for Gemini 3.8 Live).

Full tables, error types and every serious error:
[`eval/reports/2026-11-15.md`](../../eval/reports/2026-11-15.md).

Second round, 2026-11-16. Read recordings flatter every system, so this round
used 89 clips of unscripted speech: Mandarin face-to-face chat (MagicData-RAMC),
Thai interviews and podcasts (TVSpeech) and Thai vlogs, drama and commentary
(GigaSpeech 2). One pass per clip, a single judge, scored against the
transcript of what was said.

| System | Serious errors | Wait |
|---|---|---|
| `gemini-3.8-live`, audio sent while speaking (what the app does) | 14 of 89 (16%) | 0.97 s from release to first translated sound (90th percentile 1.25 s) |
| the same, given the previous lines of the conversation | 12 of 59 | 1.09 s |
| `gemini-3.8-live-extended-thinking`, thinking level low | 22 of 89 (25%) | 0.86 s |
| `gpt-transcribe`, then a text model | 14 of 89 (16%) | 4.1 s to the translated text, no speech yet |
| whole recording to `gemini-4-hydrogen`, thinking level low, text out | 3 of 89 (3%) | 3.5 s to the translated text, no speech yet |
| whole recording to `gemini-4-carbon`, text out | 4 of 89 (4%) | 8.4 s to the translated text (90th percentile 23 s) |

Most of the Live model's errors were on the Mandarin chat clips (10 of 30):
half sentences, repetitions and filler words, recorded on phones. Three of
those clips were failed by every system.

Giving the Live model the earlier lines of the conversation did not help (12 of
59 against 12 of 59 on the same clips). The extended-thinking Live model was
worse, not better.

## What was chosen

`gemini-3.8-live`, with audio sent while the person speaks. Among the systems
that answer in about a second it has the fewest serious errors, and it is the
only arrangement measured here in which the listener hears the translation
about one second after the speaker stops.

If Gemini fails before any translated sound has been heard, the turn is tried
again on a second Gemini session and then through the server, where it may
fall back to `gpt-realtime-2.1` ([architecture](../architecture.md)). A turn
never switches engine after translated audio has started.

## The slower, more accurate alternative

Handing the whole recording to `gemini-4-hydrogen` made about a fifth as many
serious errors on unscripted speech (3 of 89 against 14 of 89; single judge,
one pass). It returns text only: the words it heard and their translation, in
one request. To be heard, the translation then has to be read aloud by a
separate voice model.

Measured one request at a time on 90 clips, the translated text was complete
2.7 s after the recording was sent (90th percentile 3.5 s). The first sound
from a voice model then took a further 0.85 s with `gpt-4o-mini-tts` (median of
20 clips; `gemini-3.8-flash-tts` took 4.2 s). That is about 3.5 s of silence
after each sentence instead of about 1 s.

**Decided 2026-11-17: speed wins, the app stays on Gemini 3.8 Live.** The
reasons:

- The wait is paid on every sentence, in both directions. A question and its
  answer would carry about five more seconds of silence, which is the
  walkie-talkie rhythm this app exists to avoid.
- The slow path needs a second model to speak. That is a second place for
  errors, and it was not measured: 3 of 89 says the text was right, not that
  what would be heard is right.
- The gap is smaller than it looks. 10 of the Live model's 14 errors were on
  the Mandarin chat clips (half sentences, fillers), three of which every
  system failed; on the two Thai sets it was 4 against 0. And the evidence is a
  single judge and one pass over 89 clips.
- Most of the Live model's errors are misheard words, and the speaker can see
  those: the card shows what was heard, and the pencil fixes it
  ([0006](0006-output-checks-and-retries.md)).

What this decision leaves unsolved: a sentence that was heard correctly and
translated wrongly. Neither person can see that, and nothing catches it today.

## An idea, not tested: a silent second listener

Let the Live model speak after one second as it does now, and at the same time
send the same recording to `gemini-4-hydrogen` for the words it hears. If they
differ from what the Live model heard in a way that changes the meaning, treat
the second transcript as a pencil correction: send it to a fresh Live session
as text, which translates and speaks it starting with "Correction:". The voice
and the text of the correction then come from the same model as every other
sentence.

What the listener would get on a sentence that was misheard: the first
translation cut off part-way (or just finished, for a short sentence), then the
correction from its beginning, some four to five seconds after the speaker
stopped. That timing is an estimate. On every other sentence, nothing.

Why it has not been built:

- **It stands or falls on false alarms, and that number does not exist.** If
  the second listener calls a filler word, a repetition or punctuation a
  mishearing, correct sentences are interrupted and said twice, which is worse
  than doing nothing. The first step would be to run it offline over the 89
  saved turns and count how often it would have interrupted a good
  translation.
- It fixes mishearings only. The correction is still translated by the Live
  model.
- It roughly doubles the model calls per sentence.

## Not measured

- Any pair other than Chinese and Thai.
- The sound of the translation. Judges read the text of what the model said;
  nobody scored pronunciation or tone.
- `gpt-realtime-2.1` on unscripted speech was run (59 clips) but not graded.
