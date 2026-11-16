"""Top view PNG of the measured plan (Pillow). With labels=True it shows the candidate IDs for the AI review."""
import math
from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import LineString

W, H, PAD = 1200, 900, 50
COLORS = {'door': (230, 120, 20), 'window': (40, 120, 220), 'opening': (200, 40, 160)}


FONTS = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', 'DejaVuSans.ttf']


def _font(size):
    for path in FONTS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def render(levels, path, labels=False):
    n = max(1, len(levels))
    img = Image.new('RGB', (W, H), 'white')
    draw = ImageDraw.Draw(img)
    cols = min(n, 2)
    rows = math.ceil(n / cols)
    cw, ch = W // cols, H // rows
    small, mid = _font(13), _font(16)
    for k, level in enumerate(levels):
        ox, oy = (k % cols) * cw, (k // cols) * ch
        width, depth = max(level['width'], 1), max(level['depth'], 1)
        # Storeys may be shifted for alignment (offset); each panel shows the storey from its own corner.
        off = level.get('offset') or [0, 0]
        s = min((cw - 2 * PAD) / width, (ch - 2 * PAD - 20) / depth)
        mx = (cw - 2 * PAD - width * s) / 2
        my = (ch - 2 * PAD - 20 - depth * s) / 2
        P = lambda p, off=off: (ox + PAD + mx + (p[0] - off[0]) * s, oy + ch - PAD - my - (p[1] - off[1]) * s)
        draw.text((ox + 10, oy + 8), f"{level['name']} · {width / 1000:.2f} × {depth / 1000:.2f} m".replace('.', ','), fill=(30, 30, 30), font=mid)
        for r in level['rooms']:
            draw.polygon([P(p) for p in r['polygon']], fill=(236, 242, 248))
        for w in level['walls']:
            poly = LineString([w['a'], w['b']]).buffer(w['thickness'] / 2, cap_style='square', join_style='mitre')
            draw.polygon([P(p) for p in poly.exterior.coords], fill=(70, 70, 75))
        for o in level['openings']:
            wall = next((w for w in level['walls'] if w['id'] == o['wall']), None)
            if not wall:
                continue
            dx, dy = wall['b'][0] - wall['a'][0], wall['b'][1] - wall['a'][1]
            L = math.hypot(dx, dy) or 1
            u = (dx / L, dy / L)
            a = (o['at'][0] - u[0] * o['width'] / 2, o['at'][1] - u[1] * o['width'] / 2)
            b = (o['at'][0] + u[0] * o['width'] / 2, o['at'][1] + u[1] * o['width'] / 2)
            poly = LineString([a, b]).buffer(wall['thickness'] / 2 + 15, cap_style='flat')
            draw.polygon([P(p) for p in poly.exterior.coords], fill=(255, 255, 255), outline=COLORS[o['kind']], width=3)
            if labels:
                x, y = P(o['at'])
                draw.text((x + 4, y + 4), o['id'], fill=COLORS[o['kind']], font=small)
        for r in level['rooms']:
            x, y = P(r['point'])
            text = f"{r['id']} {r['name']}" if labels else r['name']
            draw.text((x, y - 9), text, fill=(20, 40, 80), font=mid, anchor='mm')
            draw.text((x, y + 9), f"{r['area_m2']:.2f} m²".replace('.', ','), fill=(60, 60, 60), font=small, anchor='mm')
        if labels:
            for w in level['walls']:
                x, y = P(((w['a'][0] + w['b'][0]) / 2, (w['a'][1] + w['b'][1]) / 2))
                draw.text((x + 3, y - 15), w['id'], fill=(200, 30, 30), font=small)
    img.save(path, 'PNG', optimize=True)
