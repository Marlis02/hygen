#!/usr/bin/env python3
"""Russian voiceover for pompeii-short.

`npx hyperframes tts` is Kokoro-82M, which has no Russian (`--lang ru` is rejected), so the
narration is synthesized locally with Silero TTS (`v5_ru`, speaker `eugene`: male, low).

The spoken text is read from SCRIPT.md (the locked narration). The SSML below only adds TTS
markup — stress marks (`+` before the stressed vowel) and pauses — and is verified word-for-word
against SCRIPT.md before anything is synthesized, so the voice can never drift from the script.

Loudness is set here, at the source. The render engine has no master bus (clips are summed as-is and
a bus fader sits after each clip's limiter), so every line gets exactly the level the −14 LUFS master
needs: −16.2 LUFS integrated as a mono file (≈ −13.2 LUFS once duplicated into the stereo mix),
true peak ≤ −2.5 dBTP. A transparent look-ahead limiter shaves only the few loudest peaks — no
compression, the delivery stays calm and every line lands at the same loudness.

Output per frame: assets/voice/NN.wav (48 kHz mono 16-bit) = lead silence + speech + tail silence.
The pads are part of the frame timing: frame duration == wav duration (audio.mjs sync-durations).

    python3 scripts/voice/make_voice.py
    SILERO_MODEL=v4_ru python3 scripts/voice/make_voice.py
"""
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf
import torch
from scipy.ndimage import minimum_filter1d
from scipy.signal import resample_poly

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SR = 48000
MODEL = os.environ.get("SILERO_MODEL", "v5_ru")
SPEAKER = os.environ.get("SILERO_SPEAKER", "eugene")
RATE = os.environ.get("SILERO_RATE", "medium")
PITCH = os.environ.get("SILERO_PITCH", "low")
TARGET_LUFS = -16.2  # mono measurement; the stereo mix plays it ~3 LU louder
CEILING_DBTP = -2.5


def B(ms):
    return f'<break time="{ms}ms"/>'


S, L = B(320), B(130)  # sentence pause, list pause

SSML = {
    1: "За восемн+адцать час+ов процвет+ающий г+ород перест+ал существов+ать.",
    2: f"Помп+еи — р+имский портов+ый г+ород. {S} +Около од+иннадцати т+ысяч ж+ителей. {S} "
    f"Т+ермы, {L} амфите+атр, {L} водопров+од. {S} Вулк+ан р+ядом счит+али об+ычной гор+ой.",
    3: f"С+емьдесят дев+ятый год н+ашей +эры. {S} Вез+увий выбр+асывает кол+онну п+епла на тр+идцать килом+етров. {S} "
    f"С н+еба п+адает п+емза {B(150)} по н+ескольку сантим+етров в час. {S} Кр+ыши не выд+ерживают.",
    4: f"Под +утро кол+онна обр+ушивается. {S} Раскал+ённая лав+ина ид+ёт со скл+она со ск+оростью +около ст+а килом+етров в час. {S} "
    f"Г+ород запеч+атывает слой п+епла в чет+ыре {B(90)} ш+есть м+етров.",
    # micro-pauses after «Помпеи», «век», «археологи»: without them whisper hears «Помпея находит» /
    # «археологии начинает» (checked variant-by-variant with large-v3-turbo) — they buy clarity.
    5: f"Помп+еи {B(80)} нах+одят т+олько в т+ысяча семьс+от с+орок восьм+ом год+у. {S} "
    f"Ч+ерез век {B(60)} археол+оги {B(60)} начин+ают залив+ать гипс в пуст+оты на м+есте тел.",
    6: "Треть г+орода не раск+опана до сих пор.",
}

# (lead, tail) silence in seconds. Frame 4 opens under the flash-through-white transition, so its
# voice waits for the flash to peak; frame 6 opens on two seconds of silence and ends on a held card.
PADS = {1: (0.30, 0.40), 2: (0.20, 0.40), 3: (0.20, 0.40), 4: (0.60, 0.40), 5: (0.20, 0.40), 6: (2.00, 1.60)}


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
        m = re.match(r"^(?: {4,}|\t)(.+)$", line)
        if m:
            out[cur] = (out[cur] + " " + m.group(1).strip()).strip()
    return out


def words(text):
    text = re.sub(r"<[^>]+>", " ", text).replace("+", "")
    text = re.sub(r"[–—-]", " ", text.lower())
    return re.findall(r"[а-яё0-9]+", text)


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
    script = parse_script(open(os.path.join(ROOT, "SCRIPT.md"), encoding="utf-8").read())
    for frame, ssml in SSML.items():
        if words(ssml) != words(script.get(frame, "")):
            sys.exit(f"✗ frame {frame}: SSML text drifted from SCRIPT.md\n  ssml:   {words(ssml)}\n  script: {words(script.get(frame, ''))}")
    print(f"· SSML verified against SCRIPT.md ({len(SSML)} lines)")

    torch.set_num_threads(8)
    model, _ = torch.hub.load("snakers4/silero-models", "silero_tts", language="ru", speaker=MODEL,
                              trust_repo=True, verbose=False)
    out_dir = os.path.join(ROOT, "assets", "voice")
    os.makedirs(out_dir, exist_ok=True)
    manifest = {"provider": "silero", "model": MODEL, "speaker": SPEAKER, "rate": RATE, "pitch": PITCH,
                "sample_rate": SR, "target_lufs_mono": TARGET_LUFS, "ceiling_dbtp": CEILING_DBTP, "lines": []}
    rng = np.random.default_rng(1748)
    for frame, ssml in SSML.items():
        doc = f'<speak><prosody rate="{RATE}" pitch="{PITCH}">{ssml}</prosody></speak>'
        audio = model.apply_tts(ssml_text=doc, speaker=SPEAKER, sample_rate=SR).numpy().astype(np.float64)
        thr = 10 ** (-45 / 20) * np.max(np.abs(audio))
        idx = np.where(np.abs(audio) > thr)[0]
        speech = audio[max(0, idx[0] - int(0.005 * SR)): idx[-1] + int(0.02 * SR)]
        fade = int(0.004 * SR)
        speech[:fade] *= np.linspace(0, 1, fade)
        speech[-fade:] *= np.linspace(1, 0, fade)
        speech = master_line(speech)
        lead, tail = PADS[frame]
        full = np.concatenate([np.zeros(int(lead * SR)), speech, np.zeros(int(tail * SR))])
        full = full + (rng.random(full.shape) - rng.random(full.shape)) / 32768.0 * (np.abs(full) > 0)
        path = os.path.join(out_dir, f"{frame:02d}.wav")
        sf.write(path, np.clip(full, -1.0, 32767 / 32768), SR, subtype="PCM_16")
        entry = {"frame": frame, "path": f"assets/voice/{frame:02d}.wav", "duration_s": round(len(full) / SR, 3),
                 "speech_start_s": lead, "speech_end_s": round(lead + len(speech) / SR, 3),
                 "lufs_mono": round(integrated_lufs(speech), 2), "true_peak_dbtp": round(true_peak(speech), 2),
                 "text": script[frame]}
        manifest["lines"].append(entry)
        print(f"  frame {frame}: {entry['duration_s']:.3f}s (speech {entry['speech_start_s']:.2f}–{entry['speech_end_s']:.2f}) "
              f"· {entry['lufs_mono']} LUFS · TP {entry['true_peak_dbtp']} dBTP")
    total = sum(l["duration_s"] for l in manifest["lines"])
    manifest["total_duration_s"] = round(total, 3)
    with open(os.path.join(out_dir, "voice_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"✓ voice: {len(manifest['lines'])} lines, total {total:.2f}s → assets/voice/")


if __name__ == "__main__":
    main()
