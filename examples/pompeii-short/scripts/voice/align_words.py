#!/usr/bin/env python3
"""Word timings for the captions — measured from the voice audio, text from SCRIPT.md.

whisper.cpp DTW timestamps (what `npx hyperframes transcribe` returns) run 0.2–0.5 s EARLY on this
TTS audio and collapse the first words into the leading silence, which is visible in word-synced
captions. So timing comes from the audio itself:

  1. find the pauses in each voice line (≥ 70 ms below −38 dB of the line's peak);
  2. map every pause onto a word boundary with a small dynamic-programming pass that prefers the
     boundaries where the script really pauses (sentence ends, list commas, the SSML <break>s from
     make_voice.py) and keeps each phrase's length consistent with its phonetic weight;
  3. inside each phrase, place words by cumulative phonetic weight (vowels + ½·consonants).

whisper is still run through the official CLI — as a word-for-word check that the synthesized speech
says the script (its text is printed next to each line).

Writes audio_meta.json (frame-keyed, for captions.mjs / assemble-index.mjs), audio_engine_meta.json
(neutral engine shape) and .hyperframes/transcripts/NN.whisper.json.

    python3 scripts/voice/align_words.py [--transcripts <dir with NN/transcript.json>]
"""
import argparse
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile
from functools import lru_cache

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from make_voice import SSML  # noqa: E402  (the break positions live in the TTS markup)

VOWELS = set("аеёиоуыэюя")
SILENT_LETTERS = set("ьъй")


def word_list(text):
    text = re.sub(r"<[^>]+>", " ", text).replace("+", "")
    text = re.sub(r"[–—-]", " ", text.lower())
    return re.findall(r"[а-яё0-9]+", text)


def weight(word):
    v = sum(1 for c in word if c in VOWELS)
    c = sum(1 for c in word if c.isalpha() and c not in VOWELS and c not in SILENT_LETTERS)
    return max(1.0, v + 0.5 * c)


def ssml_breaks(ssml):
    out, count = set(), 0
    for part in re.split(r"(<break[^>]*/>)", ssml):
        if part.startswith("<break"):
            if count:
                out.add(count - 1)
        else:
            count += len(word_list(part))
    return out


def silences(path, s0, s1):
    x, sr = sf.read(path)
    hop = int(0.01 * sr)
    env = np.sqrt(np.convolve(x ** 2, np.ones(hop) / hop, mode="same")[::hop])
    edb = 20 * np.log10(env / (env.max() + 1e-12) + 1e-12)
    quiet = edb < -38
    out, i = [], 0
    while i < len(quiet):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]:
                j += 1
            a, b = i * 0.01, j * 0.01
            if b - a >= 0.07 and a > s0 + 0.05 and b < s1 - 0.05:
                out.append((a, b))
            i = j
        else:
            i += 1
    return out


def align_line(tokens, ssml, path, s0, s1):
    # word-level sequence; display tokens map to word ranges («четыре–шесть» → 2 words)
    words, spans = [], []
    for t in tokens:
        ws = word_list(t)
        spans.append((len(words), len(words) + len(ws)))
        words.extend(ws)
    n = len(words)
    w = [weight(x) for x in words]
    cum = np.concatenate([[0.0], np.cumsum(w)])
    # boundary strength after word i
    strong = ssml_breaks(ssml)
    penalty = {}
    for ti, t in enumerate(tokens):
        last = spans[ti][1] - 1
        if last < 0:
            continue
        if re.search(r"[.!?]$", t) or last in strong:
            penalty[last] = 0.0
        elif re.search(r"[,;:—–]$", t) or (ti + 1 < len(tokens) and tokens[ti + 1] in ("—", "–")):
            penalty[last] = 0.2
    sil = silences(path, s0, s1)
    m = len(sil)
    voiced = (s1 - s0) - sum(b - a for a, b in sil)
    rate = voiced / cum[-1]  # seconds per weight unit

    def seg_cost(i0, i1, dur):
        exp = rate * (cum[i1] - cum[i0])
        return ((dur - exp) / max(exp, 0.25)) ** 2

    @lru_cache(maxsize=None)
    def best(k, q, t_start):
        # k: next silence index to consider; q: first word of the open phrase; t_start: phrase start
        # returns (cost, [(silence_index, boundary_word_index), ...])
        # option A: close the line here (every remaining silence is skipped)
        cost_end = seg_cost(q, n, s1 - t_start - sum(b - a for a, b in sil[k:])) + 0.9 * (m - k)
        res = (cost_end, [])
        for k2 in range(k, m):
            a, b = sil[k2]
            skipped = sum(bb - aa for aa, bb in sil[k:k2])
            for p in range(q, n - 1):  # silence after word p
                c = 0.9 * (k2 - k) + seg_cost(q, p + 1, a - t_start - skipped) + penalty.get(p, 1.4)
                if c >= res[0]:
                    continue
                sub_cost, sub_path = best(k2 + 1, p + 1, round(b, 3))
                if c + sub_cost < res[0]:
                    res = (c + sub_cost, [(k2, p)] + sub_path)
        return res

    _, mapping = best(0, 0, round(s0, 3))
    # phrase windows
    phrases, q, t = [], 0, s0
    for k2, p in mapping:
        phrases.append((q, p + 1, t, sil[k2][0]))
        q, t = p + 1, sil[k2][1]
    phrases.append((q, n, t, s1))
    starts, ends = [0.0] * n, [0.0] * n
    for i0, i1, ta, tb in phrases:
        tot = cum[i1] - cum[i0]
        for i in range(i0, i1):
            starts[i] = ta + (tb - ta) * (cum[i] - cum[i0]) / tot
            ends[i] = ta + (tb - ta) * (cum[i + 1] - cum[i0]) / tot
    out = []
    for ti, t in enumerate(tokens):
        a, b = spans[ti]
        if a == b:
            continue
        out.append({"id": f"w{len(out)}", "text": t, "start": round(starts[a] + 0.005, 3),
                    "end": round(ends[b - 1] - 0.01, 3)})
    return out, sil, mapping


def parse_script(md):
    out, cur = {}, None
    for line in md.splitlines():
        h = re.match(r"^#{2,3}\s+.*?\(frame\s+(\d+)\)", line, re.I)
        if h:
            cur = int(h.group(1))
            out[cur] = ""
            continue
        if cur is None or line.lstrip().startswith("**"):
            continue
        mm = re.match(r"^(?: {4,}|\t)(.+)$", line)
        if mm:
            out[cur] = (out[cur] + " " + mm.group(1).strip()).strip()
    return out


def asr_text(path_rel, transcripts, nn):
    src = os.path.join(transcripts, nn, "transcript.json") if transcripts else None
    if src and os.path.exists(src):
        return json.load(open(src, encoding="utf-8"))
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(["npx", "hyperframes", "transcribe", path_rel, "--model", "large-v3-turbo", "--language", "ru",
                        "--dir", td], cwd=ROOT, check=True, capture_output=True)
        return json.load(open(os.path.join(td, "transcript.json"), encoding="utf-8"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--transcripts", default=None)
    args = ap.parse_args()
    manifest = json.load(open(os.path.join(ROOT, "assets/voice/voice_manifest.json"), encoding="utf-8"))
    script = parse_script(open(os.path.join(ROOT, "SCRIPT.md"), encoding="utf-8").read())
    raw_dir = os.path.join(ROOT, ".hyperframes", "transcripts")
    os.makedirs(raw_dir, exist_ok=True)
    voices, neutral = [], []
    for line in manifest["lines"]:
        fid, nn = line["frame"], f"{line['frame']:02d}"
        tokens = [t for t in script[fid].split() if word_list(t) or t in ("—", "–")]
        words, sil, mapping = align_line(tokens, SSML[fid], os.path.join(ROOT, line["path"]),
                                         line["speech_start_s"], line["speech_end_s"])
        asr = asr_text(line["path"], args.transcripts, nn)
        json.dump(asr, open(os.path.join(raw_dir, f"{nn}.whisper.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        heard = " ".join(w["text"] for w in asr)
        ratio = difflib.SequenceMatcher(None, " ".join(word_list(script[fid])), " ".join(word_list(heard))).ratio()
        print(f"frame {fid}: {len(words)} words · {len(sil)} pauses → {len(mapping)} phrase breaks · ASR text similarity {ratio:.0%}")
        print(f"   heard:  {heard}")
        print("   timing: " + "  ".join(f"{w['text']}@{w['start']:.2f}" for w in words))
        for wd in words:
            if not 0.06 <= wd["end"] - wd["start"] <= 1.4:
                print(f"   ! suspicious duration {wd['text']} {wd['end'] - wd['start']:.2f}s")
        voices.append({"frame": fid, "path": line["path"], "duration_s": line["duration_s"], "words": words})
        neutral.append({"id": nn, "path": line["path"], "duration_s": line["duration_s"], "words": words})

    meta_path = os.path.join(ROOT, "audio_meta.json")
    prev = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}
    meta = {"bgm": prev.get("bgm"), "bgm_pending": False, "voices": voices, "sfx": prev.get("sfx", [])}
    json.dump(meta, open(meta_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    engine = {"tts_provider": "silero", "voice_id": f"{manifest['model']}/{manifest['speaker']}", "bgm": None,
              "bgm_pending": False, "voices": neutral, "sfx": prev.get("sfx", []),
              "total_duration_s": manifest["total_duration_s"]}
    json.dump(engine, open(os.path.join(ROOT, "audio_engine_meta.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("✓ audio_meta.json + audio_engine_meta.json written")


if __name__ == "__main__":
    main()
