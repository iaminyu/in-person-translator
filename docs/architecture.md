# How a sentence travels

What happens between a finger touching the button and the other person hearing
the translation. Names in `code font` are files or functions in this
repository. The reasons behind each step are in [decisions/](decisions/).

## The parts

| Part | Where | What it does |
|---|---|---|
| Page | `public/voice-translator/voice-page.js`, `talk-mode.css` | The button, the cards, the microphone, playback. Everything a person sees or hears. |
| Direct session | `public/voice-translator/gemini-direct.js` | One translation turn over a Gemini Live connection opened by the browser. No page dependencies; also runs under Node. |
| Answer checks | `public/voice-translator/translation-language.js` | Is the answer in the right language? Was anything said at all? |
| Server | `lib/translation-core/` | Writes the instructions, issues short-lived tokens, and translates a whole recording when the direct path fails. Holds the API keys. |
| Hands-free (off) | `gemini-handsfree.js`, `speech-detector.js` | Finds sentences in an open microphone. Kept behind a flag; see [decision 0004](decisions/0004-push-to-talk-over-hands-free.md). |

## One turn

```
 Speaker            Page                      Server              Gemini Live
    |                 |                          |                     |
    |                 |-- ask for a token ------>|                     |
    |                 |<-- single-use token -----|  (model and         |
    |                 |    instructions fixed    |   instructions are  |
    |                 |    inside it)            |   set here)         |
    |                 |-- open session with the token ---------------->|
    |                 |                (connected, waiting)            |
    |-- touch ------->|                                                |
    |   speaks        |-- audio frames, as they are captured --------->|
    |-- release ----->|-- end of turn -------------------------------->|
    |                 |<-- translated audio, in pieces ----------------|
    |                 |<-- text of what was heard, text of the answer -|
    |                 |   checks, plays, shows the card                |
    |                 |-- ask for the next token --->|                 |
```

1. **Before the press.** The page already holds a connected session. The token
   that opened it is single-use and short-lived, and the model and the
   translation instructions were fixed inside it by the server
   (`buildGeminiLiveSetup`, `buildStrictTranslationInstructions`). The API key
   never reaches the browser.
2. **Touch.** Recording starts the moment the button is touched. A press under
   0.4 s is a tap (the next tap stops it); a longer one is a held press (lifting
   the finger stops it).
3. **While speaking.** Each microphone frame is sent to Gemini as it is
   captured. Gemini's own activity detection is off: the button marks the turn.
4. **Release.** Only "end of turn" is sent. The recording is first checked for
   being as quiet as an idle microphone; if so nothing is sent and the speaker
   is told no sound came through.
5. **The answer arrives** as pieces of 24 kHz audio plus two transcripts: what
   the model heard and what it said. The page converts the pieces to the
   phone's playback rate as one continuous sound and plays them as they come.
   The first sound is heard about one second after release.
6. **Checks, while it plays and when it ends** ([decision
   0006](decisions/0006-output-checks-and-retries.md)): right language, not said
   back untranslated, audio long enough for its text, heard words not in some
   third language, stray markers removed.
7. **If a check fails**, playback stops and the sentence is translated once
   more (see "When an answer fails" below). If that fails too, the card says
   so.
8. **The card** appears once, on the speaker's side, with the heard words and
   the translation. Missing text is filled in afterwards by a speech-to-text
   model without holding up the next sentence.
9. **The session is closed** and a new one is connected for the next press.

## When an answer fails

An answer fails when it brings no speech within 2.5 s of release, the
connection breaks, or a check throws it away (wrong language, said back
untranslated, cut short). About one sentence in ten needs a second attempt.
The page tries, in order:

1. **A second connection that heard the same press.** Every press is sent to
   two Gemini sessions as it is spoken, and both are told the turn is over at
   the same moment. The second one's answer is kept, not played. Whichever
   starts speaking first is heard: if the second speaks while the first has
   not, the first is given up. If the first answer fails or is thrown away,
   the kept one is played from its start at once, usually already complete,
   instead of being asked for only then (1 to 2 s more, measured 2026-11-17)
   or the recording being uploaded and translated from scratch (3 to 10 s
   more). The second answer is paid for on every sentence, used or not.
2. **The session kept ready for the next press**, sent the recording.
3. **The server.** The page uploads the recording; the server runs the same
   instructions through Gemini Live itself (`translateAudioTurnGemini`) and, if
   that fails or has not started speaking within 7 s, through OpenAI's realtime
   model (`translateAudioTurn`).

When Gemini says nothing at all to a sentence, it does so on every session:
five times on 2026-11-17/18 the first two were both silent, and so was the
backup every time, and the server's own Gemini half the time; those sentences
waited 9 to 16 s. So once two sessions have been silent on a recording, the
backup is skipped and the server is asked to go straight to OpenAI
(`engine: "openai"`, reported as path `server-openai`).

A turn never changes engine once translated audio has started. After three
turns in a row that the direct path could not finish at all (the server had to
translate them) the page uses the server path for 60 s, then tries the direct
path again. A first answer rescued by the second connection, or read aloud,
does not count. Each spoken turn reports its wait to the first translated
sound and every attempt with its reason, so slow or failing paths can be found
(`scripts/turn-wait-report.js`).

## Typed and corrected sentences

A sentence typed on the keyboard, or heard words fixed with the pencil, go
through the same kind of session as text (`session.sendText()`), sent the way
live input is sent rather than as a finished text turn. Some typed sentences
are translated but not spoken by the model; the turn then resolves with its
text.

## Limits built in

| | |
|---|---|
| Longest recording | 60 s, with a countdown in the last 10 s |
| Token | single use; must open its session within 60 s; valid 10 minutes |
| A waiting session | kept alive up to 10 minutes of idleness |
| Microphone | closed while a translation plays, reopened 0.4 s after the last sound, closed for good after 2 minutes without a turn |

## What a deployment must protect

The token endpoint spends the deployer's API quota on behalf of whoever calls
it. A public deployment needs something in front of it: accounts, a shared
passphrase, or at least a rate limit. The audio seconds a browser reports for a
direct session are client-reported and must be clamped before they are used for
anything that matters.
