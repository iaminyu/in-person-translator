# 0003: Every sentence gets a fresh session

Status: in use since 2026-11-15; measured 2026-11-16.

## The question

A Live session can stay open for a whole conversation. The model would then
know what was said before, which could help with names, pronouns and topics.
Should the app keep one session per conversation?

## Why not, in principle

- **Drift.** The longer a session runs, the more the model behaves like a
  conversation partner: it starts answering questions instead of translating
  them.
- **Cost.** A long session is billed for its whole history on every turn.
- **Leftovers.** Sound from before (the echo of the last translation, a half
  sentence) can be heard as part of the new sentence.

## What was measured

12 made-up conversations of 6 turns each, Chinese and Thai alternating, cut
from real recordings. Each conversation was run twice with the same code: every
turn in its own session, and all six turns in one session. A blind judge scored
both against the transcript without knowing which was which.

| | Serious errors (72 turns) | Answered in the wrong language |
|---|---|---|
| Fresh session per turn | 17 | 0 |
| One session for the conversation | 14 | 2 |

Three clips out of 72 is not a difference this test can show, and the later
turns of a reused session were not reliably better than the first ones. The
reused session did twice what a fresh one never did: it answered in the wrong
language.

In a separate comparison ([0001](0001-speech-model.md)), handing the model the
previous lines as text did not reduce errors either.

## What was chosen

A fresh session for every sentence, with the next session connected in advance
so nothing waits for it ([0002](0002-direct-browser-connection.md)).

## Limits of the test

Single judge, one pass, 72 turns, conversations assembled from unrelated clips.
Real conversations, where the later sentences do depend on the earlier ones,
could behave differently. The script is `eval/session-reuse.js`.
