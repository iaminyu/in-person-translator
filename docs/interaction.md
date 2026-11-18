# Interaction

Two people who share no language stand at one phone. One of them owns it and
has used the app before; the other has never seen it and cannot read its
language. Every choice below follows from that picture.

## One screen, two readers

- **Nothing on the shared screen is in one language only.** Wording that only
  the phone's owner can read was removed from the full-screen view. Where
  words are needed they appear once in each language of the conversation: the
  hint before the first turn ("tap the microphone to start talking, either
  language works"), and every notice that asks someone to do something (say it
  again, no sound came through).
- **States are shown, not written.** Recording, listening and translating are a
  button that changes shape and moving dots, not "Recording..." in the owner's
  language.
- **Each card sits on its speaker's side**, like a chat between two people. The
  side comes from the language of the heard words.
- **One translation, large.** A button on each card (or a double tap) shows
  that translation as large as it fits, with the original small below, for
  holding the phone up to someone. A tap anywhere closes it.

## The button

- **It acts on touch, not on release.** A phone reports a "click" only as the
  finger lifts, so a button wired to click shows nothing while it is being
  pressed. Recording starts the moment the button is touched.
- **Tap or hold, without choosing.** A press under 0.4 s is a tap: recording
  runs until the next tap. A longer press is a hold: recording stops when the
  finger lifts. People who expect a walkie-talkie and people who expect a
  record button are both right.
- **While recording it is a stop square**, standing still with one soft ring.
  With tap-to-start the button is in full view the whole time someone speaks,
  so nothing bounces.
- **No running timer.** "3.2 s" tells the speaker nothing. Only in the last 10
  seconds before the 60-second limit does a countdown appear.
- **One mode.** With hands-free switched off, the mode switch is hidden rather
  than showing a single selected option.

## The card

- **It appears once and stays still.** A card used to show on a guessed side,
  jump across, fade colour, swap a spinner for an icon and flash a ring. Now it
  stays hidden until it is known who is speaking, appears on that side and does
  not move.
- **Nothing is shown before it is true.** No empty card while the button is
  held and nothing has been heard. No text for a second attempt until its
  speech begins, so words are never shown and then taken away.
- **Never "Translating..." for good.** Every wait has an end, and the end says
  what happened.
- **The pencil.** Next to the heard words is a pencil. The speaker fixes a
  misheard word and the corrected sentence is translated and spoken again,
  starting with "Correction:" in the speaker's language. This is the answer to
  the one failure no check can catch.
- **No timestamps.** A conversation lasts minutes and is gone on reload.

## When something goes wrong

The message says what to do, in both languages, and never blames the speaker
for the phone:

- A press with no sound: "No sound came through", not "Speech was too short".
- A turn that could not be understood: "Didn't catch that, say it again a
  little louder", and no card.
- A translation that failed twice: the card says it was not translated. It
  does not show the failed attempt.
- A translation that was interrupted is marked as cut off instead of looking
  complete.
- The microphone prompt is waited for however long it takes. A late "Allow" is
  not an error, and closing the prompt is not a refusal.

## Quiet places and noisy places

- **Sound switch.** Off, a translation is shown and not spoken. The card's
  play button still plays it.
- **Keyboard.** A sentence can be typed instead of spoken. It gets a card of
  its own. The small microphone in the text row only switches back to voice;
  it does not start recording.
- Both buttons are hidden while someone is speaking.

## The phone itself

- The screen stays on while the microphone is open.
- Translations play with the ringer switched to silent.
- Added to the home screen, the app opens straight into the full-screen
  translator with the last language pair.
- A tick on each tap on iPhones and a short vibration on Android; how, and why
  it shaped the button, is in [decision 0008](decisions/0008-iphone-audio.md).

## Things that were removed

Each of these was built, used on a real phone, and taken out.

| Removed | Why |
|---|---|
| Hands-free mode | Cut sentences at pauses on real speech ([decision 0004](decisions/0004-push-to-talk-over-hands-free.md)) |
| Hold-only button with a "hold longer" animation | No tick on iPhones for a long press; a tap is easier to explain across a language barrier |
| Running timer and red dot while recording | Told the speaker nothing |
| Tap a card to enlarge it in place | Nobody found it, and it fired by accident |
| Instructions under the button in the page's language | The other person cannot read them |
| The small microphone that started recording as it closed the keyboard | The person only asked to switch back |
