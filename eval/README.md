# Evaluation tools

Run the same recordings through any translation system and have judges who
cannot see which system produced a translation mark the ones that would
mislead a listener.

The method, the test sets and their licences, how to run each step and what
the numbers can and cannot tell you are described in
[docs/evaluation.md](../docs/evaluation.md).

| File | What it does |
|---|---|
| `fetch_fleurs.py` | Downloads the read recordings (FLEURS, Thai and Mandarin) |
| `fetch_real_talk.py` | Downloads the unscripted sets (TVSpeech, MagicData-RAMC; GigaSpeech 2 from a manual download) |
| `scenarios.json`, `build-scenarios.js` | 40 hand-written travel sentences, spoken by macOS synthetic voices |
| `lib/systems.js` | The systems that can be compared |
| `run.js` | Runs systems over test sets |
| `judge.js` | Two model judges, blind. Billed per call; needs `--paid-api` |
| `report.js` | Turns a judged run into a report: English by default, `--lang zh` for Chinese |
| `reports/` | Reports that have been published. A `.notes.json` beside one holds what its systems were called at the time and English for judges' notes first written in Chinese |
| `session-reuse.js` | One session per conversation against one per sentence |
| `measure-wait.js` | The wait with a non-live model plus a voice model |
| `cut-short-probe.js` | Does translated speech reach the listener cut short? |
| `transcription-hint.js` | Does telling speech-to-text the language pair help? |
| `read-aloud.js` | Which model reads a translation aloud exactly as written |

Audio goes to `eval/data/` and raw outputs to `eval/results/`; neither is
committed. Two of the datasets may not be redistributed.

Every step that calls a model costs money.
