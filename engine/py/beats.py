#!/usr/bin/env python3
"""Beat grid of a music track — once per track, cached by the build in .cache/beats/<sha>.json (devices with sync: music).

    python3 beats.py engine/assets/music/test-beat-100.wav --out .cache/beats/<sha>.json

Deterministic, numpy + scipy (librosa is not a dependency of the engine):
  onset strength  log-compressed spectral flux (STFT 2048 / hop 256 at 22.05 kHz, positive differences over 48 bands,
                  a 0.4 s moving mean removed);
  tempo           autocorrelation of the onset envelope over 60–180 BPM with a wide log-normal prior around 110 BPM,
                  refined by parabolic interpolation;
  phase           the offset whose grid collects the most onset strength;
  beats           that grid over the whole track, each beat snapped to the envelope peak within ±60 ms;
  downbeats       every 4th beat, the bar phase with the most onset strength (strong beats).
Prints one JSON line: bpm, period, beats, downbeats, duration.
"""
import argparse
import json
import math
import os
import subprocess
import tempfile

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly, stft

SR = 22050
N = 2048
HOP = 256


def load(path):
    try:
        x, sr = sf.read(path, always_2d=True)
    except RuntimeError:
        with tempfile.TemporaryDirectory() as td:
            wav = os.path.join(td, "a.wav")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ac", "1", "-ar", str(SR), wav], check=True)
            x, sr = sf.read(wav, always_2d=True)
    x = x.mean(axis=1)
    if sr != SR:
        g = math.gcd(SR, sr)
        x = resample_poly(x, SR // g, sr // g)
    return x.astype(np.float64)


def onset_envelope(x):
    _, _, z = stft(x, fs=SR, nperseg=N, noverlap=N - HOP, boundary=None, padded=False)
    s = np.log1p(100.0 * np.abs(z))
    edges = np.unique(np.geomspace(1, s.shape[0] - 1, 49).astype(int))
    bands = np.stack([s[a:b].mean(axis=0) for a, b in zip(edges[:-1], edges[1:])])
    flux = np.maximum(0.0, np.diff(bands, axis=1)).sum(axis=0)
    flux = np.concatenate([[0.0], flux])
    w = max(1, int(0.4 * SR / HOP))
    flux = np.maximum(0.0, flux - np.convolve(flux, np.ones(w) / w, mode="same"))
    return flux / (flux.max() + 1e-12)


def frame_time(i):
    return (i * HOP + N / 2) / SR


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("track")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    x = load(a.track)
    env = onset_envelope(x)
    fps = SR / HOP
    n = len(env)
    ac = np.correlate(env - env.mean(), env - env.mean(), mode="full")[n - 1:]
    lo, hi = int(60 * fps / 180), int(math.ceil(60 * fps / 60))
    lags = np.arange(lo, min(hi, n - 1))
    bpm = 60 * fps / lags
    score = ac[lags] * np.exp(-0.5 * (np.log2(bpm / 110.0) / 0.9) ** 2)
    k = int(np.argmax(score))
    lag = float(lags[k])
    if 0 < k < len(lags) - 1:
        y0, y1, y2 = score[k - 1], score[k], score[k + 1]
        den = y0 - 2 * y1 + y2
        if abs(den) > 1e-12:
            lag += 0.5 * (y0 - y2) / den
    period = lag
    best, phase = -1.0, 0.0
    for off in np.arange(0, period, 0.25):
        idx = np.round(off + np.arange(0, (n - off) / period) * period).astype(int)
        idx = idx[idx < n]
        v = env[idx].sum()
        if v > best:
            best, phase = v, off
    snap = max(1, int(0.06 * fps))
    beats = []
    first = phase - period if phase - period >= -0.06 * fps else phase
    for i in np.arange(first, n, period):
        c = max(0, int(round(i)))
        a0, b0 = max(0, c - snap), min(n, c + snap + 1)
        j = a0 + int(np.argmax(env[a0:b0])) if env[a0:b0].max() > 0.05 else c
        beats.append(round(frame_time(j), 3))
    beats = sorted(set(beats))
    energy = [sum(env[int(round((t * SR - N / 2) / HOP))] for t in beats[p::4] if 0 <= int(round((t * SR - N / 2) / HOP)) < n) for p in range(4)]
    bar = int(np.argmax(energy)) if beats else 0
    out = {
        "bpm": round(60 * fps / period, 2),
        "period": round(period / fps, 4),
        "beats": beats,
        "downbeats": beats[bar::4],
        "duration": round(len(x) / SR, 3),
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    tmp = a.out + ".part"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f)
    os.replace(tmp, a.out)
    print(json.dumps({"bpm": out["bpm"], "beats": len(beats), "downbeats": len(out["downbeats"]), "duration": out["duration"]}))


if __name__ == "__main__":
    main()
