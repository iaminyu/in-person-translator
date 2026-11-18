# Evaluation

How translation quality is measured here, what the test sets are, how to run
them, and what the numbers can and cannot tell you. The tools are in
[`eval/`](../eval/).

## The idea

Run the same recordings through every candidate system, using the app's own
code wherever possible, and have judges who cannot see which system produced a
translation mark the ones that would mislead a listener. The method must not
depend on anyone's language skills: whoever builds a translator rarely speaks
both of its languages.

## Test sets

All Chinese and Thai. Audio is downloaded or generated into `eval/data/`, which
is not in the repository.

| Set | What it is | Clips | Licence | In the repository |
|---|---|---|---|---|
| `fleurs` | Google FLEURS: people reading encyclopedia-style sentences aloud. Comes with a human translation into the other language. | 30 Thai, 30 Mandarin | CC BY 4.0 | Download script |
| `scenario` | 40 hand-written travel and everyday sentences: numbers, times, negation, names, very short phrases, and things said to the translator itself. Spoken by macOS synthetic voices. | 40 | This project's | `eval/scenarios.json` and the build script |
| `tvspeech` | TVSpeech (`typhoon-ai/TVSpeech`): Thai interviews, lectures and podcasts from Creative Commons YouTube videos. Hand-transcribed. | 30, from 12 videos | See the dataset | Download script |
| `ramc` | MagicData-RAMC (OpenSLR SLR123): two people chatting face to face in Mandarin, recorded on phones. Half sentences, repetitions, filler words. | 30, from 3 conversations and 6 speakers | CC BY-NC-ND 4.0, non-commercial only | Download script |
| `gigaspeech2` | GigaSpeech 2 Thai test set: market and travel vlogs, drama dialogue, sports commentary, adverts. The most colloquial. | 30, from 30 videos | Non-commercial research and education; needs an application on Hugging Face | Manual download, then the script |

Neither the audio nor the transcripts of `ramc` and `gigaspeech2` may be
redistributed, so they are never committed, and results that quote them stay
out of the repository too.

Read speech flatters every system. In the first round the best system made
serious errors on about 7% of read recordings; on unscripted speech the same
system made them on 16%. **Only unscripted speech says how a system does in a
real conversation.** The three unscripted sets are cut from long recordings by
sentence, so a clip may start or end mid-sentence, and they have no human
translation: a judge can only compare a translation with the transcript of
what was said.

## Systems

Defined in `eval/lib/systems.js`. The ones that matter most call the code the
app ships:

| Name | What runs |
|---|---|
| `gemini-direct` | The browser's own session code (`gemini-direct.js`) under Node: connect first, then send the audio at the pace it was spoken |
| `gemini-3.8-live` | The server's `translateAudioTurnGemini` |
| `gpt-realtime-2.1` | The server's `translateAudioTurn` |
| `gemini-handsfree` | The hands-free controller (`gemini-handsfree.js`) finding the sentence itself |
| `cascade` | `gpt-transcribe`, direction decided from the text, then a text model translates |
| `gemini-translate` | Gemini's dedicated interpreting model |
| others | One-off experiments: context, extended thinking, whole recording to a non-live model |

Sending audio at real-time pace matters. A system that is handed a whole file
at once is not being tested the way a person would use it, and its latency
figure means nothing.

## Judging

Three ways have been used. Every result in [decisions/](decisions/) says which.

1. **Two model judges** (`eval/judge.js`): one OpenAI text model and one Gemini
   text model, each shown the source, the reference where there is one, and a
   translation without the system's name. A **confirmed** serious error is one
   both call serious. One judge only is **disputed**. This is billed per call
   and refuses to run without `--paid-api`.
2. **A coding assistant reading the outputs in a session**, single judge,
   against the transcript. Cheap, and good enough to see a large difference.
   Used for the unscripted sets.
3. **Blind packets**: outputs of two or three systems shuffled per item and
   labelled A, B, C, judged without the key. Used when comparing variants of
   one system.

The verdicts are **serious** (the listener gets wrong or clearly incomplete
information, no output, or the wrong language), **minor** (meaning intact; a
particle, greeting or shade of wording lost) and **correct**.

## Running it

Needs macOS (for the synthetic voices), `ffmpeg`, `python3`, and
`OPENAI_API_KEY` and `GEMINI_API_KEY` in `.env`. From the repository root:

```bash
python3 -I eval/fetch_fleurs.py
```

```bash
python3 -I eval/fetch_real_talk.py
```

```bash
node eval/build-scenarios.js
```

```bash
node eval/run.js --run my-run
```

```bash
node eval/judge.js --run my-run --paid-api
```

```bash
node eval/report.js --run my-run
```

`run.js` and `judge.js` skip what is already done. Useful options:
`--systems gemini-direct,cascade`, `--sets tvspeech,ramc,gigaspeech2` (the
default is `fleurs,scenario`), `--passes 3`, `--limit 5`.

Every step that calls a model costs money. A full two-judge pass over all
systems is about 1,400 translations and 2,800 billed judge calls.

Other tools in `eval/`:

| Script | Question |
|---|---|
| `session-reuse.js` | Does one session per conversation beat one per sentence? |
| `measure-wait.js` | How long would the listener wait with a non-live model plus a voice model? |
| `cut-short-probe.js` | Does translated speech reach the listener cut short? |
| `transcription-hint.js` | Does telling speech-to-text the language pair help? |

## What the numbers do not tell you

- **Only Chinese and Thai.** Nothing here says how any system does on another
  pair.
- **Small sets.** 30 clips per set. A difference of two or three clips is not a
  finding.
- **Text, not sound.** Judges read the text of what the model said. Nobody
  scored pronunciation, tone or naturalness, and a translation spoken wrongly
  under a correct transcript would pass.
- **Recordings, not microphones.** Clean files do not have a room, a phone's
  automatic gain or a second voice. Everything about finding the start and end
  of speech had to be redone on a real microphone
  ([decision 0004](decisions/0004-push-to-talk-over-hands-free.md)).
- **Models, not products.** These runs compare ways of building a translator.
  They do not compare this app with other translation apps; no such comparison
  has been made.
- **Dated.** Model names are the ones available in November 2026.
- **Latency was measured with several systems running at once** in the first
  round, so those figures are for comparing systems with each other, not
  absolute.

## Adding a language pair

FLEURS covers more than a hundred languages with the same sentences in each, so
`fetch_fleurs.py` is the easiest place to start: add the two languages, run the
systems, and judge. For unscripted speech, look for a hand-transcribed corpus
of real conversation in each language, check that its licence allows the use,
and cut 30 clips from as many different speakers as possible.
