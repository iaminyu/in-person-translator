# 0008: iPhone: microphone closed during playback, tap or hold to record

Status: in use. Found on an iPhone running Chrome (which uses the system's
browser engine, like every iPhone browser).

Most of what follows could not be reproduced on a Mac in Chrome or Safari. It
was found, and each fix confirmed or thrown out, on a real phone.

## An open microphone makes the phone a telephone

While a web page holds the microphone open, an iPhone treats it like a phone
call: whatever the page plays through the phone's own speaker is quieter and
crackles. A web page cannot change that.

What was tried:

| Attempt | Result |
|---|---|
| Keep the microphone open between turns, so the next press records from its first moment | Every translation quiet |
| Open the microphone without echo cancellation | No difference |
| Make the translation louder (compressor, 2.5x boost, soft limiter) | Louder, but pops; measured, quiet speech had been raised 10 to 14 dB and pressed against the limiter all the time |
| A gentler boost (1.7x), fades at the ends of pieces | Fewer pops, crackle still there |
| A diagnostics panel on the phone (`?audiodebug=1`) with switches: no boost, whole translation as one piece, no fades | Crackle heard with every switch, so nothing in how the page plays the sound causes it |

**What is done now:** the microphone closes the moment a translation is
requested, and opens again 0.4 s after the last sound. The phone has left its
phone-call sound before anything plays, so the translation plays at normal
volume and no boost is needed.

**What that costs:** the browser may announce the microphone, or ask for it
again, on every turn. A press that arrives before the microphone is open shows
"Opening the microphone" until it really is, and recording starts only then.
The same trade was made once before and undone, because a reopened microphone
sometimes delivered no sound; that was fixed first (the page's audio is rebuilt
when it will not start within 0.8 s).

## Joins between pieces of a streamed translation

A translation is played while it arrives, as many small pieces at 24 kHz, and
the phone plays at another rate. Handing each piece to the browser to convert
on its own left a small jump at every join, heard as pops: up to 0.08 of full
scale at 48 kHz and 0.36 to 0.42 at 44.1 or 16 kHz, measured in Safari and
Chrome against the same sound played as one piece. A replay of the same
translation, converted whole, was clean.

The page now converts the pieces itself as one continuous sound and queues them
by whole output samples. The joins differ from the whole by less than 0.006.
When the next piece arrives late, the one before fades out over 12 ms and the
next fades in, instead of stopping in the middle of a wave.

## A web page cannot vibrate an iPhone

There is no vibration API. The one buzz a page can get is the tick the system
plays when a person's own tap flips a native switch, and it only comes as the
finger lifts. For a press held longer than about a second it did not come at
all.

So the record button takes a tap or a held press:

- A press shorter than 0.4 s is a tap. Recording goes on until the next tap.
- A longer press is a held press. Recording stops when the finger lifts.
- Either way recording starts the moment the button is touched, not when the
  finger lifts.

An invisible label tied to a hidden switch covers the button on iPhones, so
each tap ticks. Android gets a short vibration on press and release.

## The microphone prompt

The page used to wait 3 s for the browser's microphone prompt and then show
"microphone blocked", throwing away the permission the person granted a moment
later. It now waits for the answer however long it takes, and the recording
the tap began starts once it is allowed. Closing the prompt without answering
is not a refusal: nothing is shown, and the next tap asks again.

## After a few minutes idle

Two minutes after a turn the microphone closes. On iPhones that leaves the
page's audio paused, and the next recording received no sound and was reported
as "too short" however long the button was held. Before each recording the
audio is now started again whatever paused it. A press that still receives no
sound says "No sound came through", not "too short".
