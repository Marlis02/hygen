#!/usr/bin/env python3
"""Mix report for a rendered MP4: integrated loudness (target −14 LUFS), true peak, and how far the
voice sits above the beds.

    python3 scripts/verify/mix_report.py renders/draft.mp4 [--suggest]

Speech windows come from assets/voice/voice_manifest.json + the frame starts in audio_timeline.json;
"bed" windows are the pauses inside frames 2–5 where only the drone/SFX play. --suggest prints the
linear gain that would land the master on −14.0 LUFS.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TARGET = -14.0


def ebur128(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    tail = r.stderr[r.stderr.rfind("Summary:"):]
    get = lambda key: float(re.search(rf"{key}:\s*(-?[\d.]+|-inf)", tail).group(1).replace("-inf", "-120"))
    return {"I": get("I"), "LRA": get("LRA"), "TP": get("Peak")}


def k_weight_lufs(x, sr):
    # simplified short-term loudness proxy (K-weighting approximated by a 2nd-order high-shelf + HPF)
    from scipy.signal import butter, sosfilt
    hp = butter(2, 60, "high", fs=sr, output="sos")
    y = sosfilt(hp, x, axis=0)
    ms = np.mean(y ** 2)
    return -0.691 + 10 * np.log10(ms + 1e-12)


def main():
    mp4 = sys.argv[1]
    suggest = "--suggest" in sys.argv
    if not os.path.exists(mp4):
        sys.exit(f"✗ mix report: {mp4} does not exist")
    m = ebur128(mp4)
    print(f"master: I = {m['I']:.1f} LUFS · LRA {m['LRA']:.1f} LU · true peak {m['TP']:.1f} dBTP "
          f"(target {TARGET} LUFS, TP ≤ −1.0)")
    man = json.load(open(os.path.join(ROOT, "assets/voice/voice_manifest.json"), encoding="utf-8"))
    tl = json.load(open(os.path.join(ROOT, "audio_timeline.json"), encoding="utf-8"))
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, "a.wav")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp4, "-vn", "-ac", "2", "-ar", "48000", wav], check=True)
        x, sr = sf.read(wav)
    speech, beds = [], []
    for line, start in zip(man["lines"], tl["frame_starts_s"]):
        a, b = start + line["speech_start_s"], start + line["speech_end_s"]
        seg = x[int(a * sr):int(b * sr)]
        if len(seg):
            speech.append(k_weight_lufs(seg, sr))
        if line["frame"] in (2, 3, 4, 5) and line["speech_start_s"] > 0.15:
            pre = x[int((start + 0.05) * sr):int((start + line["speech_start_s"] - 0.02) * sr)]
            if len(pre) > sr * 0.1:
                beds.append(k_weight_lufs(pre, sr))
    # the finale's first two seconds must be (nearly) silent apart from the thud tail
    f6 = tl["frame_starts_s"][5]
    silence = x[int((f6 + 1.2) * sr):int((f6 + 1.95) * sr)]
    print(f"speech windows: {np.mean(speech):.1f} dB (proxy) · pre-speech bed windows: "
          f"{(np.mean(beds) if beds else float('nan')):.1f} dB · finale silence tail: {k_weight_lufs(silence, sr):.1f} dB")
    if suggest:
        gain_db = TARGET - m["I"]
        print(f"suggest: scale every bus by {10 ** (gain_db / 20):.3f} ({gain_db:+.1f} dB); "
              f"true peak after gain ≈ {m['TP'] + gain_db:.1f} dBTP")


if __name__ == "__main__":
    main()
