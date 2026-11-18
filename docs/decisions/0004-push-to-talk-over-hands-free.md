# 0004: Push to talk only; hands-free is switched off

Status: hands-free was taken offline on 2026-11-16. Its code is kept behind a
flag (`public/voice-translator/gemini-handsfree.js`,
`public/voice-translator/speech-detector.js`).

## Why hands-free is attractive

Nobody has to touch the phone. Two people just talk.

## What was tried, in order

**1. Let Gemini find the sentences in an open microphone stream.** The first
words of a sentence were often lost before the model noticed someone was
speaking. Sound left over from before (the echo of the last translation, a half
sentence) was heard as part of the new one. Quiet speech sometimes got no
answer at all.

**2. Let the page mark the start and end, by loudness.** Each sentence is sent
whole, with about a second of audio from before its first word, through the
same kind of fresh session a button press uses. With recordings this worked. With
a real microphone it did not: "quiet" had been defined against the room's
quietest moment, and after someone stops speaking a real microphone keeps
delivering several times that for seconds (the room's tail, automatic gain, a
keyboard). The end of the sentence was never found. The rule was changed to
"below 35% of how loud this speaker usually is", with settings taken from a
real laptop microphone recorded through the browser and replayed in the tests.

**3. Let a speech-detection model decide whether someone is speaking.**
Loudness cannot tell a person from a busy room. A room with continuous sound as
loud as speech was sent off as sentences, and the model answered with nonsense.
Silero VAD v5 now runs in the browser on the microphone signal: a probability
of 0.5 starts a sentence, below 0.35 for 1.2 s ends it. Nothing leaves the
device. Real recordings of people are judged as speech; white noise, rumble,
tones and clicks are not.

**4. Details found only on a real microphone.** A microphone that has just been
switched on delivers a burst that was taken for a sentence. A sentence that had
ended was taken back whenever the room made a sound. Voices in the room in a
third language (a television) were sent as sentences. Each has its own fix in
the code and its own test.

## What was measured

Read recordings, 2026-11-15 (120 runs, two judges):

| | Serious errors |
|---|---|
| Push to talk | 8 (6.7%) |
| Hands-free, Gemini finds the end | 22 (18.3%) |

Travel sentences were about equal (4 and 5 of 80). The gap is on long, dense
sentences.

The same clips again after step 2 (read recordings and travel sentences, 100
in all), three versions judged blind by two judges:

| | Serious errors, judge A / judge B |
|---|---|
| Hands-free, Gemini finds the end | 10 / 10 |
| Hands-free, the page finds the end | 8 / 6 |
| Push to talk | 7 / 6 |

Unscripted speech, 2026-11-16 (single judge):

| | Mandarin chat (30) | Thai interviews (30) |
|---|---|---|
| Push to talk | 10 | 2 |
| Hands-free, the page finds the end | 13 | 6 |

## What was chosen

Push to talk only. On read sentences the page-marked version closed the gap,
but on the way people really talk, with pauses in the middle of a thought,
hands-free still cut sentences and made more serious errors. A pause of 1.2 s
is both too long to wait after a short answer and too short for someone
searching for a word. A finger does not have that problem.

There was a second reason on phones: a microphone that stays open makes an
iPhone play the translation quieter and with crackle
([0008](0008-iphone-audio.md)).

## What would reopen it

An end-of-sentence detector that understands whether a thought is finished,
not only whether there is sound, and evidence on unscripted speech that it
matches a button.
