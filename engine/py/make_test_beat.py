#!/usr/bin/env python3
"""Procedural test track with a clear beat for sync: music — library/music/test-beat-100.wav (CC0).

    python3 engine/py/make_test_beat.py library/music/test-beat-100.wav

100 BPM, 30 bars of 4/4 (72 s — longer than a Short, so the bed never loops and the grid stays whole): a kick on every
beat (the downbeat louder, with a low bass note), a clap on 2 and 4, closed hats on eighths, a soft pad on a four-chord
loop (Am F C G, two bars each). Noise comes from a seeded generator: the same file every run. 22.05 kHz mono, 16-bit.
"""
import sys

import numpy as np
import soundfile as sf

SR = 22050
BPM = 100
BARS = 30
BEAT = 60.0 / BPM


def env(n, attack, decay):
    t = np.arange(n) / SR
    return np.minimum(1.0, t / max(attack, 1e-4)) * np.exp(-t / decay)


def main():
    out = sys.argv[1]
    rng = np.random.default_rng(100)
    total = int(BARS * 4 * BEAT * SR)
    mix = np.zeros(total)

    def put(sig, at):
        i = int(round(at * SR))
        j = min(total, i + len(sig))
        if i < total:
            mix[i:j] += sig[: j - i]

    kick_n = int(0.32 * SR)
    t = np.arange(kick_n) / SR
    freq = 45 + 85 * np.exp(-t / 0.045)
    kick = np.sin(2 * np.pi * np.cumsum(freq) / SR) * env(kick_n, 0.002, 0.11)
    clap_n = int(0.16 * SR)
    clap_noise = rng.standard_normal(clap_n)
    clap = (clap_noise - np.convolve(clap_noise, np.ones(6) / 6, mode="same")) * env(clap_n, 0.001, 0.045)
    hat_n = int(0.05 * SR)
    hat_noise = rng.standard_normal(hat_n)
    hat = (hat_noise - np.convolve(hat_noise, np.ones(3) / 3, mode="same")) * env(hat_n, 0.0005, 0.012)
    chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
    roots = [45, 41, 36, 43]

    for bar in range(BARS):
        t0 = bar * 4 * BEAT
        ch = (bar // 2) % 4
        pad_n = int(4 * BEAT * SR)
        tp = np.arange(pad_n) / SR
        pad = sum(np.sin(2 * np.pi * 440 * 2 ** ((m - 69) / 12) * tp) for m in chords[ch]) / 3
        pad *= np.minimum(1, tp / 0.4) * np.minimum(1, (4 * BEAT - tp) / 0.4) * 0.07
        put(pad, t0)
        bass_n = int(2 * BEAT * SR)
        tb = np.arange(bass_n) / SR
        f0 = 440 * 2 ** ((roots[ch] - 69) / 12)
        bass = (2 / np.pi) * np.arcsin(np.sin(2 * np.pi * f0 * tb)) * env(bass_n, 0.005, 0.5) * 0.22
        put(bass, t0)
        for b in range(4):
            tb0 = t0 + b * BEAT
            put(kick * (1.0 if b == 0 else 0.72), tb0)
            if b in (1, 3):
                put(clap * 0.42, tb0)
            put(hat * 0.16, tb0 + BEAT / 2)
            put(hat * 0.1, tb0)

    mix /= np.abs(mix).max() / 0.89
    sf.write(out, mix.astype(np.float32), SR, subtype="PCM_16")
    print({"file": out, "seconds": round(total / SR, 2), "bpm": BPM, "beats": BARS * 4})


if __name__ == "__main__":
    main()
