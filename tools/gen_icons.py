#!/usr/bin/env python3
"""Rysuje ikony aplikacji: dwie fiszki na niebieskim tle.

Uruchomienie: python3 tools/gen_icons.py
Wymaga biblioteki Pillow i kroju Inter (ścieżkę można podać w zmiennej LEXICARDS_FONT).
"""

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
FONT = os.environ.get("LEXICARDS_FONT", "/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf")

SIZE = 1024
TOP = (30, 122, 245)
BOTTOM = (8, 84, 204)
CARD = (255, 255, 255)
INK = (10, 92, 214)


def background(size):
    image = Image.new("RGB", (size, size), TOP)
    draw = ImageDraw.Draw(image)
    for y in range(size):
        t = y / (size - 1)
        draw.line([(0, y), (size, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
    return image.convert("RGBA")


def card(size, box, radius, fill, angle, center):
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(box, radius=radius, fill=fill)
    return layer.rotate(angle, resample=Image.BICUBIC, center=center)


def draw_icon(scale=1.0):
    """scale < 1 zmniejsza motyw (ikona maskowalna zostawia margines bezpieczeństwa)."""
    image = background(SIZE)
    cx, cy = SIZE / 2, SIZE / 2
    width, height = 600 * scale, 420 * scale
    radius = 64 * scale

    def box(dx, dy):
        return [cx - width / 2 + dx, cy - height / 2 + dy, cx + width / 2 + dx, cy + height / 2 + dy]

    back = card(SIZE, box(36 * scale, -70 * scale), radius, CARD + (96,), 9, (cx, cy))
    image = Image.alpha_composite(image, back)

    shadow = card(SIZE, box(-20 * scale, 62 * scale), radius, (4, 46, 128, 70), -5, (cx, cy))
    image = Image.alpha_composite(image, shadow)
    front = card(SIZE, box(-20 * scale, 40 * scale), radius, CARD + (255,), -5, (cx, cy))
    image = Image.alpha_composite(image, front)

    text_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(text_layer)
    font = ImageFont.truetype(FONT, round(250 * scale))
    left, top, right, bottom = draw.textbbox((0, 0), "Lx", font=font)
    x = cx - 20 * scale - (right - left) / 2 - left
    y = cy + 40 * scale - (bottom - top) / 2 - top
    draw.text((x, y), "Lx", font=font, fill=INK + (255,))
    text_layer = text_layer.rotate(-5, resample=Image.BICUBIC, center=(cx, cy))
    return Image.alpha_composite(image, text_layer).convert("RGB")


def main():
    OUT.mkdir(exist_ok=True)
    regular = draw_icon(1.0)
    maskable = draw_icon(0.78)
    for name, source, size in [
        ("apple-touch-icon.png", regular, 180),
        ("icon-192.png", regular, 192),
        ("icon-512.png", regular, 512),
        ("icon-maskable-512.png", maskable, 512),
    ]:
        source.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
        print(f"zapisano icons/{name}")


if __name__ == "__main__":
    main()
