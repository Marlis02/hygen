#!/usr/bin/env python3
"""Media of a stage beat — hygen engine (engine/scenes/CONTRACT.md, «Stage media»).

Everything heavy happens once at build time and is cached by the caller; the render only places and moves pixels.

  probe  <src>                                   → {"duration", "width", "height"}
  video  <src> <out.mp4> --in 2 --out 9 [--reverse] [--treatment film-memory] --inks night hero deep paper
         trims the source range, optionally reverses it, bakes the treatment, H.264 without sound, even size
  frame  <src.mp4> <out.jpg> --t 3.2             one exact frame (a stop-frame of edit.hold)
  image  <src> <out.jpg> [--treatment engraved] --inks …   a photo with the treatment baked in
  extent <cutout.png> --fit cover --focus 0.5 0.5  → {"rows": [[y, x0, x1], …]} the figure of a cutout in frame px, every 20 px
  backdrop <src> <out.jpg>                       cover crop 1080×1920, blurred and darkened (under fit: contain)

Treatments are CPU versions of the media-use recipes (no WebGL in the render):
  film-memory  vintage wash: lifted blacks, warm, less saturation, vignette, seeded grain
  engraved     line engraving: luminance → thickness of diagonal lines, cross-hatch in the deep shadows; ink/paper
  two-ink      two spot inks on paper: hero ink in the mids, deep ink in the shadows, 15°/75° halftone screens
  duotone      the look's two inks: shadows → night, lights → a muted light of text and hero (≤ 72 % bright, so white
               paper does not glare out of a dark look); bright saturated points (lamps, lights) keep a spot of the fifth ink
Video versions of engraved and two-ink are tone maps into the same inks (no per-frame line screen).
"""
import argparse
import json
import os
import subprocess

import numpy as np
from PIL import Image, ImageFilter

W, H = 1080, 1920


def even(v):
    return max(2, int(v) // 2 * 2)


def hex_rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


def probe(src):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
                          "-of", "json", src], capture_output=True, text=True, check=True).stdout
    d = json.loads(out)
    s = d["streams"][0]
    return {"duration": float(d.get("format", {}).get("duration", 0) or 0), "width": s["width"], "height": s["height"]}


def stretch(lum):
    lo, hi = np.percentile(lum, 2), np.percentile(lum, 98)
    return ((lum - lo) / max(hi - lo, 1e-3)).clip(0, 1)


def luminance(arr):
    return (arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114) / 255.0


def film_memory(arr, seed=7):
    a = arr / 255.0
    lum = luminance(arr)[..., None]
    a = lum + (a - lum) * 0.68
    a = a * 0.84 + 0.075
    a = a * np.array([1.05, 0.99, 0.88], dtype=np.float32)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    a *= (1 - 0.32 * np.clip((r - 0.55) / 0.75, 0, 1) ** 1.4)[..., None]
    rng = np.random.default_rng(seed)
    a += rng.normal(0, 0.03, size=(h, w, 1)).astype(np.float32)
    return (a.clip(0, 1) * 255)


def engraved(arr, ink, paper, spacing=6.5, angle=0.62):
    lum = stretch(luminance(arr))
    dark = 1.0 - lum ** 0.85
    h, w = lum.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (xx * np.cos(angle) + yy * np.sin(angle)) / spacing + 0.35 * np.sin(yy / 90.0)
    f = np.abs(u - np.floor(u) - 0.5) * 2  # 0 at the line centre … 1 between lines
    thick = 0.12 + 0.78 * dark
    m = np.clip((thick - f) / 0.18 + 0.5, 0, 1)
    v = (xx * np.cos(-angle) + yy * np.sin(-angle)) / (spacing * 1.15)
    g = np.abs(v - np.floor(v) - 0.5) * 2
    cross = np.clip((np.clip((dark - 0.62) / 0.38, 0, 1) * 0.8 - g) / 0.18 + 0.5, 0, 1)
    m = np.maximum(m, cross)
    return paper * (1 - m[..., None]) + ink * m[..., None]


def screen(h, w, cell, angle, cover):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    c, s = np.cos(angle), np.sin(angle)
    u = (xx * c + yy * s) / cell
    v = (-xx * s + yy * c) / cell
    du = u - np.floor(u) - 0.5
    dv = v - np.floor(v) - 0.5
    d = np.sqrt(du * du + dv * dv)
    radius = np.sqrt(np.clip(cover, 0, 1)) * 0.62
    return np.clip((radius - d) * cell / 1.2 + 0.5, 0, 1)


def two_ink(arr, ink1, ink2, paper, cell=9.0):
    lum = stretch(luminance(arr))
    h, w = lum.shape
    c1 = np.clip(1.0 - np.abs(lum - 0.45) * 2.0, 0, 1) * 0.85 + np.clip((0.6 - lum) / 0.6, 0, 1) * 0.35
    c2 = np.clip((0.5 - lum) / 0.5, 0, 1) ** 1.2
    m1 = screen(h, w, cell, np.deg2rad(15), c1)
    m2 = screen(h, w, cell, np.deg2rad(75), c2)
    out = paper * (1 - m1[..., None] * 0.92) + ink1 * m1[..., None] * 0.92
    return out * (1 - m2[..., None]) + (out * ink2 / 255.0) * m2[..., None]


def duotone(arr, night, hero, text, spot=None):
    lum = stretch(luminance(arr))[..., None]
    light = (text * 0.75 + hero * 0.25) * 0.72
    out = night + (light - night) * lum
    if spot is not None:
        mx, mn = arr.max(axis=2), arr.min(axis=2)
        sat = (mx - mn) / np.maximum(mx, 1.0)
        m = np.clip((sat - 0.35) / 0.3, 0, 1) * np.clip((mx / 255.0 - 0.5) / 0.3, 0, 1)
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float32)[..., None] / 255.0
        out = out * (1 - m) + spot * m
    return out


def fit_size(im, longest=2160):
    s = min(1.0, longest / max(im.width, im.height))
    if s < 1.0:
        im = im.resize((even(im.width * s), even(im.height * s)), Image.LANCZOS)
    return im


def treat(arr, a):
    ink_night, ink_hero, ink_deep, paper = (hex_rgb(c) for c in a.inks[:4])
    if a.treatment == "duotone":
        return duotone(arr, ink_night, ink_hero, paper, hex_rgb(a.inks[4]) if len(a.inks) > 4 else None)
    if a.treatment == "film-memory":
        return film_memory(arr)
    if a.treatment == "engraved":
        return engraved(arr, ink_night, paper)
    if a.treatment == "two-ink":
        return two_ink(arr, ink_hero, ink_deep, paper)
    return arr


def save_jpg(arr, out):
    part = out + ".part.jpg"
    Image.fromarray(np.asarray(arr).clip(0, 255).astype(np.uint8)).save(part, quality=90)
    os.replace(part, out)


def cmd_image(a):
    im = fit_size(Image.open(a.src).convert("RGB"))
    arr = treat(np.asarray(im, dtype=np.float32), a)
    save_jpg(arr, a.out)
    print(json.dumps({"width": im.width, "height": im.height}))


def cmd_backdrop(a):
    im = Image.open(a.src).convert("RGB")
    s = max(W / im.width, H / im.height)
    im = im.resize((even(im.width * s) + 2, even(im.height * s) + 2), Image.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2
    im = im.crop((x, y, x + W, y + H)).filter(ImageFilter.GaussianBlur(40))
    save_jpg(np.asarray(im, dtype=np.float32) * 0.42, a.out)
    print(json.dumps({"width": W, "height": H}))


def tone_map(inks):
    """Three-stop LUT (deep → mid → light) as an ffmpeg lutrgb for the video versions of engraved and two-ink."""
    s, m, h = inks
    chan = lambda i: f"if(lt(val,128),{int(s[i])}+({int(m[i])}-{int(s[i])})*val/128,{int(m[i])}+({int(h[i])}-{int(m[i])})*(val-128)/127)"
    return ["format=gray", "format=rgb24", f"lutrgb=r='{chan(0)}':g='{chan(1)}':b='{chan(2)}'"]


def cmd_video(a):
    info = probe(a.src)
    t0 = max(0.0, a.t_in)
    t1 = a.t_out if a.t_out > 0 else info["duration"]
    # scale inside a 1920 box, even sides: enough for a cover crop of the 1080×1920 frame after the engine's crop
    sc = min(1.0, 1920 / max(info["width"], info["height"]))
    vf = [f"scale={even(info['width'] * sc)}:{even(info['height'] * sc)}:flags=lanczos", f"fps={a.fps}"]
    if a.reverse:
        vf.append("reverse")
    night, hero, deep, paper = (hex_rgb(c) for c in a.inks[:4])
    if a.treatment == "film-memory":
        vf += ["eq=contrast=0.86:brightness=0.03:saturation=0.66", "colorchannelmixer=rr=1.05:gg=0.99:bb=0.88", "vignette=angle=PI/4.5", "noise=alls=9:allf=t"]
    elif a.treatment == "engraved":
        vf += ["eq=contrast=1.45", "unsharp=5:5:1.4"] + tone_map([night, (night + paper) / 2, paper])
    elif a.treatment == "two-ink":
        vf += ["eq=contrast=1.25"] + tone_map([deep, hero, paper])
    elif a.treatment == "duotone":
        vf += tone_map([night, (night + (paper * 0.75 + hero * 0.25) * 0.72) / 2, (paper * 0.75 + hero * 0.25) * 0.72])
    cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{t0:.3f}", "-to", f"{t1:.3f}", "-i", a.src, "-an", "-vf", ",".join(vf + ["format=yuv420p"]),
           "-c:v", "libx264", "-crf", "19", "-preset", "veryfast", "-g", "10", "-movflags", "+faststart", a.out + ".part.mp4"]
    subprocess.run(cmd, check=True)
    os.replace(a.out + ".part.mp4", a.out)
    print(json.dumps(probe(a.out)))


def cmd_frame(a):
    part = a.out + ".part.jpg"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0.0, a.t):.3f}", "-i", a.src, "-frames:v", "1", "-q:v", "2", part], check=True)
    os.replace(part, a.out)
    print(json.dumps({"t": a.t}))


def cmd_extent(a):
    """Where the figure of a cutout stands in the 1080×1920 frame (same object-fit and object-position as the device)."""
    im = Image.open(a.src).convert("RGBA")
    w, h = im.size
    s = max(W / w, H / h) if a.fit == "cover" else min(W / w, H / h)
    ox, oy = (W - w * s) * a.focus[0], (H - h * s) * a.focus[1]
    alpha = np.asarray(im.getchannel("A"), dtype=np.uint8) > 128
    rows = []
    for y in range(0, H, 20):
        sy = int((y + 10 - oy) / s)
        if sy < 0 or sy >= h:
            continue
        band = alpha[max(0, sy - 2):sy + 3].any(axis=0)
        xs = np.nonzero(band)[0]
        if len(xs) < 3:
            continue
        x0, x1 = max(0.0, xs[0] * s + ox), min(float(W), (xs[-1] + 1) * s + ox)
        if x1 > 0 and x0 < W:
            rows.append([y, round(x0), round(x1)])
    print(json.dumps({"rows": rows}))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["probe", "video", "frame", "image", "backdrop", "extent"])
    ap.add_argument("src")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--in", dest="t_in", type=float, default=0.0)
    ap.add_argument("--out", dest="t_out", type=float, default=0.0)
    ap.add_argument("--t", type=float, default=0.0)
    ap.add_argument("--reverse", action="store_true")
    ap.add_argument("--treatment", default="none")
    ap.add_argument("--fit", default="cover")
    ap.add_argument("--focus", type=float, nargs=2, default=[0.5, 0.5])
    ap.add_argument("--inks", nargs="+", default=["#0A0A09", "#FF5A1F", "#7A2208", "#ECE7DE"])
    ap.add_argument("--fps", type=int, default=30)
    a = ap.parse_args()
    if a.cmd == "probe":
        print(json.dumps(probe(a.src)))
        return
    if a.cmd == "extent":
        cmd_extent(a)
        return
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    {"video": cmd_video, "frame": cmd_frame, "image": cmd_image, "backdrop": cmd_backdrop}[a.cmd](a)


if __name__ == "__main__":
    main()
