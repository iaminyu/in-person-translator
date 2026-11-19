# 0006: Checks on every answer, and one retry

Status: in use. Most of the checks are in
`public/voice-translator/translation-language.js` and
`public/voice-translator/gemini-direct.js`.

## The principle

A wrong translation delivered confidently is worse than no translation: the
two people cannot tell, and the conversation goes wrong without either knowing
why. So the app checks what it can check without understanding the languages,
asks once more when a check fails, and says so plainly when the second attempt
fails too. It never shows a guess as if it were a result.

"Once more" always means another session and the same speech. The speaker
does not have to say it again. Since 2026-11-17 a second session hears every
press as it is spoken; since 2026-11-18 it answers at the same time as the
first and its answer is kept, so a second answer is usually ready the moment
the first one fails ([architecture](../architecture.md)).

## The checks

**Wrong language.** The writing system of the translation is compared with the
pair. An answer in neither language, or in the language that was spoken, is
stopped and translated again. Only pairs whose writing systems differ can be
checked this way: Chinese and Thai yes, English and German no. When nothing can
be said for sure, the answer is left alone.

**Said back untranslated.** The same check, applied while the answer is still
arriving: it is stopped as soon as its first words show it, instead of being
read out to the end.

**A word or two left untranslated.** "不着急不着急, 我就是想到了..." came back
as "不用รีบนะครับ พอดี...": a translation, with two characters of the
speaker's language at its start (2026-11-18). An answer holding writing of the
speaker's language that is nowhere in the heard sentence is translated again.
A name kept as it was said ("ฉันชื่อ 王小明") is in the heard sentence and is
left alone; so, for now, is a left-over word the speaker did say. Only for
pairs with no writing in common, and never for Latin letters.

**Most of the sentence left out.** "就是成就感比较低, 自己不会做题什么的,
然后导数也是。" came back as "แล้วก็เรื่องอนุพันธ์ด้วย", only its last clause. On the
site, trial users' sentences of 26-32 s were answered in about a second of
speech (2026-11). Both texts are measured in seconds at an ordinary pace
(Chinese 4.5 characters, Thai 12 letters, Latin 13 letters a second); a
translation under 0.4x the heard sentence is translated again. Only for a
heard sentence of 3 s or more, only when the text arrived whole, and only
for Chinese, Thai and Latin-script languages, whose pace was measured. This
check needs no difference in writing, so it covers English and Spanish too.

**A whole sentence from a brief press.** A 0.5 s press came back as 3.4 s of
speech, a 2.6 s one as 23.6 s (trial users, Aug-Nov 2026). A translation
that would take longer to say than 2.5x the recording plus 0.75 s is made
up: no card, and the speaker is asked to say it again, as for a made-up
heard sentence. Push to Talk only, where the recording's length is known.

**Speech cut short.** Now and then the model speaks a second or less of a
sentence while its text holds the whole of it (4 of 220 real turns on
2026-11-16, on both paths). The length of the audio is compared with the
fastest anyone could say that text (measured for Chinese and Thai; a wide
margin of 30 letters a second for scripts that were not measured). Too short:
playback stops and the recording is translated again.

**Nothing was said.** A recording as quiet as an idle microphone is not sent at
all. Sound in the first 300 ms after a microphone opens does not count as a
voice, because a freshly opened microphone starts with a burst. Without these,
a silent press came back as "¿Qué tal?" with the pair set to Chinese and Thai.

**Heard in a language outside the pair.** If the words heard so far are plainly
in some other language (Spanish opening marks, a script neither language uses),
the turn is stopped: nothing is shown or played, and the speaker is asked to
say it again. Plain Latin letters are kept, because "Tesco", "OK" and "Grab"
turn up in any language.

**Nothing of either language on either side.** A very quiet Chinese sentence
came back heard as "ellos ellos ellos" and translated as "No.". Such a turn is
dropped with "Didn't catch that, say it again a little louder", in both
languages.

**Markers that were never spoken.** The model's transcript of its own speech
sometimes carries `<no speech>`, `{pause}`, `<partial>`, `[th]` or a stray
emoji. They are removed. An answer that is nothing but "no speech" counts as
nothing to translate, not as a failure to retry.

**Text that never arrives.** Sometimes the translation is spoken in full but
its text stops halfway or does not come. The turn waits a little longer; if the
text still does not come, the audio that was played is written down by a
speech-to-text model and shown. The same is done for the speaker's own words.
A card never stays on "Translating..." for good.

## How the checks were kept from rejecting good translations

Every check that can throw a turn away was replayed over the saved evaluation
turns of real Chinese and Thai speech before it shipped. The "nothing of either
language" rule: 1,907 turns, none dropped. The "heard in another language"
rule, applied to every prefix of 1,898 turns: none stopped early. The "word or
two left untranslated" rule: 2,762 saved answers, 4 made again, each one
holding Chinese words in a Thai answer; no kept name among them. The
"most of it left out" rule (2026-11-18): of 2,142 saved answers long enough
to judge, 1 made again, the one that kept only the last clause. The "brief
press" rule: 2,608 saved recordings, none dropped; the longest translation
needed 2.4x its recording.

The page also reports to the server which check rejected a translation and the
numbers it went by (counts only, never the words), so a check that starts
rejecting good translations can be found.

## The correction pencil

Checks cannot catch a misheard word ("设备" heard as "机油"), and saying the
sentence again often gets the same mistake. Each finished card has a pencil
next to the words that were heard. The speaker fixes them, and the corrected
sentence goes to a fresh session as text. Nothing is heard this time, so
nothing can be misheard. The spoken result starts with "Correction:" in the
speaker's language so the listener knows it replaces the one before.

A detail that cost a day: sent as a finished text turn, about one corrected
sentence in six came back without speech. Sent the way live input is sent, none
did (0 of 12 against 2 of 12).

## Limits

- Pairs written in the same script get the silence and cut-short checks but
  not the language checks.
- The speaking rates behind the cut-short check were measured for Chinese and
  Thai only.
