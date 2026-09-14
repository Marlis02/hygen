#!/usr/bin/env python3
"""Music bed of a video: a licensed track looped to the bed length, faded in and out, ducked under the voice.

    python3 music_bed.py --track engine/assets/music/documentary-dark-01.wav --out build/assets/music/bed.wav \
        --duration 46.7 --speech speech.json --gain -4 --duck -12 --fade-in 1.5 --fade-out 2 --start 0 --end 46.7

speech.json: [[start, end], …] — seconds of speech in the video. The track is first normalized to −24 LUFS,
--gain is relative to that; under speech the bed drops by --duck dB (attack 0.12 s, release 0.45 s) — the
ducking is baked in, so the mix does not depend on the render's carve. Loops join with a 2 s equal-power
crossfade. 16-bit PCM with TPDF dither (the render's audio reader, TRAPS.md).
Prints one JSON line: duration_s, track_lufs, loops, duck_db, gain_db.
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
from scipy.signal import resample_poly

SR = 48000
TRACK_LUFS = -24.0


def integrated_lufs(x):
    with tempfile.TemporaryDirectory() as td:
        path = os.path.join(td, "m.wav")
        sf.write(path, np.asarray(x, dtype=np.float32).T, SR, subtype="FLOAT")
        r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True)
    return float(re.findall(r"I:\s*(-?[\d.]+) LUFS", r.stderr)[-1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--track", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--duration", type=float, required=True, help="video length, s")
    ap.add_argument("--speech", required=True, help="JSON [[start, end], …] of speech in the video")
    ap.add_argument("--gain", type=float, default=-4.0, help="dB over the −24 LUFS normalized track")
    ap.add_argument("--duck", type=float, default=-12.0, help="dB under speech")
    ap.add_argument("--fade-in", type=float, default=1.5)
    ap.add_argument("--fade-out", type=float, default=2.0)
    ap.add_argument("--start", type=float, default=0.0, help="bed starts here, s")
    ap.add_argument("--end", type=float, default=None, help="bed ends here, s (default: the end of the video)")
    a = ap.parse_args()

    audio, sr = sf.read(a.track, dtype="float64", always_2d=True)
    audio = audio.T if audio.shape[1] > 1 else np.vstack([audio[:, 0], audio[:, 0]])
    audio = audio[:2]
    if sr != SR:
        g = math.gcd(SR, sr)
        audio = resample_poly(audio, SR // g, sr // g, axis=1)
    track_lufs = integrated_lufs(audio)
    audio = audio * 10 ** ((TRACK_LUFS - track_lufs) / 20)

    total = int(round(a.duration * SR))
    start = max(0, int(round(a.start * SR)))
    end = min(total, int(round((a.end if a.end is not None else a.duration) * SR)))
    length = max(0, end - start)
    bed = np.zeros((2, length))
    xf = int(min(2.0, audio.shape[1] / SR / 4) * SR)
    pos, loops = 0, 0
    while pos < length:
        piece = audio[:, : min(audio.shape[1], length - pos + (xf if pos else 0))]
        if pos == 0:
            bed[:, : piece.shape[1]] = piece
            pos = piece.shape[1]
        else:
            ov = min(xf, piece.shape[1], pos)
            ramp = np.linspace(0, np.pi / 2, ov)
            bed[:, pos - ov: pos] = bed[:, pos - ov: pos] * np.cos(ramp) + piece[:, :ov] * np.sin(ramp)
            rest = min(piece.shape[1] - ov, length - pos)
            bed[:, pos: pos + rest] = piece[:, ov: ov + rest]
            pos += rest
            if rest <= 0:
                break
        loops += 1

    t = (np.arange(length) + start) / SR
    env = np.ones(length)
    fin, fout = int(a.fade_in * SR), int(a.fade_out * SR)
    if fin > 0:
        env[: min(fin, length)] *= np.linspace(0, 1, min(fin, length)) ** 2
    if fout > 0:
        env[-min(fout, length):] *= np.linspace(1, 0, min(fout, length)) ** 2

    # ducking at a 100 Hz control rate: target −duck dB inside speech, one-pole attack/release, then interpolated
    spans = json.load(open(a.speech, encoding="utf-8"))
    rate = 100
    n_ctl = int(math.ceil(length / SR * rate)) + 1
    ctl_t = start / SR + np.arange(n_ctl) / rate
    target = np.zeros(n_ctl)
    for s, e in spans:
        target[(ctl_t >= s - 0.08) & (ctl_t <= e + 0.12)] = 1.0
    depth = np.zeros(n_ctl)
    att, rel = 1 - math.exp(-1 / (0.12 * rate)), 1 - math.exp(-1 / (0.45 * rate))
    cur = 0.0
    for i, v in enumerate(target):
        cur += (v - cur) * (att if v > cur else rel)
        depth[i] = cur
    duck_db = np.interp(np.arange(length) / SR * rate, np.arange(n_ctl), depth) * a.duck
    bed *= env * 10 ** ((a.gain + duck_db) / 20)

    full = np.zeros((2, total))
    full[:, start: start + length] = bed[:, : total - start]
    peak = np.max(np.abs(full)) + 1e-12
    if peak > 10 ** (-3 / 20):
        full *= 10 ** (-3 / 20) / peak
    rng = np.random.default_rng(24)
    data = full.T + (rng.random(full.T.shape) - rng.random(full.T.shape)) / 32768.0
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    sf.write(a.out, np.clip(data, -1.0, 32767 / 32768), SR, subtype="PCM_16")
    print(json.dumps({"duration_s": round(total / SR, 3), "track_lufs": round(track_lufs, 2), "loops": loops, "duck_db": a.duck, "gain_db": a.gain}))


if __name__ == "__main__":
    main()
