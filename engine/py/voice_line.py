#!/usr/bin/env python3
"""One narration line → the engine's voice clip: 48 kHz mono 16-bit, loudness set at the source.

Ported from examples/pompeii-short/scripts/voice/make_voice.py. Synthesis is `npx hyperframes tts`
(Kokoro); this script does what followed synthesis there. The render has no master bus (clips are
summed, a bus fader sits after each clip's limiter), so every line gets the level the −14 LUFS master
needs: −16.2 LUFS integrated as a mono file (≈ −13.2 LUFS once duplicated into the stereo mix), true
peak ≤ −2.5 dBTP through a transparent look-ahead limiter — no compression.

The lead/tail silence belongs to the scene timing (scene duration == clip duration). The tail is
stretched so the clip ends on a whole video frame, so every scene starts on a frame boundary.

    python3 voice_line.py raw.wav line.wav --lead 0.3 --tail 0.4 --fps 30

Prints one JSON line: duration_s, speech_start_s, speech_end_s, lufs, true_peak_dbtp.
"""
import argparse
import json
import math
import os
import re
import subprocess
import tempfile

import numpy as np
import soundfile as sf
from scipy.ndimage import minimum_filter1d
from scipy.signal import resample_poly

SR = 48000
TARGET_LUFS = -16.2  # mono measurement; the stereo mix plays it ~3 LU louder
CEILING_DBTP = -2.5


def integrated_lufs(x):
    with tempfile.TemporaryDirectory() as td:
        path = os.path.join(td, "m.wav")
        sf.write(path, x.astype(np.float32), SR, subtype="FLOAT")
        r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"],
                           capture_output=True, text=True)
    return float(re.findall(r"I:\s*(-?[\d.]+) LUFS", r.stderr)[-1])


def true_peak(x):
    return 20 * np.log10(np.max(np.abs(resample_poly(x, 4, 1))) + 1e-12)


def true_peak_limit(x, ceiling_db=CEILING_DBTP, lookahead_ms=6.0, release_ms=80.0):
    """Look-ahead brickwall on the 4×-oversampled peak: gain only dips around the loudest peaks."""
    ceiling = 10 ** (ceiling_db / 20)
    n = len(x)
    over = np.abs(resample_poly(x, 4, 1))
    pad = n * 4 - len(over)
    if pad > 0:
        over = np.concatenate([over, np.zeros(pad)])
    tp = over[: n * 4].reshape(n, 4).max(axis=1)
    need = np.minimum(1.0, ceiling / np.maximum(tp, 1e-12))
    la = int(lookahead_ms * SR / 1000)
    hold = minimum_filter1d(need, size=2 * la + 1)
    rel = np.exp(-1.0 / (release_ms * SR / 1000))
    gain = np.empty(n)
    cur = 1.0
    for i in range(n):
        gi = hold[i]
        cur = gi if gi < cur else rel * cur + (1.0 - rel) * gi
        gain[i] = cur
    k = int(0.002 * SR) | 1
    gain = np.minimum(np.convolve(gain, np.ones(k) / k, mode="same"), hold)
    y = x * gain
    over_db = true_peak(y) - ceiling_db
    return y * (10 ** (-over_db / 20)) if over_db > 0 else y


def master_line(speech):
    x = speech.astype(np.float64)
    for _ in range(4):
        x = true_peak_limit(x * 10 ** ((TARGET_LUFS - integrated_lufs(x)) / 20))
        if abs(TARGET_LUFS - integrated_lufs(x)) <= 0.1:
            break
    return x


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("raw")
    ap.add_argument("out")
    ap.add_argument("--lead", type=float, default=0.2)
    ap.add_argument("--tail", type=float, default=0.4)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--seed", type=int, default=1748)
    args = ap.parse_args()

    audio, sr = sf.read(args.raw, dtype="float64", always_2d=True)
    audio = audio.mean(axis=1)
    if sr != SR:
        g = math.gcd(SR, sr)
        audio = resample_poly(audio, SR // g, sr // g)
    thr = 10 ** (-45 / 20) * np.max(np.abs(audio))
    idx = np.where(np.abs(audio) > thr)[0]
    speech = audio[max(0, idx[0] - int(0.005 * SR)): idx[-1] + int(0.02 * SR)].copy()
    fade = int(0.004 * SR)
    speech[:fade] *= np.linspace(0, 1, fade)
    speech[-fade:] *= np.linspace(1, 0, fade)
    speech = master_line(speech)

    lead = int(round(args.lead * SR))
    frame = SR // args.fps
    total = lead + len(speech) + int(round(args.tail * SR))
    total = int(math.ceil(total / frame) * frame)
    full = np.zeros(total)
    full[lead:lead + len(speech)] = speech
    rng = np.random.default_rng(args.seed)
    full = full + (rng.random(full.shape) - rng.random(full.shape)) / 32768.0 * (np.abs(full) > 0)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    sf.write(args.out, np.clip(full, -1.0, 32767 / 32768), SR, subtype="PCM_16")
    print(json.dumps({
        "duration_s": round(total / SR, 3),
        "speech_start_s": round(lead / SR, 3),
        "speech_end_s": round((lead + len(speech)) / SR, 3),
        "lufs": round(integrated_lufs(speech), 2),
        "true_peak_dbtp": round(float(true_peak(speech)), 2),
    }))


if __name__ == "__main__":
    main()
