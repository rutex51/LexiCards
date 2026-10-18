#!/usr/bin/env python3
"""Rysuje przykładowy obraz notatki do wzoru pliku importu (schemat bilansu)
i zapisuje go jako moduł js/core/template-image.js (PNG w Base64).

Uruchomienie: python3 tools/gen_template_image.py
Wymaga: Pillow i czcionek Liberation Sans.
"""

import base64
import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = Path('/usr/share/fonts/truetype/liberation')
SCALE = 2
W, H = 640, 360


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size * SCALE)


def main():
    image = Image.new('RGB', (W * SCALE, H * SCALE), '#ffffff')
    draw = ImageDraw.Draw(image)
    s = lambda value: value * SCALE  # noqa: E731
    title = font('LiberationSans-Bold.ttf', 22)
    head = font('LiberationSans-Bold.ttf', 17)
    body = font('LiberationSans-Regular.ttf', 15)
    small = font('LiberationSans-Italic.ttf', 13)

    draw.text((s(24), s(18)), 'Bilans – balance sheet', font=title, fill='#1c1c1e')
    draw.text((s(24), s(50)), 'na określony dzień · at a specific date', font=small, fill='#6c6c70')

    def column(x, heading, english, rows, color, fill):
        top, width = 86, 282
        draw.rounded_rectangle((s(x), s(top), s(x + width), s(top + 250)), radius=s(14), fill=fill, outline=color, width=s(2))
        draw.text((s(x + 16), s(top + 14)), heading, font=head, fill=color)
        draw.text((s(x + 16), s(top + 38)), english, font=small, fill='#6c6c70')
        y = top + 72
        for label, detail in rows:
            draw.rounded_rectangle((s(x + 14), s(y), s(x + width - 14), s(y + 66)), radius=s(10), fill='#ffffff')
            draw.text((s(x + 28), s(y + 12)), label, font=body, fill='#1c1c1e')
            draw.text((s(x + 28), s(y + 36)), detail, font=small, fill='#6c6c70')
            y += 80

    column(24, 'Aktywa', 'assets', [('Aktywa trwałe', 'non-current assets'), ('Aktywa obrotowe', 'current assets')], '#0040dd', '#eef3ff')
    column(334, 'Pasywa', 'equity and liabilities', [('Kapitał własny', 'equity'), ('Zobowiązania', 'liabilities')], '#248a3d', '#edf8f0')
    draw.text((s(306), s(196)), '=', font=title, fill='#1c1c1e')

    image = image.resize((W, H), Image.LANCZOS).convert('P', palette=Image.ADAPTIVE, colors=64)
    buffer = io.BytesIO()
    image.save(buffer, 'PNG', optimize=True)
    data = base64.b64encode(buffer.getvalue()).decode('ascii')
    lines = [data[i:i + 100] for i in range(0, len(data), 100)]
    source = (
        '// PLIK GENEROWANY przez tools/gen_template_image.py – nie edytuj go ręcznie.\n'
        '// Przykładowy obraz notatki we wzorze pliku importu: schemat bilansu (PNG 640×360).\n\n'
        f'export const TEMPLATE_IMAGE = Object.freeze({{ type: \'image/png\', width: {W}, height: {H}, name: \'bilans.png\' }});\n\n'
        'export const TEMPLATE_IMAGE_BASE64 = [\n'
        + ',\n'.join(f"  '{line}'" for line in lines)
        + "\n].join('');\n"
    )
    (ROOT / 'js/core/template-image.js').write_text(source)
    print(f'{len(buffer.getvalue())} B PNG, {len(source)} B modułu')


if __name__ == '__main__':
    main()
