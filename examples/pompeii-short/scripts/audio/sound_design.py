#!/usr/bin/env python3
"""Procedural score + SFX for pompeii-short (deterministic, seeded).

HeyGen's music/SFX catalog needs a signed-in account and the bundled SFX library has no drone or
falling-ash texture, so the sound bed is generated here from the real frame timeline:

  assets/music/drone.wav     low drone under the whole piece: swells to its peak when the eruption
                             starts (the brief's "12th second"), holds the tension, and is CUT hard at
                             the start of the final beat (the brief's "32nd second" — the silence).
  assets/sfx/thud.wav        muffled low impact for the hard cuts between beats
  assets/sfx/thud-heavy.wav  bigger, longer impact for the flash-through-white cut (beat 3 → 4)
  assets/sfx/ash-fall.wav    rustle of falling ash / pumice for beats 3–4

    python3 scripts/audio/sound_design.py --timeline audio_timeline.json

audio_timeline.json: { "peak_s": float, "cut_s": float, "ash_duration_s": float,
                       "ash_swell_s": float, "ash_debris_s": float }
All times are seconds; ash times are relative to the start of beat 3.
"""
import argparse
import json
import os

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, sosfiltfilt

SR = 48000
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def db(x):
    return 10 ** (x / 20)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x, axis=-1)


def lowpass(x, fc, order=2, zero_phase=False):
    sos = butter(order, fc, btype="low", fs=SR, output="sos")
    return sosfiltfilt(sos, x, axis=-1) if zero_phase else sosfilt(sos, x, axis=-1)


def highpass(x, fc, order=2):
    return sosfilt(butter(order, fc, btype="high", fs=SR, output="sos"), x, axis=-1)


def pink(n, rng):
    # Voss-McCartney-ish via spectral shaping of white noise
    white = rng.standard_normal(n)
    spec = np.fft.rfft(white)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = 1
    spec /= np.sqrt(f)
    out = np.fft.irfft(spec, n)
    return out / (np.max(np.abs(out)) + 1e-9)


def brown(n, rng):
    x = np.cumsum(rng.standard_normal(n))
    x = highpass(x, 20)
    return x / (np.max(np.abs(x)) + 1e-9)


def normalize(x, peak_db):
    return x * (db(peak_db) / (np.max(np.abs(x)) + 1e-9))


def write(rel, stereo):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # 16-bit PCM: the render engine's audio-fx reader only accepts 16-bit PCM or 32-bit float WAV
    # (24-bit sources fail the mix with "Unsupported WAV format"). TPDF dither before quantizing.
    data = np.asarray(stereo, dtype=np.float64).T
    rng = np.random.default_rng(16)
    data = data + (rng.random(data.shape) - rng.random(data.shape)) / 32768.0
    sf.write(path, np.clip(data, -1.0, 32767 / 32768), SR, subtype="PCM_16")
    print(f"  {rel}: {stereo.shape[-1] / SR:.2f}s")


# ── drone ───────────────────────────────────────────────────────────────────────
def drone(peak_s, cut_s, rng):
    n = int(round(cut_s * SR))
    t = np.arange(n) / SR
    # level envelope in dB: slow swell to the peak, then a held, slowly breathing plateau that leans
    # a touch further forward into the cut (the cut lands on a full drone, never a fading one)
    u = np.clip(t / peak_s, 0, 1)
    env_db = -26 + 26 * (1 - (1 - u) ** 2.2)
    after = t > peak_s
    lean = np.clip((t - peak_s) / max(cut_s - peak_s, 1e-3), 0, 1)
    env_db = np.where(after, 1.5 * np.sin(2 * np.pi * 0.07 * (t - peak_s)) * 0.5 + 1.2 * lean, env_db)
    env = db(env_db)
    bright = np.clip(u, 0, 1) ** 1.3 * 0.75 + 0.25 * np.where(after, 1, 0)  # 0..1 filter opening

    out = np.zeros((2, n))
    # 1) sub + weight: D1 / A1 through soft saturation (its harmonics are what a phone speaker plays)
    for ch, det in enumerate((-0.07, 0.07)):
        sub = 0.62 * np.sin(2 * np.pi * (36.71 + det) * t) + 0.38 * np.sin(2 * np.pi * (55.0 - det) * t + 0.7)
        # kept modest: sub-bass carries big sample peaks but almost no loudness — it ate the mix's
        # true-peak headroom under the voice while a phone speaker cannot play it anyway
        out[ch] += 0.28 * np.tanh(2.4 * sub)
    # 2) dark minor pad (D2 A2 D3 F3): additive saws, low-passed by a cutoff that opens with the swell.
    # The 150–900 Hz body is what reads as "гул" on phones — keep it present even before the peak.
    fc = 320 + 1300 * bright  # Hz
    notes = [73.42, 110.0, 146.83, 174.61]
    for ch in range(2):
        for k, f0 in enumerate(notes):
            det = (0.11 if ch else -0.11) * (1 + 0.3 * k)
            phase0 = rng.uniform(0, 2 * np.pi)
            for h in range(1, 26):
                fh = (f0 + det) * h
                if fh > 5000:
                    break
                g = (1.0 / h) / np.sqrt(1 + (fh / fc) ** 4)
                out[ch] += 0.085 * g * np.sin(2 * np.pi * fh * t + phase0 * h)
    # 3) dread interval (A-flat2 + E-flat3) creeping in before the peak
    dread = np.clip((t - (peak_s - 3.0)) / 5.0, 0, 1) ** 1.5
    for ch in range(2):
        beat = 0.23 if ch else 0.31
        out[ch] += dread * 0.10 * (np.sin(2 * np.pi * 103.83 * t) + 0.7 * np.sin(2 * np.pi * (155.56 + beat) * t))
    # 4) sub rumble + 5) distant air
    for ch in range(2):
        out[ch] += 0.30 * bandpass(brown(n, rng), 35, 200) * (0.4 + 0.6 * bright)
        air = bandpass(pink(n, rng), 380, 1600)
        out[ch] += 0.045 * air * (0.6 + 0.4 * np.sin(2 * np.pi * (0.061 + 0.013 * ch) * t)) * bright
    # slow organic movement
    for ch in range(2):
        out[ch] *= 1 + 0.08 * np.sin(2 * np.pi * (0.11 + 0.02 * ch) * t + ch)
    out *= env
    out = highpass(out, 34)
    fade_in = int(0.8 * SR)
    out[:, :fade_in] *= np.linspace(0, 1, fade_in) ** 2
    cut = int(0.012 * SR)  # a hard cut, de-clicked
    out[:, -cut:] *= np.linspace(1, 0, cut)
    return normalize(out, -1.0)


# ── thud ────────────────────────────────────────────────────────────────────────
def thud(rng, heavy=False):
    dur = 2.6 if heavy else 1.7
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = (36 if heavy else 42) + (84 if heavy else 66) * np.exp(-t / (0.085 if heavy else 0.06))
    phase = 2 * np.pi * np.cumsum(f) / SR
    amp = (1 - np.exp(-t / 0.003)) * np.exp(-t / (0.42 if heavy else 0.27))
    body = np.tanh(2.2 * np.sin(phase) * amp)  # saturation → 2nd/3rd harmonics for small speakers
    click = lowpass(rng.standard_normal(n), 650) * np.exp(-t / 0.012) * 0.55
    tail = lowpass(brown(n, rng), 170) * np.exp(-t / (0.9 if heavy else 0.5)) * (0.45 if heavy else 0.3)
    mono = lowpass(body + click + tail, 1300 if heavy else 1100, order=2)
    mono = highpass(mono, 26)
    end = int(0.25 * SR)
    mono[-end:] *= np.linspace(1, 0, end)
    return normalize(np.stack([mono, mono]), -1.0)


# ── ash fall ────────────────────────────────────────────────────────────────────
def ash_fall(duration_s, swell_s, debris_s, rng):
    n = int(duration_s * SR)
    t = np.arange(n) / SR
    # intensity: a faint sift from the start, a real fall from the pumice line, peak on the roof
    # collapse, staying heavy through the flow, then thinning out as the city is sealed
    inten = 0.18 + 0.22 * np.clip(t / max(swell_s, 1e-3), 0, 1)
    inten += 0.45 * np.clip((t - swell_s) / 2.5, 0, 1)
    inten += 0.15 * np.exp(-((t - debris_s) / 1.2) ** 2)
    inten *= np.clip((duration_s - t) / 3.0, 0, 1) ** 1.2
    inten *= np.clip(t / 0.6, 0, 1)
    out = np.zeros((2, n))
    for ch in range(2):
        # continuous sifting hiss
        hiss = bandpass(pink(n, rng), 900, 6500)
        slow = lowpass(rng.standard_normal(n), 3.0, zero_phase=True)
        slow = 0.65 + 0.35 * slow / (np.max(np.abs(slow)) + 1e-9)
        out[ch] += 0.35 * hiss * slow * inten
        # granular crackle: sparse decaying noise grains whose density follows the intensity
        dens = 60 + 520 * inten  # grains per second
        trig = rng.random(n) < dens / SR
        imp = np.zeros(n)
        imp[trig] = rng.random(trig.sum()) ** 2.5
        grain = np.exp(-np.arange(int(0.012 * SR)) / (0.0035 * SR))
        crackle = np.convolve(imp, grain, mode="same")
        out[ch] += 0.9 * bandpass(rng.standard_normal(n) * crackle, 1800, 9000)
        # small pebble ticks
        ticks = rng.random(n) < (4 + 22 * inten) / SR
        timp = np.zeros(n)
        timp[ticks] = rng.random(ticks.sum()) ** 2
        tick_env = np.exp(-np.arange(int(0.008 * SR)) / (0.0018 * SR)) * np.sin(
            2 * np.pi * rng.uniform(2200, 3800) * np.arange(int(0.008 * SR)) / SR)
        out[ch] += 0.35 * np.convolve(timp, tick_env, mode="same")
        # faint debris body underneath
        out[ch] += 0.18 * bandpass(brown(n, rng), 90, 420) * inten
    out = highpass(out, 60)
    return normalize(out, -3.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeline", default=os.path.join(ROOT, "audio_timeline.json"))
    args = ap.parse_args()
    tl = json.load(open(args.timeline, encoding="utf-8"))
    print("· sound design", json.dumps(tl))
    write("assets/music/drone.wav", drone(tl["peak_s"], tl["cut_s"], np.random.default_rng(7901)))
    write("assets/sfx/thud.wav", thud(np.random.default_rng(79)))
    write("assets/sfx/thud-heavy.wav", thud(np.random.default_rng(80), heavy=True))
    write("assets/sfx/ash-fall.wav",
          ash_fall(tl["ash_duration_s"], tl["ash_swell_s"], tl["ash_debris_s"], np.random.default_rng(1748)))
    print("✓ sound design done")


if __name__ == "__main__":
    main()
