# In-person translator

Two people who share no language, one phone between them. One taps and
speaks; about a second after they stop, the other hears it in their own
language and sees both sentences on the screen. Then the other answers the
same way.

This repository is the working core of a translator built for exactly that
situation, with the reasons behind it: which speech model and why, what was
tried and thrown away, how it was measured, and what an iPhone forces a web
page to do.

It is published so that face-to-face translation gets better everywhere, not
only here. Take the code, the test method or just the lessons.

Just want to use it? A hosted version runs at
[livetalktranslate.com](https://livetalktranslate.com/), with nothing to set up
and no API key of your own.

## What is in here

| | |
|---|---|
| **The talk page** | `public/` — one button, tap or hold. Cards on each speaker's side. Fix a misheard word with the pencil. Type instead of speaking. Built to be read by two people at once, one of whom has never seen it. |
| **The translation core** | `lib/translation-core/` — the instructions given to the model, the Gemini Live session, the fallback engine, reading aloud. `public/voice-translator/gemini-direct.js` is the browser's side of it. |
| **Checks on every answer** | `public/voice-translator/translation-language.js` — wrong language, said back untranslated, cut short, nothing said. One retry, then an honest "not translated". |
| **A small server** | `server.js` — hands the browser short-lived tokens so your API key never leaves the server. No accounts, no database. |
| **Evaluation** | `eval/` — run the same recordings through any system, judge blind. Test sets of read and unscripted speech (download scripts; no audio in the repository). |
| **Why** | [`docs/decisions/`](docs/decisions/) — one page per decision, with the numbers. |

## Run it

You need Node 20 or later and a Gemini API key.

```bash
npm install
```

```bash
cp .env.example .env
```

Put your key in `.env` as `GEMINI_API_KEY`, then:

```bash
npm start
```

Open `http://127.0.0.1:3901`, choose the two languages, tap the microphone and
speak.

Tests: `npm test`. After changing styles in `styles/translator.css` or class
names in the page, rebuild the stylesheet with `npm run build:css`.

A phone needs HTTPS before its browser will open the microphone, so to try it
on a phone, put the server behind HTTPS (a tunnel or a host) **and set
`ACCESS_CODE` first**: there are no accounts, so anyone who reaches the server
spends your API quota. With the code set, each browser is asked for it once. Behind
a tunnel or proxy also set `TRUST_PROXY=1`, so the built-in brakes count each
visitor and not the proxy.

At the foot of the page a small line says where this code comes from, with a
link to the hosted version and one to this repository. You are welcome to
remove it: set `HIDE_CREDIT=1`, or delete the `<footer id="credit">` element
from `public/index.html`. The licence does not ask you to keep it.

### With an OpenAI key as well

`OPENAI_API_KEY` is optional. With it:

- when Gemini fails, the sentence is translated by a second engine instead of
  failing;
- a translation that Gemini gives as text without a voice is read aloud;
- text that Gemini leaves out (it happens) is written down from the audio.

Without it the translator works; those three things do not.

## How it works, in one paragraph

Before you press, the page already holds an open Gemini Live session, opened
with a single-use token in which the server fixed the model and the
instructions. While you speak, each piece of audio goes straight from the
browser to Gemini. Letting go only says "that was the sentence". The answer
streams back as speech and text, is checked, and plays. If a check fails, a
second session that heard the same press answers instead. Every sentence gets
a fresh session. The full path is in
[docs/architecture.md](docs/architecture.md).

## What was measured, and what was not

Everything here was measured on **Chinese and Thai**, in November 2026, on
small sets (30 to 120 clips per comparison). On unscripted speech the model in
use made a serious error on about one sentence in six; on read sentences,
about one in fifteen. Other language pairs work but have not been measured.
This project has not been compared with other translation apps.

The method, the test sets and their limits:
[docs/evaluation.md](docs/evaluation.md).

## Read next

- [Why each thing is the way it is](docs/decisions/README.md)
- [How a sentence travels](docs/architecture.md)
- [The interaction, and what was removed from it](docs/interaction.md)
- [How quality is measured](docs/evaluation.md)

## Known gaps

- The page's own wording is in English. Putting it into other languages is
  left to whoever deploys it.
- Hands-free mode is in the code but switched off
  ([why](docs/decisions/0004-push-to-talk-over-hands-free.md)).
- Language checks only work for pairs written in different scripts.

## Where this comes from

This code is the core of a hosted translator at
[livetalktranslate.com](https://livetalktranslate.com/). Development happens
there and is copied here, so changes sent to this repository are applied by
hand and may take a little while to appear.

## Licence

[MIT](LICENSE). Bundled third-party files (Silero VAD, ONNX Runtime Web) are
listed with their licences in `public/vendor/NOTICE.txt`. The evaluation
datasets have their own licences; two of them are for non-commercial use only
(see [docs/evaluation.md](docs/evaluation.md)).
