#!/usr/bin/env python3
"""Media background of a beat — hygen engine (library/scenes/CONTRACT.md, «Фон бита»).

A licensed photo or video is cropped to the 1080×1920 frame around its focus point and treated at build time,
so the render only moves pixels (ken-burns, parallax) and never filters them per frame:

  duotone   luminance → three palette stops (shadow, mid, highlight of the look)
  blur      gaussian blur, darkened
  (none)    the original colours, darkened a little so the scene stays on top

Images → JPEG, videos → looped/trimmed H.264 without sound (ffmpeg), exactly `--duration` long.

    python3 background.py in.jpg out.jpg --focus 0.5 0.45 --treatment duotone ken-burns \
        --stops "#060A0D" "#185C62" "#BDE6F2" [--overscan 1.1]
    python3 background.py in.webm out.mp4 --duration 6.2 --fps 30 --treatment duotone --stops …
"""
import argparse
import json
import os
import subprocess

import numpy as np
from PIL import Image, ImageFilter

W, H = 1080, 1920


def even(v):
    """libx264 with yuv420p needs even frame sizes: 1080 × 1.12 = 1209 px failed with «Generic error in an external library»."""
    return int(v) // 2 * 2


def hex_rgb(h):
    return [int(h[i:i + 2], 16) for i in (1, 3, 5)]


def cover_box(iw, ih, fx, fy, ow, oh):
    """Crop box of aspect ow:oh inside iw×ih, centred on the focus (fractions of the image), clamped."""
    scale = max(ow / iw, oh / ih)
    cw, ch = ow / scale, oh / scale
    x = min(max(fx * iw - cw / 2, 0), iw - cw)
    y = min(max(fy * ih - ch / 2, 0), ih - ch)
    return (int(round(x)), int(round(y)), int(round(x + cw)), int(round(y + ch)))


def duotone_lut(stops):
    s, m, h = (np.array(hex_rgb(c), dtype=np.float32) for c in stops)
    v = np.arange(256, dtype=np.float32)[:, None] / 255.0
    low = s + (m - s) * np.clip(v / 0.5, 0, 1)
    high = m + (h - m) * np.clip((v - 0.5) / 0.5, 0, 1)
    return np.where(v < 0.5, low, high).clip(0, 255).astype(np.uint8)


def image(a):
    im = Image.open(a.src).convert("RGB")
    ow, oh = even(W * a.overscan), even(H * a.overscan)
    im = im.crop(cover_box(im.width, im.height, a.focus[0], a.focus[1], ow, oh)).resize((ow, oh), Image.LANCZOS)
    arr = np.asarray(im, dtype=np.float32)
    if "blur" in a.treatment:
        im = Image.fromarray(arr.astype(np.uint8)).filter(ImageFilter.GaussianBlur(18))
        arr = np.asarray(im, dtype=np.float32) * 0.62
    if "duotone" in a.treatment:
        lum = (arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114).clip(0, 255)
        # stretch contrast so every photo spans the three stops (old photos are grey and flat)
        lo, hi = np.percentile(lum, 2), np.percentile(lum, 98)
        lum = ((lum - lo) / max(hi - lo, 1) * 255).clip(0, 255).astype(np.uint8)
        arr = duotone_lut(a.stops)[lum].astype(np.float32)
    elif "blur" not in a.treatment:
        arr = arr * 0.8
    part = a.out + ".part.jpg"  # the cache must never hold a half-written file
    Image.fromarray(arr.clip(0, 255).astype(np.uint8)).save(part, quality=88)
    os.replace(part, a.out)
    return {"width": ow, "height": oh}


def video(a):
    ow, oh = even(W * a.overscan), even(H * a.overscan)
    probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                       "-of", "json", a.src], capture_output=True, text=True, check=True).stdout)
    iw, ih = probe["streams"][0]["width"], probe["streams"][0]["height"]
    x0, y0, x1, y1 = cover_box(iw, ih, a.focus[0], a.focus[1], ow, oh)
    vf = [f"crop={x1 - x0}:{y1 - y0}:{x0}:{y0}", f"scale={ow}:{oh}:flags=lanczos", f"fps={a.fps}"]
    if "blur" in a.treatment:
        vf += ["gblur=sigma=18", "colorchannelmixer=rr=0.62:gg=0.62:bb=0.62"]
    if "duotone" in a.treatment:
        s, m, h = (hex_rgb(c) for c in a.stops)
        chan = lambda i: f"if(lt(val,128),{s[i]}+({m[i]}-{s[i]})*val/128,{m[i]}+({h[i]}-{m[i]})*(val-128)/127)"
        vf += ["format=gray", "format=rgb24", f"lutrgb=r='{chan(0)}':g='{chan(1)}':b='{chan(2)}'"]
    elif "blur" not in a.treatment:
        vf += ["colorchannelmixer=rr=0.8:gg=0.8:bb=0.8"]
    cmd = ["ffmpeg", "-v", "error", "-y", "-stream_loop", "-1", "-i", a.src, "-t", f"{a.duration:.3f}", "-an",
           "-vf", ",".join(vf + ["format=yuv420p"]), "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-g", str(a.fps),
           "-movflags", "+faststart", a.out + ".part.mp4"]
    subprocess.run(cmd, check=True)
    os.replace(a.out + ".part.mp4", a.out)
    return {"width": ow, "height": oh, "duration": a.duration}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--focus", nargs=2, type=float, default=[0.5, 0.5])
    ap.add_argument("--treatment", nargs="*", default=[])
    ap.add_argument("--stops", nargs=3, default=["#0A0A09", "#7A2208", "#FFB27A"])
    ap.add_argument("--overscan", type=float, default=1.0)
    ap.add_argument("--duration", type=float, default=0)
    ap.add_argument("--fps", type=int, default=30)
    a = ap.parse_args()
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    info = video(a) if a.duration > 0 else image(a)
    print(json.dumps(info))


if __name__ == "__main__":
    main()
