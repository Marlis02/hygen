#!/usr/bin/env python3
"""Regression check: two contact sheets (tile by tile) or two folders of snapshots (file by file).

A tile «matches» when its mean absolute difference is at most --tile (default 3.0 of 255) and no
60×60 px block of it differs by more than --block (default 40). The mean is taken over lightly blurred
tiles (3×3): film grain differs between two renders of the same engine — up to 3.1 per pixel on a bright
film-memory frame — and averages out, while a leaked colour, a moved element or a missing layer do not.
The block is taken over the raw difference.

    python3 compare_frames.py a.contact.jpg b.contact.jpg --cols 6 --rows 2
    python3 compare_frames.py build-a/snapshots-verify build-b/snapshots-verify
"""
import argparse
import glob
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import uniform_filter

LABEL_H = 24  # contact sheet: label strip over every tile (engine/py/verify_mp4.py)


def load(path, size=None):
    im = Image.open(path).convert("RGB")
    if size and im.size != size:
        im = im.resize(size, Image.BOX)
    return np.asarray(im, dtype=np.float32)


def diff(a, b, block):
    d = np.abs(a - b).mean(axis=2)
    k = max(3, int(round(block)))
    soft = np.abs(uniform_filter(a, size=(3, 3, 1)) - uniform_filter(b, size=(3, 3, 1))).mean(axis=2)
    return float(soft.mean()), float(uniform_filter(d, size=k).max())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("a")
    ap.add_argument("b")
    ap.add_argument("--cols", type=int, default=0, help="tiles per row of a contact sheet (0 — detect from the width, 216 px)")
    ap.add_argument("--rows", type=int, default=2)
    ap.add_argument("--tile", type=float, default=3.0)
    ap.add_argument("--block", type=float, default=40.0)
    ap.add_argument("--json", default=None)
    a = ap.parse_args()
    rows = []
    sizes = None
    if os.path.isdir(a.a):
        fa = sorted(glob.glob(os.path.join(a.a, "**", "*.png"), recursive=True))
        fb = sorted(glob.glob(os.path.join(a.b, "**", "*.png"), recursive=True))
        for pa, pb in zip(fa, fb):
            ia = load(pa)
            ib = load(pb, (ia.shape[1], ia.shape[0]))
            m, blk = diff(ia, ib, ia.shape[1] / 18)
            rows.append({"tile": os.path.basename(pa), "mean": round(m, 2), "block": round(blk, 1)})
    else:
        ia, ib = load(a.a), load(a.b)
        sizes = {"a": [ia.shape[1], ia.shape[0]], "b": [ib.shape[1], ib.shape[0]]}
        if ia.shape != ib.shape:
            ib = load(a.b, (ia.shape[1], ia.shape[0]))
        cols = a.cols or max(1, ia.shape[1] // 216)
        tw, th = ia.shape[1] // cols, ia.shape[0] // a.rows
        for r in range(a.rows):
            for c in range(cols):
                ta = ia[r * th + LABEL_H:(r + 1) * th, c * tw:(c + 1) * tw]
                tb = ib[r * th + LABEL_H:(r + 1) * th, c * tw:(c + 1) * tw]
                m, blk = diff(ta, tb, tw / 18)
                rows.append({"tile": f"r{r + 1}c{c + 1}", "mean": round(m, 2), "block": round(blk, 1)})
    ok_rows = [r for r in rows if r["mean"] <= a.tile and r["block"] <= a.block]
    for r in rows:
        mark = "✓" if r in ok_rows else "✗"
        print(f"{mark} {r['tile']:<40} среднее {r['mean']:5.2f}  блок {r['block']:5.1f}")
    ok = len(ok_rows) == len(rows) and rows
    print(f"{'✓' if ok else '✗'} совпало {len(ok_rows)} из {len(rows)} (порог: среднее ≤ {a.tile}, блок ≤ {a.block})")
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump({"ok": bool(ok), "tiles": rows, "sizes": sizes}, f, ensure_ascii=False, indent=2)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
