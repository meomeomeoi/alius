#!/usr/bin/env python3
"""
P10c: turns the author's backdrop drop (content/core/art/incoming/*.png) into the shipped files
(content/core/art/backdrops/*.webp). A dev tool, run once per art drop; the game never runs it.

    python3 -I scripts/art/backdrops.py [--dry-run] [--keep-incoming]

Rules (docs/plans/2026-11-20-p10c-scene-backdrops.md, "Where the plan rules"):
- opaque images become exactly 3072x1280; a different size is resized NON-uniformly (image-edit models such as
  Flux Kontext return 3136x1344 and their details line up with the source only when stretched back, not cropped);
- frames keep their alpha and their size; `crop_bottom_bar` drops fully opaque rows at the bottom (a crossbar),
  `trim` crops to the alpha bounding box;
- `clean_alpha` drops the haze a colour-to-alpha cut leaves in the gaps (alpha below CLEAN_BELOW becomes 0, the rest is
  stretched back to 0..255); `despill` pulls the key colour out of the soft edges (red and blue capped near green, the
  magenta key), on partly transparent pixels only;
- WebP quality 82 (method 6); alpha is kept lossless-ish (alpha_quality 100).
Unknown incoming files are reported and left alone. Needs Pillow with WebP support.
"""
import argparse
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'content', 'core', 'art', 'incoming')
DST = os.path.join(ROOT, 'content', 'core', 'art', 'backdrops')
SIZE = (3072, 1280)
QUALITY = 82
CLEAN_BELOW = 48

# incoming stem -> (output stem, kind, options)
OPAQUE = {
    'room_commander': 'loc_quarters_commander',
    'cafeteria': 'loc_mess_hall',
    'infirmary': 'loc_medbay',
    'workshop': 'loc_workshop',
    'garage': 'loc_garage',
    'comms_room': 'loc_comms_room',
    'training_ground_day': 'loc_training_yard_day',
    'training_ground_evening': 'loc_training_yard_evening',
    'perimeter_day': 'loc_perimeter_day',
    'perimeter_evening': 'loc_perimeter_evening',
    'perimeter_night': 'loc_perimeter_night',
    'roof_day': 'loc_roof_day',
    'roof_evening': 'loc_roof_evening',
    'roof_night': 'loc_roof_night',
    'floor_concrete': 'floor_concrete',
    'floor_linoleum': 'floor_linoleum',
    'floor_tatami': 'floor_tatami',
    'floor_wood': 'floor_wood',
    'ceiling_dark': 'ceiling_dark',
    'ceiling_japanese': 'ceiling_japanese',
    'ceiling_office': 'ceiling_office',
    'ceiling_rich': 'ceiling_rich',
    'ceiling_room_1': 'ceiling_room_1',
    'ceiling_room_2': 'ceiling_room_2',
    'ceiling_technical': 'ceiling_technical',
    'ceiling_additional_1': 'ceiling_bright_1',
    'ceiling_additional_2': 'ceiling_bright_2',
    'ceiling_sky_day_regular': 'ceiling_sky_day',
    'ceiling_sky_day_cloudy': 'ceiling_sky_day_cloudy',
    'ceiling_sky_night': 'ceiling_sky_night',
    'pov_wall': 'pov_corner',
    'hallway_1': 'place_corridor_1',
    'hallway_2': 'place_corridor_2',
}
for n in ['1', '2', '3', '4', '5', '6', 'cruel', 'cute', 'dark', 'japanese', 'messy', 'rich', 'science', 'spiritual']:
    OPAQUE[f'room_{n}'] = f'quarters_{n}'

FRAMES = {
    'pov_under_desk': ('frame_under_desk', {'trim'}),
    'bars_regular': ('frame_cage_bars', {'crop_bottom_bar', 'clean_alpha'}),
    'bars_modern': ('frame_cage_clinical', {'crop_bottom_bar', 'clean_alpha', 'despill'}),
}


def opaque(src: str) -> Image.Image:
    im = Image.open(src).convert('RGB')
    if im.size != SIZE:
        im = im.resize(SIZE, Image.LANCZOS)
    return im


def frame(src: str, opts: set) -> Image.Image:
    im = Image.open(src).convert('RGBA')
    alpha = im.getchannel('A')
    if 'trim' in opts:
        box = alpha.point(lambda a: 255 if a > 8 else 0).getbbox()
        if box:
            im = im.crop(box)
            alpha = im.getchannel('A')
    if 'clean_alpha' in opts:
        im.putalpha(alpha.point(lambda a: 0 if a < CLEAN_BELOW else round((a - CLEAN_BELOW) * 255 / (255 - CLEAN_BELOW))))
        alpha = im.getchannel('A')
    if 'despill' in opts:
        px = im.load()
        w, h = im.size
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if 0 < a < 255:
                    px[x, y] = (min(r, g + 12), g, min(b, g + 12), a)
    if 'crop_bottom_bar' in opts:
        w, h = im.size
        px = alpha.load()
        bottom = h
        # walk up while a row is (almost) fully opaque: that is a bottom crossbar
        while bottom > h // 2 and sum(1 for x in range(0, w, 4) if px[x, bottom - 1] > 200) >= 0.9 * len(range(0, w, 4)):
            bottom -= 1
        if bottom < h:
            im = im.crop((0, 0, w, bottom))
    return im


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--keep-incoming', action='store_true')
    args = ap.parse_args()
    if not os.path.isdir(SRC):
        print(f'nothing to do: {SRC} does not exist')
        return 0
    os.makedirs(DST, exist_ok=True)
    done, unknown, total_in, total_out = [], [], 0, 0
    for name in sorted(os.listdir(SRC)):
        stem, ext = os.path.splitext(name)
        if ext.lower() != '.png':
            unknown.append(name)
            continue
        src = os.path.join(SRC, name)
        if stem in OPAQUE:
            out, im, lossless = OPAQUE[stem], opaque(src), False
        elif stem in FRAMES:
            out, opts = FRAMES[stem]
            im, lossless = frame(src, opts), False
        else:
            unknown.append(name)
            continue
        dst = os.path.join(DST, out + '.webp')
        before = Image.open(src).size
        if not args.dry_run:
            im.save(dst, 'WEBP', quality=QUALITY, method=6, lossless=lossless, alpha_quality=100)
            total_out += os.path.getsize(dst)
        total_in += os.path.getsize(src)
        done.append(src)
        print(f'{name:34} {before[0]}x{before[1]} -> {out}.webp {im.size[0]}x{im.size[1]} {im.mode}')
    print(f'{len(done)} files, {total_in / 1e6:.1f} MB in, {total_out / 1e6:.1f} MB out')
    if unknown:
        print('not in the mapping (left alone):', ', '.join(unknown))
    if not args.dry_run and not args.keep_incoming and not unknown:
        for src in done:
            os.remove(src)
        os.rmdir(SRC)
        print('removed', SRC)
    return 1 if unknown else 0


if __name__ == '__main__':
    sys.exit(main())
