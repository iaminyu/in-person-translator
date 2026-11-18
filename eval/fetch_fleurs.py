#!/usr/bin/env python3
"""Download a small Thai + Mandarin sample of FLEURS (real human read speech).

FLEURS (google/fleurs on Hugging Face, CC-BY-4.0) has the same sentences read
aloud in 100+ languages, so every clip comes with a human translation into the
other language. We only stream the start of each audio archive and stop as soon
as enough clips are collected, so the download stays in the tens of MB.

Usage (from the repo root):  python3 -I eval/fetch_fleurs.py [--per-lang 30]
Output: eval/data/fleurs/{th,zh}/*.wav and eval/data/fleurs/manifest.json
"""
import argparse
import json
import os
import re
import tarfile
import urllib.request

BASE = "https://huggingface.co/datasets/google/fleurs/resolve/main/data"
CONFIGS = {"th": "th_th", "zh": "cmn_hans_cn", "en": "en_us"}
SPLIT = "dev"
SAMPLE_RATE = 16000
MIN_SEC, MAX_SEC = 3.0, 14.0
MAX_STREAM_BYTES = 150 * 1024 * 1024
SAFE_NAME = re.compile(r"^[0-9]+\.wav$")


class CountingReader:
    """Wraps the HTTP response so the stream can be capped."""

    def __init__(self, raw):
        self.raw = raw
        self.count = 0

    def read(self, size=-1):
        if self.count > MAX_STREAM_BYTES:
            raise RuntimeError("stream cap reached before enough clips were found")
        data = self.raw.read(size)
        self.count += len(data)
        return data


def fetch_tsv(config):
    url = f"{BASE}/{config}/{SPLIT}.tsv"
    with urllib.request.urlopen(url, timeout=60) as resp:
        text = resp.read().decode("utf-8")
    rows = []
    for line in text.splitlines():
        parts = line.split("\t")
        if len(parts) < 7:
            continue
        rows.append(
            {
                "id": parts[0],
                "file": parts[1],
                "text": parts[2].strip(),
                "seconds": int(parts[5]) / SAMPLE_RATE,
                "gender": parts[6].strip().lower(),
            }
        )
    return rows


def collect(lang, rows, text_by_lang, taken_ids, per_lang, out_dir):
    by_file = {r["file"]: r for r in rows}
    os.makedirs(out_dir, exist_ok=True)
    picked = []
    url = f"{BASE}/{CONFIGS[lang]}/audio/{SPLIT}.tar.gz"
    resp = urllib.request.urlopen(url, timeout=120)
    reader = CountingReader(resp)
    try:
        with tarfile.open(fileobj=reader, mode="r|gz") as tar:
            for member in tar:
                if not member.isfile():
                    continue
                name = os.path.basename(member.name)
                row = by_file.get(name)
                if not row or not SAFE_NAME.match(name):
                    continue
                sid = row["id"]
                if sid in taken_ids:
                    continue
                if not (MIN_SEC <= row["seconds"] <= MAX_SEC):
                    continue
                if not all(sid in text_by_lang[other] for other in text_by_lang):
                    continue
                data = tar.extractfile(member).read()
                with open(os.path.join(out_dir, name), "wb") as handle:
                    handle.write(data)
                taken_ids.add(sid)
                picked.append(row)
                if len(picked) >= per_lang:
                    break
    finally:
        resp.close()
    print(f"{lang}: {len(picked)} clips, read {reader.count / 1e6:.1f} MB of the archive")
    return picked


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-lang", type=int, default=30)
    args = parser.parse_args()

    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "fleurs")
    tables = {lang: fetch_tsv(config) for lang, config in CONFIGS.items()}
    text_by_lang = {
        lang: {row["id"]: row["text"] for row in rows} for lang, rows in tables.items()
    }

    taken = set()
    samples = []
    for lang, target in (("th", "zh"), ("zh", "th")):
        picked = collect(
            lang, tables[lang], text_by_lang, taken, args.per_lang, os.path.join(root, lang)
        )
        for row in picked:
            samples.append(
                {
                    "id": f"fleurs-{lang}-{row['id']}",
                    "set": "fleurs",
                    "srcLang": lang,
                    "tgtLang": target,
                    "wav": f"fleurs/{lang}/{row['file']}",
                    "seconds": round(row["seconds"], 2),
                    "gender": row["gender"],
                    "sourceText": row["text"],
                    "referenceText": text_by_lang[target][row["id"]],
                    "englishText": text_by_lang["en"][row["id"]],
                }
            )

    with open(os.path.join(root, "manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(samples, handle, ensure_ascii=False, indent=1)
    print(f"wrote {len(samples)} samples to {os.path.join(root, 'manifest.json')}")


if __name__ == "__main__":
    main()
