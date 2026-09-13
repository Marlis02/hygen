#!/usr/bin/env python3
"""Film-grain tiles for the global overlay (deterministic, seeded).

The registry grain-overlay is a mid-grey SVG noise at low opacity: on this video's near-black grounds
it lifted black by ~8/255 while the grain itself stayed at ~2/255 — invisible after Shorts compression.
Two complementary 512×512 tileable PNGs built from ONE Gaussian field fix both: white speckles where
the field is positive, black speckles where it is negative. Stacked at low opacity they read as real
grain (~5–6/255 on black) and barely move the mean (≈ +4/255 on black, ≈ 0 on mid-tones).

    python3 scripts/assemble/make_grain.py   → assets/grain/grain-light.png, assets/grain/grain-dark.png
"""
import os
import struct
import zlib

import numpy as np
from scipy.ndimage import gaussian_filter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
N = 512


def png_rgba(path, rgba):
    h, w, _ = rgba.shape
    raw = b"".join(b"\x00" + rgba[y].tobytes() for y in range(h))
    chunk = lambda tag, data: struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)


def main():
    rng = np.random.default_rng(79)
    field = gaussian_filter(rng.standard_normal((N, N)), sigma=0.65, mode="wrap")  # ~1.5 px grain, tileable
    field /= field.std()
    for name, sign, rgb in (("grain-light", 1.0, 255), ("grain-dark", -1.0, 0)):
        alpha = np.clip(sign * field, 0, 3) / 3.0
        rgba = np.zeros((N, N, 4), np.uint8)
        rgba[..., :3] = rgb
        rgba[..., 3] = np.round(alpha * 255).astype(np.uint8)
        out = os.path.join(ROOT, "assets", "grain", f"{name}.png")
        png_rgba(out, rgba)
        print(f"  {os.path.relpath(out, ROOT)}: mean alpha {alpha.mean():.3f}, std {alpha.std():.3f}")


if __name__ == "__main__":
    main()
