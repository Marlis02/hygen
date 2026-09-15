#!/usr/bin/env python3
"""Autocheck of a finished MP4 — hygen engine.

Reads the rendered file itself, never the composition: snapshots and the render can disagree
(TRAPS.md). Uses the plan the build wrote (build/verify_plan.json):

  format    resolution, fps, one audio track, duration within 0.1 s of the plan
  size      at most 25 MB per 10 s of video (upload-sized H.264)
  loudness  integrated −14 ±0.5 LUFS, true peak ≤ −1.5 dBTP (ffmpeg ebur128)
  blank     every scene shows structure above the caption band, not only its ground
  frozen    every scene moves, and each planned event (reveal, count, collapse) visibly changes the frame
  settled   at each scene's settle time the MP4 frame matches a fresh snapshot of the composition above the caption band:
            a counter stuck between values or a layer that never drew shows up as a local difference

Writes a JSON report and a contact sheet (two frames per scene). Exit code 1 when a check fails.

    python3 verify_mp4.py final.mp4 --plan build/verify_plan.json --out renders/x.verify.json \
        --sheet renders/x.contact.jpg [--snapshots build/snapshots-verify]
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter, uniform_filter

AW, AH = 54, 96          # analysis raster = 1/20 of 1080×1920; the area average removes film grain
AFPS = 10                # analysis samples per second
BLANK_DETAIL = 1.0       # std of the high-passed content region below this: only a ground and the vignette
FROZEN_MOTION = 0.03     # 95th percentile of frame-to-frame change below this: nothing moves
EVENT_MIN = 6.0          # an event must change some 100×100 px area by at least this mean luma
SETTLE_MAX = 32.0        # max mean luma difference of a 120×120 px block, MP4 frame vs snapshot
MAX_MB_PER_10S = 25.0    # file size budget


def ffprobe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path],
                       capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def loudness(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-vn", "-af", "ebur128=peak=true",
                        "-f", "null", "-"], capture_output=True, text=True)
    tail = r.stderr[r.stderr.rfind("Summary:"):]

    def get(key):
        return float(re.search(rf"{key}:\s*(-?[\d.]+|-inf)", tail).group(1).replace("-inf", "-120"))

    return {"I": get("I"), "LRA": get("LRA"), "TP": get("Peak")}


def decode_gray(path, fps, w, h):
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps},scale={w}:{h}:flags=area,format=gray",
           "-f", "rawvideo", "-pix_fmt", "gray", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, h, w).astype(np.float32)


def frame_rgb(path, t, w, h):
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", path, "-frames:v", "1",
           "-vf", f"scale={w}:{h}:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw[: w * h * 3], dtype=np.uint8).reshape(h, w, 3)


def to_gray(rgb):
    return (rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114).astype(np.float32)


def snapshot_files(folder):
    return sorted(glob.glob(os.path.join(folder, "**", "*.png"), recursive=True))


def pair_snapshots(files, times):
    def stamp(path):
        found = re.findall(r"(\d+(?:\.\d+)?)s", os.path.basename(path))
        return float(found[-1]) if found else None

    stamped = [(stamp(p), p) for p in files]
    if stamped and all(t is not None for t, _ in stamped):
        return [min(stamped, key=lambda tp: abs(tp[0] - t))[1] for t in times]
    return files[: len(times)]


def palette(mp4, plan):
    """Accent hue of the video from its settle frames (content above the caption band): circular mean of the hue
    weighted by chroma², so the accent counts and the tinted grounds barely do. Feeds the uniqueness check."""
    vec = np.zeros(2)
    wsum = 0.0
    mean = np.zeros(3)
    crow = max(1, int(round(plan["contentMaxY"] / plan["height"] * 192)))
    for sc in plan["scenes"]:
        px = frame_rgb(mp4, sc["settle"], 108, 192)[:crow].reshape(-1, 3).astype(np.float32) / 255.0
        mx, mn = px.max(axis=1), px.min(axis=1)
        c = mx - mn
        r, g, b = px[:, 0], px[:, 1], px[:, 2]
        h = np.zeros_like(mx)
        m = c > 1e-6
        rm = m & (mx == r)
        gm = m & (mx == g) & ~rm
        bm = m & ~rm & ~gm
        h[rm] = np.mod((g - b)[rm] / c[rm], 6)
        h[gm] = (b - r)[gm] / c[gm] + 2
        h[bm] = (r - g)[bm] / c[bm] + 4
        w = c ** 2
        ang = np.radians(h * 60)
        vec += [float(np.sum(w * np.cos(ang))), float(np.sum(w * np.sin(ang)))]
        wsum += float(w.sum())
        mean += px.mean(axis=0)
    hue = float(np.degrees(np.arctan2(vec[1], vec[0])) % 360) if wsum > 1e-6 else None
    return {"hue": None if hue is None else round(hue, 1), "strength": round(float(np.hypot(*vec) / wsum), 3) if wsum > 1e-6 else 0.0,
            "mean_rgb": [int(round(v * 255 / max(1, len(plan["scenes"])))) for v in mean]}


def contact_sheet(mp4, plan, out):
    tw, th, label_h = 216, 384, 24
    scenes = plan["scenes"]
    sheet = Image.new("RGB", (len(scenes) * tw, 2 * (th + label_h)), (12, 12, 12))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for c, sc in enumerate(scenes):
        mid = sc["start"] + 0.55 * (sc["end"] - sc["start"])
        for r, t in enumerate((mid, sc["settle"])):
            x, y = c * tw, r * (th + label_h)
            sheet.paste(Image.fromarray(frame_rgb(mp4, t, tw, th)), (x, y + label_h))
            draw.text((x + 6, y + 6), f"{sc['id']}  {t:.1f}s", fill=(236, 231, 222), font=font)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    save_stable(sheet, out)


def same_picture(a_path, b_path, tile=3.0, block=40.0):
    """Две картинки показывают одно и то же: среднее размытой разницы ≤ tile и ни один блок 60 px не выше block.

    Контактный лист нельзя повторить байт в байт: кадры снимают четыре параллельных воркера Chrome, а MP4 сжат
    с потерями — два рендера одной сборки расходятся примерно на 1,4 из 255 по всему кадру (TRAPS.md). Пороги —
    те самые, которыми движок всегда говорил «кадры не изменились» (engine/py/compare_frames.py).
    """
    from compare_frames import diff, load

    try:
        a = load(a_path)
        b = load(b_path, size=(a.shape[1], a.shape[0]))
    except Exception:
        return False
    if a.shape != b.shape:
        return False
    mean, worst = diff(a, b, 60)
    return mean <= tile and worst <= block


def save_stable(img, out, quality=90):
    """Детерминированный выход: JPEG без даты и метаданных времени, а лист, показывающий то же, что лежит на диске,
    не перезаписывается — чистая пересборка неизменённого ролика оставляет чистое дерево."""
    part = out + ".part.jpg"
    img.save(part, quality=quality, exif=b"")
    if os.path.exists(out) and same_picture(out, part):
        os.remove(part)
        return False
    os.replace(part, out)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mp4")
    ap.add_argument("--plan", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--sheet", required=True)
    ap.add_argument("--snapshots", default=None)
    a = ap.parse_args()
    plan = json.load(open(a.plan, encoding="utf-8"))
    checks = []

    def check(name, ok, detail):
        checks.append({"check": name, "ok": bool(ok), "detail": detail})
        print(f"{'✓' if ok else '✗'} {name:<9} {detail}")

    info = ffprobe(a.mp4)
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    audio = [s for s in info["streams"] if s["codec_type"] == "audio"]
    num, den = (int(x) for x in video["r_frame_rate"].split("/"))
    fps = num / den
    duration = float(info["format"]["duration"])
    delta = duration - plan["duration"]
    check("format", video["width"] == plan["width"] and video["height"] == plan["height"]
          and abs(fps - plan["fps"]) < 0.01 and len(audio) == 1 and abs(delta) <= 0.1,
          f"{video['width']}×{video['height']}, {fps:.2f} fps, аудиодорожек {len(audio)}, "
          f"{duration:.3f} с (план {plan['duration']:.3f}, Δ {delta:+.3f})")

    size_mb = os.path.getsize(a.mp4) / 1e6
    per10 = size_mb / max(duration, 0.001) * 10
    check("size", per10 <= MAX_MB_PER_10S, f"{size_mb:.1f} МБ, {per10:.1f} МБ на 10 с (≤ {MAX_MB_PER_10S:.0f}), "
          f"{int(info['format'].get('bit_rate', 0)) / 1e6:.1f} Мбит/с")

    target = plan["loudness"]
    loud = loudness(a.mp4)
    check("loudness", abs(loud["I"] - target["target"]) <= target["tolerance"] and loud["TP"] <= target["maxTruePeak"],
          f"{loud['I']:.1f} LUFS (цель {target['target']} ±{target['tolerance']}), пик {loud['TP']:.1f} dBTP "
          f"(≤ {target['maxTruePeak']}), LRA {loud['LRA']:.1f} LU")

    frames = decode_gray(a.mp4, AFPS, AW, AH)
    rows = max(1, int(round(plan["contentMaxY"] / plan["height"] * AH)))
    content = frames[:, :rows, :]
    detail = np.array([float((f - gaussian_filter(f, 4)).std()) for f in content])
    motion = np.zeros(len(content), dtype=np.float32)
    if len(content) > 1:
        motion[1:] = np.abs(np.diff(content, axis=0)).reshape(len(content) - 1, -1).mean(axis=1)
    last = len(content) - 1

    def at(t):
        return int(min(last, max(0, round(t * AFPS))))

    scenes, blank, frozen, silent = [], [], [], []
    for sc in plan["scenes"]:
        i0, i1 = at(sc["start"] + 0.25), at(sc["end"] - 0.25)
        d = detail[i0:i1 + 1]
        m = motion[i0 + 1:i1 + 1]
        d_max = float(d.max()) if len(d) else 0.0
        m_p95 = float(np.percentile(m, 95)) if len(m) else 0.0
        events = []
        for ev in sc["events"]:
            if ev["label"].endswith("land"):
                # a landing ends a motion: the change leads into it, not out of it (TRAPS.md)
                before = content[at(max(sc["start"] + 0.05, ev["t"] - 0.8))]
                after = content[at(ev["t"] + 0.1)]
            else:
                before = content[at(ev["t"] - 0.1)]
                after = content[at(min(ev["t"] + 0.8, sc["end"] - 0.05))]
            change = float(uniform_filter(np.abs(after - before), size=5).max())
            events.append({"t": ev["t"], "label": ev["label"], "change": round(change, 1), "ok": change >= EVENT_MIN})
            if change < EVENT_MIN:
                silent.append(f"{sc['id']} «{ev['label']}» @{ev['t']:.2f} с: {change:.1f}")
        if d_max < BLANK_DETAIL:
            blank.append(f"{sc['id']} ({d_max:.2f})")
        if m_p95 < FROZEN_MOTION:
            frozen.append(f"{sc['id']} ({m_p95:.3f})")
        scenes.append({"id": sc["id"], "start": sc["start"], "end": sc["end"], "detail_max": round(d_max, 2),
                       "motion_p95": round(m_p95, 3), "events": events})
    check("blank", not blank, "пустых сцен нет" if not blank else "пустые сцены: " + ", ".join(blank))
    problems = []
    if frozen:
        problems.append("не двигаются: " + ", ".join(frozen))
    if silent:
        problems.append("событие не изменило кадр: " + "; ".join(silent))
    n_events = sum(len(s["events"]) for s in scenes)
    check("frozen", not problems, "; ".join(problems) if problems else f"все сцены двигаются, {n_events} событий меняют кадр")

    if a.snapshots:
        times = [sc["settle"] for sc in plan["scenes"]]
        shots = snapshot_files(a.snapshots)
        if len(shots) < len(times):
            check("settled", False, f"снимков {len(shots)} из {len(times)} — сравнить не с чем")
        else:
            worst, bad, skipped = 0.0, [], []
            for sc, t, png in zip(plan["scenes"], times, pair_snapshots(shots, times)):
                if sc.get("video"):
                    # a playing video at settle: the snapshot seeks the <video>, the render decodes its own frame (TRAPS.md)
                    next(s for s in scenes if s["id"] == sc["id"])["settle"] = {"t": t, "skipped": "video"}
                    skipped.append(sc["id"])
                    continue
                snap = np.asarray(Image.open(png).convert("L").resize((108, 192), Image.BOX), dtype=np.float32)
                vid = to_gray(frame_rgb(a.mp4, t, 108, 192))
                # scene state only: the snapshot can still hold a caption group the render has already cleared (TRAPS.md)
                crow = max(1, int(round(plan["contentMaxY"] / plan["height"] * 192)))
                diff = float(uniform_filter(np.abs(snap - vid)[:crow], size=12).max())
                row = next(s for s in scenes if s["id"] == sc["id"])
                row["settle"] = {"t": t, "max_block_diff": round(diff, 1), "snapshot": os.path.basename(png)}
                worst = max(worst, diff)
                if diff > SETTLE_MAX:
                    bad.append(f"{sc['id']} @{t:.2f} с: {diff:.1f}")
            note = f" · без сравнения, в кадре играет видео: {', '.join(skipped)}" if skipped else ""
            check("settled", not bad, (f"кадры совпадают со снимками композиции (макс. расхождение {worst:.1f})"
                  if not bad else "кадр расходится со снимком: " + "; ".join(bad)) + note)
    else:
        checks.append({"check": "settled", "ok": True, "detail": "пропущено (--no-snapshots)"})

    pal = palette(a.mp4, plan)
    print(f"· palette   оттенок акцента по settle-кадрам {pal['hue']}° (сила {pal['strength']}), средний цвет {pal['mean_rgb']}")
    contact_sheet(a.mp4, plan, a.sheet)
    ok = all(c["ok"] for c in checks)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump({"ok": ok, "mp4": os.path.abspath(a.mp4), "checks": checks, "scenes": scenes, "palette": pal,
                   "thresholds": {"blank_detail": BLANK_DETAIL, "frozen_motion_p95": FROZEN_MOTION,
                                  "event_min_change": EVENT_MIN, "settle_max_block_diff": SETTLE_MAX,
                                  "max_mb_per_10s": MAX_MB_PER_10S}},
                  f, ensure_ascii=False, indent=2)
    print(f"{'✓' if ok else '✗'} автопроверка {'пройдена' if ok else 'НЕ пройдена'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
