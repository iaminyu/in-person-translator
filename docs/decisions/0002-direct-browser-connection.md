# 0002: The browser connects to Gemini itself and sends audio while the person speaks

Status: in use since 2026-11-15.

## The problem

The first Gemini version worked like most web translators: record, upload the
whole recording when the button is released, and only then have the server
open a connection to the model. Measured from Asia against a server in the
United States, the first translated sound came about 3 s after release. Three
seconds of silence after every sentence is what makes a translated
conversation feel like a walkie-talkie.

## What was done

1. **A short-lived token instead of the API key.** The page asks the server for
   a token. The server fixes the model and the translation instructions inside
   the token, so the browser cannot change them, and the real key never leaves
   the server. The token is single-use, must be used to open a session within
   60 s and expires after 10 minutes.
2. **A connected session waits for the next press.** After each turn the page
   opens the session for the next one in the background. When the button is
   pressed there is nothing left to set up.
3. **Audio is sent while the person speaks.** Each captured frame goes to
   Gemini at once. Releasing the button only sends "end of turn". Automatic
   activity detection is switched off: the button says where a turn starts and
   ends, the model does not guess.

## Result

Median wait from release to first translated sound, on the evaluation set:
about 1.0 s, against about 3 s for upload-after-release. On unscripted speech
(89 clips, 2026-11-16) the median was 0.97 s and the 90th percentile 1.25 s.

Accuracy was the same as the server path: 8 serious errors in 120 runs on read
recordings, against 9.

A related step taken the same day: the server function was moved to the region
nearest the users (Singapore). It had been running in the US East default while
the users are in Asia, so every turn on the server path crossed the Pacific
twice.

## What it costs

- The browser reports how many seconds of audio it sent and played. A service
  that bills by usage has to treat that as client-reported and clamp it.
- When the direct path fails before any translated sound was heard (no sound
  2.5 s after release, socket error), the answer is asked of a second session
  that heard the same press, and after that the recording goes through the
  server. Since 2026-11-17 every press is sent to two sessions for this
  reason: the server path cost 3 to 10 s more on about one sentence in ten.
  Since 2026-11-18 both sessions answer every press (the second answer is
  kept, and played only if the first fails or is slower to speak), so every
  sentence pays for a second answer as well. Both paths have to be kept
  working.
- The session code has to run in the browser. It is kept free of any page
  dependency (`public/voice-translator/gemini-direct.js`) so the same file runs
  under Node in the tests and in the evaluation, at real-time pace.
