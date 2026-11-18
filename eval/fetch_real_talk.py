#!/usr/bin/env python3
"""Download small samples of real, unscripted human speech (not read aloud).

Two public sources, both with transcripts written by people:

- tvspeech: TVSpeech (typhoon-ai/TVSpeech on Hugging Face). Thai speakers
  talking freely in YouTube videos that were published under a Creative
  Commons licence. Talks and interviews, mostly about economy and policy.
- ramc: MagicData-RAMC (OpenSLR SLR123, CC BY-NC-ND 4.0, free for
  non-commercial use). Pairs of Mandarin speakers chatting face to face,
  recorded on mobile phones. Read here from the Hugging Face copy
  EaseZh/magicdata_ramc, whose dev archive starts with the transcripts.

- gigaspeech2: GigaSpeech 2 Thai test set (speechcolab/gigaspeech2 on
  Hugging Face). Thai YouTube of every kind: street-food and travel vlogs,
  drama scenes, sports commentary, talk shows, adverts. Access needs a
  Hugging Face account that has filled in the dataset's request form and
  accepted its terms (non-commercial research and education only), so this
  script does not download it: download data/th/test.tar.gz and
  data/th/test.tsv in the browser and pass their paths.

None of the sources has a translation into the other language, so these
samples have no reference translation; the judge works from the transcript
alone.

Usage (from the repo root):
  python3 -I eval/fetch_real_talk.py [--per-lang 30] [--only tvspeech|ramc]
  python3 -I eval/fetch_real_talk.py --only gigaspeech2 \
      --gs2-archive ~/Downloads/test.tar.gz --gs2-tsv ~/Downloads/test.tsv
Output: eval/data/{tvspeech,ramc,gigaspeech2}/*.wav and manifest.json in each.
Needs ffmpeg. The tvspeech part downloads one 430 MB file and needs pyarrow
to read it (use a throwaway venv); the ramc part needs neither.
"""
import argparse
import json
import os
import re
import subprocess
import tarfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
MIN_SEC, MAX_SEC = 3.5, 15.0
# How many earlier turns are kept with each clip, to test whether knowing the
# conversation so far helps a translator understand unclear words.
CONTEXT_TURNS = 4

TVS_PARQUET = (
    "https://huggingface.co/datasets/typhoon-ai/TVSpeech/resolve/main/"
    "data/test-00000-of-00001.parquet"
)
TVS_ID = re.compile(r"^([A-Za-z0-9_-]{6,20})_(\d+)_(\d+)$")

GS2_NAME = re.compile(r"^test/(\d+)/(\d+-\d+)\.wav$")
GS2_CANDIDATES_PER_VIDEO = 8

RAMC_URL = "https://huggingface.co/datasets/EaseZh/magicdata_ramc/resolve/main/dev.tar.gz"
RAMC_NAME = re.compile(r"^dev/(txt|wav)/(CTS-CN-F2F-[0-9-]+)\.(txt|wav)$")
RAMC_LINE = re.compile(r"^\[([0-9.]+),([0-9.]+)\]\t(\S+)\t([^\t]*)\t(.*)$")
RAMC_CONVERSATIONS = 3
RAMC_MAX_STREAM = 400 * 1024 * 1024


def to_wav16k(src, dst, start=None, end=None):
    cmd = ["ffmpeg", "-loglevel", "error", "-y"]
    if start is not None:
        cmd += ["-ss", f"{start:.3f}", "-to", f"{end:.3f}"]
    cmd += ["-i", src, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", dst]
    subprocess.run(cmd, check=True)


def wav_seconds(path):
    return round((os.path.getsize(path) - 44) / 32000, 2)


def fetch_tvspeech(per_lang):
    try:
        import pyarrow.parquet as pq
    except ImportError:
        raise SystemExit(
            "tvspeech needs pyarrow: python3 -m venv /tmp/vt-eval-venv && "
            "/tmp/vt-eval-venv/bin/pip install pyarrow, then run this script "
            "with /tmp/vt-eval-venv/bin/python -I"
        )
    out_dir = os.path.join(DATA, "tvspeech")
    os.makedirs(out_dir, exist_ok=True)
    parquet = os.path.join(out_dir, "test.parquet.src")
    with urllib.request.urlopen(TVS_PARQUET, timeout=120) as resp:
        with open(parquet, "wb") as handle:
            while True:
                block = resp.read(1 << 20)
                if not block:
                    break
                handle.write(block)

    table = pq.ParquetFile(parquet)
    ids = table.read(columns=["audio_id", "sentence"]).to_pylist()

    # Group by video so the sample is spread over as many speakers as possible.
    by_video = {}
    for index, row in enumerate(ids):
        match = TVS_ID.match(row["audio_id"])
        if not match:
            continue
        seconds = (int(match.group(3)) - int(match.group(2))) / 1000
        if not (MIN_SEC <= seconds <= MAX_SEC):
            continue
        by_video.setdefault(match.group(1), []).append(index)
    picked = []
    while len(picked) < per_lang and any(by_video.values()):
        for video in sorted(by_video):
            if by_video[video] and len(picked) < per_lang:
                picked.append((video, by_video[video].pop(0)))

    audio = table.read(columns=["audio"]).column("audio")
    samples = []
    for video, index in picked:
        row = ids[index]
        name = f"tv-{len(samples) + 1:02d}"
        raw = os.path.join(out_dir, f"{name}.src")
        wav = os.path.join(out_dir, f"{name}.wav")
        with open(raw, "wb") as handle:
            handle.write(audio[index].as_py()["bytes"])
        to_wav16k(raw, wav)
        os.unlink(raw)
        samples.append(
            {
                "id": f"tvspeech-th-{len(samples) + 1:02d}",
                "set": "tvspeech",
                "srcLang": "th",
                "tgtLang": "zh",
                "wav": f"tvspeech/{name}.wav",
                "seconds": wav_seconds(wav),
                "video": video,
                "origin": row["audio_id"],
                "sourceText": row["sentence"].strip(),
                "referenceText": "",
            }
        )
    os.unlink(parquet)
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(samples, handle, ensure_ascii=False, indent=1)
    videos = len({s["video"] for s in samples})
    print(f"tvspeech: {len(samples)} clips from {videos} videos (of {len(ids)} clips in the set)")


class CappedReader:
    def __init__(self, raw, cap):
        self.raw, self.cap, self.count = raw, cap, 0

    def read(self, size=-1):
        if self.count > self.cap:
            raise RuntimeError("stream cap reached")
        data = self.raw.read(size)
        self.count += len(data)
        return data


def parse_ramc(text):
    turns = []
    for line in text.splitlines():
        match = RAMC_LINE.match(line)
        if match:
            turns.append(
                {
                    "start": float(match.group(1)),
                    "end": float(match.group(2)),
                    "speaker": match.group(3),
                    "info": match.group(4),
                    "text": match.group(5).strip(),
                }
            )
    return turns


def ramc_context(turns, turn, count=CONTEXT_TURNS):
    """The few turns spoken just before this one (either speaker), as text."""
    index = turns.index(turn)
    before = []
    for other in turns[max(1, index - count):index]:  # turn 0 is a recording slate
        text = re.sub(r"\[[^\]]*\]", "", other["text"]).strip()
        if text:
            before.append(text)
    return before


def pick_ramc_turns(turns, wanted):
    """Whole turns of one speaker with nobody else talking over them."""
    good = []
    for index, turn in enumerate(turns):
        seconds = turn["end"] - turn["start"]
        if index == 0 or not (MIN_SEC <= seconds <= MAX_SEC):
            continue
        # Skip turns marked with noise, laughter or overlap tags, and
        # anything with Latin letters (spelled-out abbreviations).
        if "[" in turn["text"] or re.search(r"[A-Za-z]", turn["text"]):
            continue
        if len(re.sub(r"[，。？！、\s]", "", turn["text"])) < 8:
            continue
        lo, hi = turn["start"] - 0.25, turn["end"] + 0.25
        if any(o is not turn and o["start"] < hi and o["end"] > lo for o in turns):
            continue
        good.append(turn)
    # Alternate speakers and spread the picks over the whole conversation.
    by_speaker = {}
    for turn in good:
        by_speaker.setdefault(turn["speaker"], []).append(turn)
    picked = []
    share = max(1, wanted // max(1, len(by_speaker)))
    for speaker in sorted(by_speaker):
        items = by_speaker[speaker]
        step = max(1, len(items) // share)
        picked += items[::step][:share]
    return sorted(picked, key=lambda t: t["start"])[:wanted]


def fetch_ramc(per_lang):
    out_dir = os.path.join(DATA, "ramc")
    os.makedirs(out_dir, exist_ok=True)
    per_conversation = -(-per_lang // RAMC_CONVERSATIONS)
    transcripts = {}
    samples = []
    done = 0
    resp = urllib.request.urlopen(RAMC_URL, timeout=120)
    reader = CappedReader(resp, RAMC_MAX_STREAM)
    try:
        with tarfile.open(fileobj=reader, mode="r|gz") as tar:
            for member in tar:
                match = RAMC_NAME.match(member.name)
                if not member.isfile() or not match:
                    continue
                kind, conversation = match.group(1), match.group(2)
                if kind == "txt":
                    data = tar.extractfile(member).read().decode("utf-8", "replace")
                    transcripts[conversation] = parse_ramc(data)
                    continue
                turns = transcripts.get(conversation)
                if not turns:
                    continue
                full = os.path.join(out_dir, "conversation.src")
                with open(full, "wb") as handle:
                    source = tar.extractfile(member)
                    while True:
                        block = source.read(1 << 20)
                        if not block:
                            break
                        handle.write(block)
                for turn in pick_ramc_turns(turns, per_conversation):
                    if len(samples) >= per_lang:
                        break
                    name = f"ramc-{len(samples) + 1:02d}"
                    wav = os.path.join(out_dir, f"{name}.wav")
                    to_wav16k(full, wav, turn["start"] - 0.15, turn["end"] + 0.15)
                    samples.append(
                        {
                            "id": f"ramc-zh-{len(samples) + 1:02d}",
                            "set": "ramc",
                            "srcLang": "zh",
                            "tgtLang": "th",
                            "wav": f"ramc/{name}.wav",
                            "seconds": wav_seconds(wav),
                            "conversation": conversation,
                            "speaker": turn["speaker"],
                            "speakerInfo": turn["info"],
                            "sourceText": turn["text"],
                            "referenceText": "",
                            "context": ramc_context(turns, turn),
                        }
                    )
                os.unlink(full)
                done += 1
                if done >= RAMC_CONVERSATIONS or len(samples) >= per_lang:
                    break
    finally:
        resp.close()
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(samples, handle, ensure_ascii=False, indent=1)
    speakers = len({s["speaker"] for s in samples})
    print(
        f"ramc: {len(samples)} clips, {speakers} speakers, "
        f"read {reader.count / 1e6:.0f} MB of the archive"
    )


def build_gigaspeech2(per_lang, archive, tsv):
    out_dir = os.path.join(DATA, "gigaspeech2")
    os.makedirs(out_dir, exist_ok=True)
    text = {}
    by_video = {}
    order = {}
    with open(tsv, encoding="utf-8") as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) != 2 or not re.match(r"^\d+-\d+$", parts[0]):
                continue
            text[parts[0]] = parts[1].strip()
            order.setdefault(parts[0].split("-")[0], []).append(parts[0])
            if len(parts[1].strip()) >= 15:
                by_video.setdefault(parts[0].split("-")[0], []).append(parts[0])
    for ids in order.values():
        ids.sort(key=lambda item: int(item.split("-")[1]))
    # A few segments spread over each video, so one video is not all intro.
    wanted = {}
    for video, ids in by_video.items():
        ids.sort(key=lambda item: int(item.split("-")[1]))
        step = max(1, len(ids) // GS2_CANDIDATES_PER_VIDEO)
        for rank, item in enumerate(ids[step // 2::step][:GS2_CANDIDATES_PER_VIDEO]):
            wanted[item] = rank
    found = {}
    with tarfile.open(archive, mode="r|gz") as tar:
        for member in tar:
            match = GS2_NAME.match(member.name)
            if not member.isfile() or not match or match.group(2) not in wanted:
                continue
            seconds = (member.size - 44) / 32000
            if not (MIN_SEC <= seconds <= MAX_SEC):
                continue
            found[match.group(2)] = tar.extractfile(member).read()
    queues = {}
    for item in sorted(found, key=lambda item: wanted[item]):
        queues.setdefault(item.split("-")[0], []).append(item)
    picked = []
    while len(picked) < per_lang and any(queues.values()):
        for video in sorted(queues, key=int):
            if queues[video] and len(picked) < per_lang:
                picked.append(queues[video].pop(0))
    samples = []
    for item in picked:
        name = f"gs2-{len(samples) + 1:02d}"
        raw = os.path.join(out_dir, f"{name}.src")
        wav = os.path.join(out_dir, f"{name}.wav")
        with open(raw, "wb") as handle:
            handle.write(found[item])
        to_wav16k(raw, wav)
        os.unlink(raw)
        samples.append(
            {
                "id": f"gigaspeech2-th-{len(samples) + 1:02d}",
                "set": "gigaspeech2",
                "srcLang": "th",
                "tgtLang": "zh",
                "wav": f"gigaspeech2/{name}.wav",
                "seconds": wav_seconds(wav),
                "video": item.split("-")[0],
                "origin": item,
                "sourceText": text[item],
                "referenceText": "",
                "context": [
                    text[other]
                    for other in order[item.split("-")[0]][
                        max(0, order[item.split("-")[0]].index(item) - CONTEXT_TURNS):
                        order[item.split("-")[0]].index(item)
                    ]
                ],
            }
        )
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(samples, handle, ensure_ascii=False, indent=1)
    videos = len({s["video"] for s in samples})
    print(f"gigaspeech2: {len(samples)} clips from {videos} videos")


def ramc_windows(turns, size, wanted):
    """Runs of `size` turns spoken one after another, with at most a few
    short interjections ("嗯") in between."""
    def substantive(turn):
        seconds = turn["end"] - turn["start"]
        if not (2.0 <= seconds <= 12.0) or "[" in turn["text"] or re.search(r"[A-Za-z]", turn["text"]):
            return False
        if len(re.sub(r"[，。？！、\s]", "", turn["text"])) < 6:
            return False
        lo, hi = turn["start"] - 0.1, turn["end"] + 0.1
        return not any(o is not turn and o["start"] < hi and o["end"] > lo for o in turns)

    good = [index for index, turn in enumerate(turns) if index > 0 and substantive(turn)]
    windows = []
    for at in range(len(good) - size + 1):
        run = good[at:at + size]
        close = all(
            run[k + 1] - run[k] <= 4 and turns[run[k + 1]]["start"] - turns[run[k]]["end"] <= 8
            for k in range(size - 1)
        )
        if close and (not windows or run[0] > windows[-1][-1]):
            windows.append(run)
    step = max(1, len(windows) // wanted)
    return [[turns[i] for i in run] for run in windows[step // 2::step][:wanted]]


def build_sessions(archive, tsv, count=12, size=3):
    """Short made-up conversations for testing one translator session kept
    open over several turns: Chinese and Thai turns alternate, and the turns
    of each language are consecutive in their own recording."""
    out_dir = os.path.join(DATA, "sessions")
    os.makedirs(out_dir, exist_ok=True)

    # Chinese: consecutive turns of the RAMC conversations.
    zh_runs = []
    transcripts = {}
    resp = urllib.request.urlopen(RAMC_URL, timeout=120)
    reader = CappedReader(resp, RAMC_MAX_STREAM)
    conversations = 0
    try:
        with tarfile.open(fileobj=reader, mode="r|gz") as tar:
            for member in tar:
                match = RAMC_NAME.match(member.name)
                if not member.isfile() or not match:
                    continue
                kind, conversation = match.group(1), match.group(2)
                if kind == "txt":
                    transcripts[conversation] = parse_ramc(tar.extractfile(member).read().decode("utf-8", "replace"))
                    continue
                turns = transcripts.get(conversation)
                if not turns:
                    continue
                full = os.path.join(out_dir, "conversation.src")
                with open(full, "wb") as handle:
                    source = tar.extractfile(member)
                    while True:
                        block = source.read(1 << 20)
                        if not block:
                            break
                        handle.write(block)
                for run in ramc_windows(turns, size, -(-count // RAMC_CONVERSATIONS)):
                    clips = []
                    for turn in run:
                        name = f"zh-{len(zh_runs) + 1:02d}-{len(clips) + 1}"
                        wav = os.path.join(out_dir, f"{name}.wav")
                        to_wav16k(full, wav, turn["start"] - 0.15, turn["end"] + 0.15)
                        clips.append({"wav": f"sessions/{name}.wav", "seconds": wav_seconds(wav), "sourceText": turn["text"], "speaker": turn["speaker"]})
                    zh_runs.append(clips)
                os.unlink(full)
                conversations += 1
                if conversations >= RAMC_CONVERSATIONS:
                    break
    finally:
        resp.close()

    # Thai: consecutive segments of the GigaSpeech 2 videos.
    text = {}
    order = {}
    with open(tsv, encoding="utf-8") as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) == 2 and re.match(r"^\d+-\d+$", parts[0]):
                text[parts[0]] = parts[1].strip()
                order.setdefault(parts[0].split("-")[0], []).append(parts[0])
    for ids in order.values():
        ids.sort(key=lambda item: int(item.split("-")[1]))
    seconds = {}
    with tarfile.open(archive, mode="r|gz") as tar:
        for member in tar:
            match = GS2_NAME.match(member.name)
            if member.isfile() and match:
                seconds[match.group(2)] = (member.size - 44) / 32000
    chosen = []
    for video in sorted(order, key=int):
        ids = order[video]
        fits = [
            ids[at:at + size]
            for at in range(len(ids) - size + 1)
            if all(2.0 <= seconds.get(item, 0) <= 12.0 and len(text[item]) >= 10 for item in ids[at:at + size])
        ]
        if fits:
            chosen.append(fits[len(fits) // 2])
    chosen = chosen[:: max(1, len(chosen) // count)][:count]
    wanted = {item for run in chosen for item in run}
    audio = {}
    with tarfile.open(archive, mode="r|gz") as tar:
        for member in tar:
            match = GS2_NAME.match(member.name)
            if member.isfile() and match and match.group(2) in wanted:
                audio[match.group(2)] = tar.extractfile(member).read()
    th_runs = []
    for run in chosen:
        clips = []
        for item in run:
            name = f"th-{len(th_runs) + 1:02d}-{len(clips) + 1}"
            raw = os.path.join(out_dir, f"{name}.src")
            wav = os.path.join(out_dir, f"{name}.wav")
            with open(raw, "wb") as handle:
                handle.write(audio[item])
            to_wav16k(raw, wav)
            os.unlink(raw)
            clips.append({"wav": f"sessions/{name}.wav", "seconds": wav_seconds(wav), "sourceText": text[item], "origin": item})
        th_runs.append(clips)

    sessions = []
    for index in range(min(count, len(zh_runs), len(th_runs))):
        turns = []
        for k in range(size):
            for lang, runs in (("zh", zh_runs), ("th", th_runs)):
                clip = runs[index][k]
                turns.append({
                    "id": f"s{index + 1:02d}-t{len(turns) + 1}",
                    "srcLang": lang,
                    "tgtLang": "th" if lang == "zh" else "zh",
                    **clip,
                })
        sessions.append({"id": f"s{index + 1:02d}", "turns": turns})
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(sessions, handle, ensure_ascii=False, indent=1)
    print(f"sessions: {len(sessions)} sessions of {size * 2} turns ({len(zh_runs)} Chinese runs, {len(th_runs)} Thai runs)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-lang", type=int, default=30)
    parser.add_argument("--only", choices=["tvspeech", "ramc", "gigaspeech2", "sessions"])
    parser.add_argument("--gs2-archive")
    parser.add_argument("--gs2-tsv")
    args = parser.parse_args()
    if args.only == "sessions":
        if not (args.gs2_archive and args.gs2_tsv):
            parser.error("--only sessions needs --gs2-archive and --gs2-tsv")
        build_sessions(args.gs2_archive, args.gs2_tsv)
        return
    if args.only == "gigaspeech2":
        if not (args.gs2_archive and args.gs2_tsv):
            parser.error("--only gigaspeech2 needs --gs2-archive and --gs2-tsv")
        build_gigaspeech2(args.per_lang, args.gs2_archive, args.gs2_tsv)
        return
    if args.only != "ramc":
        fetch_tvspeech(args.per_lang)
    if args.only != "tvspeech":
        fetch_ramc(args.per_lang)


if __name__ == "__main__":
    main()
