#!/usr/bin/env python3
"""Contact sheets of several videos one under another, each with its id and look — to see at a glance whether
they read as different videos (ROADMAP D3.5).

    python3 engine/py/contact_montage.py videos/_compare/contact-3.jpg \
        videos/pompeii-en/renders/pompeii-en.contact.jpg:"pompeii-en · ember" …
"""
import sys

from PIL import Image, ImageDraw, ImageFont

BAR = 44


def main():
    out, items = sys.argv[1], sys.argv[2:]
    sheets = []
    for item in items:
        path, _, label = item.partition(":")
        sheets.append((Image.open(path).convert("RGB"), label or path))
    width = max(im.width for im, _ in sheets)
    height = sum(im.height + BAR for im, _ in sheets)
    canvas = Image.new("RGB", (width, height), (8, 8, 8))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 24)
    except OSError:
        font = ImageFont.load_default()
    y = 0
    for im, label in sheets:
        draw.text((12, y + 9), label, fill=(236, 231, 222), font=font)
        canvas.paste(im, (0, y + BAR))
        y += im.height + BAR
    canvas.save(out, quality=88)
    print(f"{out}: {width}×{height}, роликов {len(sheets)}")


if __name__ == "__main__":
    main()
