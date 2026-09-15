#!/usr/bin/env python3
"""Показывают ли две картинки одно и то же (обложка publish/, контактный лист).

Выход 0 — картинка та же (движок оставляет файл, который уже лежит на диске), 1 — изменилась.
Пороги — те же, что у compare_frames.py: среднее по размытой разнице ≤ 3 из 255, блок 60 px ≤ 40.

    python3 engine/py/same_picture.py было.jpg стало.jpg
"""
import sys

from verify_mp4 import same_picture

if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("нужны два файла")
    sys.exit(0 if same_picture(sys.argv[1], sys.argv[2]) else 1)
