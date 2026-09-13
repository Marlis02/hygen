#!/usr/bin/env python3
"""Final master of a rendered MP4: integrated loudness exactly −14 LUFS, true peak ≤ −1 dBTP.

Why on the rendered file: the render engine sums every clip without a master bus, and its bus-FX
path fails with this ffmpeg build (see scripts/assemble/finalize_index.mjs), so the "normalize the
final mix to −14 LUFS" step of the brief is done on the mix itself:

  decode the render's audio → linear gain to −14.0 LUFS → linked look-ahead true-peak limiter
  (−1.5 dBTP before AAC, leaving room for codec overshoot) → iterate until within ±0.1 LU →
  AAC 256 kb/s, video stream copied bit-for-bit → verify with ffmpeg ebur128.

    python3 scripts/verify/master_audio.py renders/draft.mp4            # in place
    python3 scripts/verify/master_audio.py renders/raw.mp4 --out renders/final.mp4
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf
from scipy.ndimage import minimum_filter1d
from scipy.signal import resample_poly

SR = 48000
TARGET = -14.0
MAX_TP = -1.0


def ebur128(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-vn", "-af", "ebur128=peak=true",
                        "-f", "null", "-"], capture_output=True, text=True)
    tail = r.stderr[r.stderr.rfind("Summary:"):]
    i = float(re.search(r"I:\s*(-?[\d.]+) LUFS", tail).group(1))
    tp = float(re.search(r"Peak:\s*(-?[\d.]+|-inf) dBFS", tail).group(1).replace("-inf", "-120"))
    return i, tp


def lufs(x):
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, "m.wav")
        sf.write(p, x.astype(np.float32), SR, subtype="FLOAT")
        return ebur128(p)[0]


def limit(x, ceiling_db, lookahead_ms=6.0, release_ms=120.0):
    ceiling = 10 ** (ceiling_db / 20)
    n = len(x)
    over = np.abs(resample_poly(x, 4, 1, axis=0)).max(axis=1)
    over = np.concatenate([over, np.zeros(max(0, n * 4 - len(over)))])
    tp = over[: n * 4].reshape(n, 4).max(axis=1)
    need = np.minimum(1.0, ceiling / np.maximum(tp, 1e-12))
    la = int(lookahead_ms * SR / 1000)
    hold = minimum_filter1d(need, size=2 * la + 1)
    rel = np.exp(-1.0 / (release_ms * SR / 1000))
    gain = np.empty(n)
    cur = 1.0
    for k in range(n):
        g = hold[k]
        cur = g if g < cur else rel * cur + (1.0 - rel) * g
        gain[k] = cur
    w = int(0.002 * SR) | 1
    gain = np.minimum(np.convolve(gain, np.ones(w) / w, mode="same"), hold)
    y = x * gain[:, None]
    peak = 20 * np.log10(np.abs(resample_poly(y, 4, 1, axis=0)).max() + 1e-12)
    return y * 10 ** (min(0.0, ceiling_db - peak) / 20), float((1 - gain).max())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mp4")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    src = os.path.abspath(args.mp4)
    out = os.path.abspath(args.out or args.mp4)
    i0, tp0 = ebur128(src)
    print(f"· render mix: I {i0:.1f} LUFS · TP {tp0:.1f} dBTP")
    with tempfile.TemporaryDirectory() as td:
        raw = os.path.join(td, "mix.wav")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vn", "-ac", "2", "-ar", str(SR),
                        "-c:a", "pcm_f32le", raw], check=True)
        x, _ = sf.read(raw, dtype="float64")
        ceiling = -1.5
        for attempt in range(3):
            y, gr = x, 0.0
            for _ in range(5):
                y, gr = limit(y * 10 ** ((TARGET - lufs(y)) / 20), ceiling)
                if abs(TARGET - lufs(y)) <= 0.1:
                    break
            mastered = os.path.join(td, "master.wav")
            sf.write(mastered, y.astype(np.float32), SR, subtype="FLOAT")
            tmp_mp4 = os.path.join(td, "out.mp4")
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-i", mastered, "-map", "0:v:0", "-map", "1:a:0",
                            "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", str(SR), "-movflags", "+faststart",
                            "-shortest", tmp_mp4], check=True)
            i1, tp1 = ebur128(tmp_mp4)
            print(f"  pass {attempt + 1}: ceiling {ceiling:.1f} dBTP · max limiter gain reduction {20 * np.log10(max(1e-6, 1 - gr)):.1f} dB "
                  f"→ AAC: I {i1:.2f} LUFS · TP {tp1:.2f} dBTP")
            if tp1 <= MAX_TP and abs(i1 - TARGET) <= 0.3:
                shutil.move(tmp_mp4, out)
                print(f"✓ mastered → {out}")
                return
            ceiling -= 0.5
    sys.exit("✗ master: could not meet −14 LUFS / −1 dBTP")


if __name__ == "__main__":
    main()
