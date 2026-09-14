#!/usr/bin/env python3
"""Contrast of the captions against what lies under them — before the render (engine/src/captions.ts).

    python3 caption_contrast.py build/.captions-probe probe.json

probe.json: [{"t": 3.2, "beat": "01-hook", "rect": [x0, y0, x1, y1], "text": "#ECE7DE"}, …] — px of the 1080×1920 frame.
The snapshots in the folder are frames of the video with the captions layer empty. For every sample the background is the
crop of the rect; a light text is read against the brightest 10 % of the crop, a dark text against the darkest 10 %, so
a bright patch behind a word counts. WCAG contrast (relative luminance, sRGB). Prints one JSON line:
{"beats": {"01-hook": {"contrast": 5.9, "t": 3.2}, …}}, the worst sample per beat.
"""
import glob
import json
import os
import re
import sys

import numpy as np
from PIL import Image


def lin(v):
    v = np.asarray(v, dtype=np.float64) / 255.0
    return np.where(v <= 0.03928, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def luminance(rgb):
    c = lin(rgb)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def stamp(path):
    found = re.findall(r"(\d+(?:\.\d+)?)s", os.path.basename(path))
    return float(found[-1]) if found else None


def main():
    folder, probe_path = sys.argv[1], sys.argv[2]
    probe = json.load(open(probe_path, encoding="utf-8"))
    files = [(stamp(p), p) for p in sorted(glob.glob(os.path.join(folder, "**", "*.png"), recursive=True))]
    files = [(t, p) for t, p in files if t is not None]
    beats = {}
    cache = {}
    for s in probe:
        if not files:
            break
        path = min(files, key=lambda tp: abs(tp[0] - s["t"]))[1]
        if path not in cache:
            img = Image.open(path).convert("RGB")
            if img.size != (1080, 1920):
                img = img.resize((1080, 1920))
            cache[path] = np.asarray(img)
        x0, y0, x1, y1 = [int(round(v)) for v in s["rect"]]
        crop = cache[path][max(0, y0):min(1920, y1), max(0, x0):min(1080, x1)]
        if crop.size == 0:
            continue
        lb = luminance(crop.reshape(-1, 3))
        hexc = s["text"].lstrip("#")
        lt = float(luminance(np.array([[int(hexc[i:i + 2], 16) for i in (0, 2, 4)]]))[0])
        if lt >= float(np.median(lb)):
            bg = float(np.percentile(lb, 90))
        else:
            bg = float(np.percentile(lb, 10))
        ratio = (max(lt, bg) + 0.05) / (min(lt, bg) + 0.05)
        cur = beats.get(s["beat"])
        if cur is None or ratio < cur["contrast"]:
            beats[s["beat"]] = {"contrast": round(ratio, 2), "t": s["t"]}
    print(json.dumps({"beats": beats}))


if __name__ == "__main__":
    main()
