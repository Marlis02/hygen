#!/usr/bin/env python3
"""Pictures for `npm run media` (engine/src/media.ts).

    python3 engine/py/media_sheet.py sheet <manifest.json> <out.jpg>
        numbered contact sheet of search results: tiles 400×400 (thumbnail contained), two caption lines under each;
        manifest: [{"n": 1, "path": "01.jpg" | null, "caption": "Public domain · 1200×1905", "title": "…"}, …]
    python3 engine/py/media_sheet.py fit <src> <dst> --width 2400
        downscale an image to the width; a file already that narrow is copied untouched.
        Commons serves thumbnails only in fixed widths (250, 330, 500, 960, 1280, 1920, 3840), so --width 2400 comes as 3840.

Prints one JSON line.
"""
import argparse
import json
import math
import shutil

from PIL import Image, ImageDraw, ImageFont, ImageOps

TILE = 400
CAPTION = 50
GAP = 10
PAPER = (10, 10, 10)
CELL = (30, 30, 30)
INK = (236, 231, 222)
MUTED = (160, 155, 148)
BADGE = (255, 214, 102)


def font(size, bold=False):
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", size)
    except OSError:
        return ImageFont.load_default()


def fit_text(draw, text, face, width):
    if draw.textlength(text, font=face) <= width:
        return text
    while text and draw.textlength(text + "…", font=face) > width:
        text = text[:-1]
    return text.rstrip() + "…"


def sheet(args):
    with open(args.manifest, encoding="utf-8") as f:
        items = json.load(f)
    cols = max(1, min(len(items), 3 if len(items) <= 9 else 4))
    rows = math.ceil(len(items) / cols)
    width = cols * TILE + (cols + 1) * GAP
    height = rows * (TILE + CAPTION) + (rows + 1) * GAP
    canvas = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(canvas)
    number, small = font(44, bold=True), font(16)
    for i, item in enumerate(items):
        x = GAP + (i % cols) * (TILE + GAP)
        y = GAP + (i // cols) * (TILE + CAPTION + GAP)
        draw.rectangle([x, y, x + TILE - 1, y + TILE - 1], fill=CELL)
        try:
            if not item.get("path"):
                raise OSError("no thumbnail")
            im = ImageOps.exif_transpose(Image.open(item["path"])).convert("RGB")
            im = ImageOps.contain(im, (TILE, TILE), Image.Resampling.LANCZOS)
            canvas.paste(im, (x + (TILE - im.width) // 2, y + (TILE - im.height) // 2))
        except (OSError, ValueError):
            draw.text((x + 24, y + TILE // 2 - 10), "нет миниатюры", fill=MUTED, font=small)
        label = str(item["n"])
        l, t, r, b = draw.textbbox((0, 0), label, font=number)
        draw.rectangle([x, y, x + (r - l) + 22, y + (b - t) + 18], fill=(0, 0, 0))
        draw.text((x + 11 - l, y + 9 - t), label, fill=BADGE, font=number)
        draw.text((x + 2, y + TILE + 5), fit_text(draw, item.get("caption", ""), small, TILE - 4), fill=INK, font=small)
        draw.text((x + 2, y + TILE + 27), fit_text(draw, item.get("title", ""), small, TILE - 4), fill=MUTED, font=small)
    canvas.save(args.out, quality=88)
    print(json.dumps({"out": args.out, "width": width, "height": height, "tiles": len(items)}))


FORMATS = {"jpg": "JPEG", "jpeg": "JPEG", "png": "PNG", "webp": "WEBP"}


def fit(args):
    im = Image.open(args.src)
    src_w = im.width
    ext = args.dst.lower().rsplit(".", 1)[-1]
    if src_w <= args.width and im.format == FORMATS.get(ext):
        shutil.copyfile(args.src, args.dst)
        print(json.dumps({"width": im.width, "height": im.height, "source_width": src_w}))
        return
    icc = im.info.get("icc_profile") if im.mode in ("RGB", "RGBA", "L") else None
    im = ImageOps.exif_transpose(im)
    if im.mode in ("I", "I;16", "I;16B", "I;16L"):  # 16-bit scans (TIFF) → 8-bit grey
        im = im.convert("I").point(lambda v: v * (1 / 256)).convert("L")
    elif im.mode not in ("RGB", "RGBA", "L", "LA"):
        im = im.convert("RGBA" if "transparency" in im.info else "RGB")
    if im.width > args.width:
        im = im.resize((args.width, max(1, round(im.height * args.width / im.width))), Image.Resampling.LANCZOS)
    params = {"icc_profile": icc} if icc else {}
    if FORMATS.get(ext, "JPEG") == "JPEG":
        im = im if im.mode in ("RGB", "L") else im.convert("RGB")
        params.update(quality=90, optimize=True, progressive=True)
    elif ext == "webp":
        params.update(quality=90)
    else:
        params.update(optimize=True)
    im.save(args.dst, format=FORMATS.get(ext, "JPEG"), **params)
    print(json.dumps({"width": im.width, "height": im.height, "source_width": src_w}))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sheet")
    s.add_argument("manifest")
    s.add_argument("out")
    s.set_defaults(fn=sheet)
    f = sub.add_parser("fit")
    f.add_argument("src")
    f.add_argument("dst")
    f.add_argument("--width", type=int, required=True)
    f.set_defaults(fn=fit)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
