"""Generates the raster test set (scans, photos, copies, sketches) with exactly known geometry.

Development tool only (needs reportlab for the vector PDFs it starts from, pypdfium2 comes with pdfplumber):
    python plan-extract/tests/make_raster_fixtures.py
Writes test/fixtures/plans/raster/*.png|jpg and truth.json. Everything is self-made (CC0-1.0), no third-party plans.

Styles, from easy to hard:
  scan        vector PDF of Phase 1 rendered at 150 dpi (outlined walls, dimension chains, labels)
  gefuellt    walls filled black like an estate-agent plan, labels and an overall dimension
  schraffiert walls outlined and hatched (typical permit drawing)
  kopie       low resolution photocopy: 75 dpi, speckles, 2° rotation, grey toner
  foto        phone photo of a printout: perspective, uneven light, blur, noise, JPEG, table in the background
  skizze      hand sketch: thin single wobbly lines, no dimensions
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from shapely.geometry import LineString, Polygon

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_fixtures as mf  # noqa: E402

OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'test', 'fixtures', 'plans', 'raster'))
VEC = os.path.normpath(os.path.join(HERE, '..', '..', 'test', 'fixtures', 'plans'))
FONTS = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf']


def font(size):
    for p in FONTS:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default()


def house_big():
    """12.00 x 9.00 m, outer wall 30 cm, corridor, seven rooms, seven doors, seven windows."""
    T = 300
    outline = [(0, 0), (12000, 0), (12000, 9000), (0, 9000)]
    inner = [((5000, T), (5000, 9000 - T), 175), ((T, 4000), (4912.5, 4000), 115),
             ((5087.5, 4000), (12000 - T, 4000), 115), ((5087.5, 5200), (12000 - T, 5200), 115),
             ((8500, T), (8500, 3942.5), 115), ((8500, 5257.5), (8500, 9000 - T), 115)]
    openings = [
        ('door', (12000 - T / 2, 4600), 90, 1010), ('door', (6700, 4000), 0, 885), ('door', (10200, 4000), 0, 885),
        ('door', (6700, 5200), 0, 885), ('door', (10200, 5200), 0, 885), ('door', (5000, 4600), 90, 885), ('door', (2500, 4000), 0, 885),
        ('window', (2500, T / 2), 0, 1260), ('window', (T / 2, 6500), 90, 1510), ('window', (2500, 9000 - T / 2), 0, 1510),
        ('window', (6750, T / 2), 0, 760), ('window', (10250, T / 2), 0, 1260), ('window', (6750, 9000 - T / 2), 0, 1260),
        ('window', (10250, 9000 - T / 2), 0, 1260)]
    rooms = [('Küche', (2500, 2000)), ('Wohnen', (2500, 6800)), ('Flur', (8500, 4600)), ('Bad', (6750, 2000)),
             ('Schlafen', (10250, 2000)), ('Kind', (6750, 7100)), ('Arbeiten', (10250, 7100))]
    return dict(outline=outline, T=T, inner=inner, openings=openings, rooms=rooms)


HOUSES = {'haus-rechteck': mf.house_rect(), 'haus-l': mf.house_l(), 'haus-gross': house_big()}


def truth(h):
    """Wall centre lines (outer ring offset by T/2 plus partitions), openings, rooms, extents in mm."""
    outer = Polygon(h['outline'])
    ring = outer.buffer(-h['T'] / 2, join_style=2).exterior.coords
    walls = [[list(a), list(b), h['T']] for a, b in zip(ring, list(ring)[1:])]
    walls += [[list(a), list(b), t] for a, b, t in h['inner']]
    xs, ys = zip(*h['outline'])
    areas = mf.room_areas(h)
    return {'width': max(xs) - min(xs), 'depth': max(ys) - min(ys),
            'walls': [[[round(v, 1) for v in a], [round(v, 1) for v in b], t] for a, b, t in walls],
            'openings': [{'kind': k, 'at': list(p), 'width': w} for k, p, a, w in h['openings']],
            'rooms': [{'name': n, 'point': list(p), 'area_m2': areas[n]} for n, p in h['rooms']]}


# ------------------------------------------------------------------ drawing in pixels

class Canvas:
    """mm -> px with a margin; y up in mm, y down in px."""
    def __init__(self, h, px_per_mm, margin=2600):
        xs, ys = zip(*h['outline'])
        self.s = px_per_mm
        self.x0, self.y1 = min(xs) - margin, max(ys) + margin
        w, hh = (max(xs) - min(xs) + 2 * margin) * px_per_mm, (max(ys) - min(ys) + 2 * margin) * px_per_mm
        self.img = Image.new('L', (int(w), int(hh)), 255)
        self.d = ImageDraw.Draw(self.img)

    def P(self, p):
        return ((p[0] - self.x0) * self.s, (self.y1 - p[1]) * self.s)

    def px(self, mm):
        return max(1, int(round(mm * self.s)))


def wobble(p, q, rng, amp):
    n = 8
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append((p[0] + (q[0] - p[0]) * t + rng.normal(0, amp), p[1] + (q[1] - p[1]) * t + rng.normal(0, amp)))
    return pts


def draw_symbols(c, h, line_w, door=True, window=True):
    lines, arcs, texts = mf.drawing(h)
    for kind, p, q in lines:
        if (kind == 'door' and door) or (kind == 'window' and window):
            c.d.line([c.P(p), c.P(q)], fill=0, width=line_w)
    if door:
        for kind, ctr, r, a0, a1 in arcs:
            x, y = c.P(ctr)
            R = r * c.s
            # PIL angles run clockwise with y down: mirror the mathematical angles.
            c.d.arc([x - R, y - R, x + R, y + R], start=-a1 % 360, end=-a0 % 360, fill=0, width=line_w)


def draw_labels(c, h, size_mm=280, areas=True):
    f, g = font(c.px(size_mm)), font(c.px(size_mm * 0.75))
    ar = mf.room_areas(h)
    for name, (x, y) in h['rooms']:
        c.d.text(c.P((x, y + 120)), name, fill=0, font=f, anchor='mm')
        if areas:
            c.d.text(c.P((x, y - 260)), f'{ar[name]:.2f} m²'.replace('.', ','), fill=0, font=g, anchor='mm')


def draw_overall_dims(c, h, chains=True):
    xs, ys = zip(*h['outline'])
    f = font(c.px(230))
    lw = max(1, c.px(18))
    for axis in ('x', 'y'):
        pts = mf.chain_points(h, axis) if chains else []
        for off, values in ((900, pts), (1600, [min(xs), max(xs)] if axis == 'x' else [min(ys), max(ys)])):
            if not values:
                continue
            base = (min(ys) if axis == 'x' else min(xs)) - off
            Q = (lambda v: (v, base)) if axis == 'x' else (lambda v: (base, v))
            c.d.line([c.P(Q(values[0] - 200)), c.P(Q(values[-1] + 200))], fill=0, width=lw)
            for v in values:
                a, b = (v - 80, base - 80), (v + 80, base + 80)
                if axis == 'y':
                    a, b = (base - 80, v - 80), (base + 80, v + 80)
                c.d.line([c.P(a), c.P(b)], fill=0, width=lw)
            for a, b in zip(values, values[1:]):
                label = mf.fmt(b - a)[0]
                mid = Q((a + b) / 2)
                if axis == 'x':
                    c.d.text(c.P((mid[0], mid[1] + 160)), label, fill=0, font=f, anchor='mm')
                else:
                    tw = c.px(1400)
                    alpha = Image.new('L', (tw, c.px(320)), 0)
                    ImageDraw.Draw(alpha).text((tw / 2, c.px(160)), label, fill=255, font=f, anchor='mm')
                    alpha = alpha.rotate(90, expand=True)
                    x, y = c.P((mid[0] - 160, mid[1]))
                    c.img.paste(0, (int(x - alpha.size[0] / 2), int(y - alpha.size[1] / 2)), alpha)


def style_filled(h, px_per_mm=0.05):
    c = Canvas(h, px_per_mm)
    area = mf.wall_area(h)
    for poly in getattr(area, 'geoms', [area]):
        c.d.polygon([c.P(p) for p in poly.exterior.coords], fill=0)
        for ring in poly.interiors:
            c.d.polygon([c.P(p) for p in ring.coords], fill=255)
    draw_symbols(c, h, max(1, c.px(25)))
    draw_labels(c, h)
    draw_overall_dims(c, h, chains=False)
    return c.img


def style_hatched(h, px_per_mm=0.06):
    c = Canvas(h, px_per_mm)
    area = mf.wall_area(h)
    hatch = Image.new('L', c.img.size, 255)
    hd = ImageDraw.Draw(hatch)
    step = c.px(90)
    W, H = c.img.size
    for k in range(-H, W, step):
        hd.line([(k, H), (k + H, 0)], fill=0, width=1)
    mask = Image.new('L', c.img.size, 0)
    md = ImageDraw.Draw(mask)
    for poly in getattr(area, 'geoms', [area]):
        md.polygon([c.P(p) for p in poly.exterior.coords], fill=255)
        for ring in poly.interiors:
            md.polygon([c.P(p) for p in ring.coords], fill=0)
    c.img.paste(hatch, (0, 0), mask)
    for poly in getattr(area, 'geoms', [area]):
        for ring in [poly.exterior, *poly.interiors]:
            c.d.line([c.P(p) for p in ring.coords], fill=0, width=max(2, c.px(30)))
    draw_symbols(c, h, max(1, c.px(18)))
    draw_labels(c, h, areas=True)
    draw_overall_dims(c, h)
    return c.img


def style_sketch(h, px_per_mm=0.045, seed=7):
    rng = np.random.default_rng(seed)
    c = Canvas(h, px_per_mm)
    t = truth(h)
    lw = max(2, c.px(45))
    amp = 2.0
    for a, b, th in t['walls']:
        c.d.line([c.P(p) for p in wobble(a, b, rng, 0)], fill=0, width=lw)
        pts = [c.P(p) for p in wobble(a, b, rng, 0)]
        c.d.line([(x + rng.normal(0, amp), y + rng.normal(0, amp)) for x, y in pts], fill=0, width=lw)
    # Openings as gaps (doors with a simple arc), windows as a thin double stroke across the gap.
    for k, (x, y), ang, w in h['openings']:
        u = (1, 0) if ang == 0 else (0, 1)
        a, b = (x - u[0] * w / 2, y - u[1] * w / 2), (x + u[0] * w / 2, y + u[1] * w / 2)
        th = mf.thickness_at(h, x, y)
        n = (-u[1], u[0])
        A = (a[0] - n[0] * th, a[1] - n[1] * th)
        B = (b[0] + n[0] * th, b[1] + n[1] * th)
        box = [c.P(A), c.P(B)]
        c.d.rectangle([min(box[0][0], box[1][0]), min(box[0][1], box[1][1]), max(box[0][0], box[1][0]), max(box[0][1], box[1][1])], fill=255)
        if k == 'window':
            for o in (-th / 3, th / 3):
                c.d.line([c.P((a[0] + n[0] * o, a[1] + n[1] * o)), c.P((b[0] + n[0] * o, b[1] + n[1] * o))], fill=0, width=1)
    draw_symbols(c, h, 2, window=False)
    f = font(c.px(320))
    for name, (x, y) in h['rooms']:
        c.d.text(c.P((x, y)), name, fill=0, font=f, anchor='mm')
    return c.img


def render_pdf(path, dpi):
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(path)
    img = pdf[0].render(scale=dpi / 72, grayscale=True).to_pil().convert('L')
    pdf.close()
    return img


def photocopy(img, seed=3):
    rng = np.random.default_rng(seed)
    small = img.resize((img.width // 2, img.height // 2), Image.BILINEAR).rotate(2.0, resample=Image.BICUBIC, fillcolor=245, expand=True)
    a = np.asarray(small, dtype=float)
    a = 70 + a * (225 - 70) / 255  # grey toner, grey paper
    speck = rng.random(a.shape)
    a[speck < 0.004] = 40
    a[speck > 0.998] = 255
    return Image.fromarray(np.clip(a + rng.normal(0, 8, a.shape), 0, 255).astype(np.uint8))


def phone_photo(img, seed=11, tilt=0.07):
    """Printed page photographed from above at an angle on a table."""
    import cv2
    rng = np.random.default_rng(seed)
    page = np.asarray(img.convert('L'))
    h, w = page.shape
    W, H = int(w * 1.25), int(h * 1.25)
    table = np.full((H, W), 95, np.uint8)
    table = np.clip(table + rng.normal(0, 10, table.shape) + np.linspace(-20, 20, W)[None, :], 0, 255).astype(np.uint8)
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    j = lambda: rng.uniform(-tilt, tilt)
    dst = np.float32([[W * (0.10 + j()), H * (0.08 + j())], [W * (0.92 + j()), H * (0.11 + j())],
                      [W * (0.88 + j()), H * (0.93 + j())], [W * (0.08 + j()), H * (0.90 + j())]])
    M = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(page, M, (W, H), borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    mask = cv2.warpPerspective(np.full_like(page, 255), M, (W, H))
    out = np.where(mask > 0, warped, table).astype(float)
    yy, xx = np.mgrid[0:H, 0:W]
    light = 0.62 + 0.38 * (1 - ((xx / W - 0.25) ** 2 + (yy / H - 0.2) ** 2) ** 0.5)
    shadow = np.where(xx + yy * 0.6 > W * 0.95, 0.82, 1.0)
    out = out * light * shadow
    out = cv2.GaussianBlur(out, (0, 0), 1.1) + rng.normal(0, 5, out.shape)
    rgb = np.dstack([out * 1.0, out * 0.97, out * 0.9])
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))


def main():
    os.makedirs(OUT, exist_ok=True)
    cases = []

    def save(name, img, house, style, fmt='png'):
        path = os.path.join(OUT, f'{name}.{fmt}')
        if fmt == 'jpg':
            img.convert('RGB').save(path, 'JPEG', quality=60)
        else:
            img.save(path, 'PNG', optimize=True)
        cases.append({'file': os.path.basename(path), 'house': house, 'style': style})

    rect_pdf = render_pdf(os.path.join(VEC, 'haus-rechteck-1zu100.pdf'), 150)
    l_pdf = render_pdf(os.path.join(VEC, 'haus-l-1zu50.pdf'), 100)
    save('rechteck-scan', rect_pdf, 'haus-rechteck', 'scan')
    save('l-scan', l_pdf, 'haus-l', 'scan')
    save('rechteck-kopie', photocopy(rect_pdf), 'haus-rechteck', 'kopie')
    save('rechteck-foto', phone_photo(rect_pdf, 11), 'haus-rechteck', 'foto', 'jpg')
    save('l-foto', phone_photo(l_pdf, 12), 'haus-l', 'foto', 'jpg')
    for key, short in (('haus-rechteck', 'rechteck'), ('haus-l', 'l'), ('haus-gross', 'gross')):
        h = HOUSES[key]
        filled = style_filled(h)
        save(f'{short}-gefuellt', filled, key, 'gefuellt')
        if key == 'haus-gross':
            save('gross-gefuellt-foto', phone_photo(filled.resize((filled.width * 2, filled.height * 2)), 13, 0.05), key, 'foto', 'jpg')
            save('gross-schraffiert', style_hatched(h), key, 'schraffiert')
            save('gross-schraffiert-kopie', photocopy(style_hatched(h, 0.09), 5), key, 'kopie')
            save('gross-skizze', style_sketch(h), key, 'skizze')
            save('gross-skizze-foto', phone_photo(style_sketch(h, 0.07, 9), 14, 0.04), key, 'foto', 'jpg')
        if key == 'haus-rechteck':
            save('rechteck-skizze', style_sketch(h, seed=8), key, 'skizze')
    data = {'license': 'CC0-1.0, selbst erzeugt', 'houses': {k: truth(h) for k, h in HOUSES.items()}, 'cases': cases}
    with open(os.path.join(OUT, 'truth.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(len(cases), 'Testbilder')


if __name__ == '__main__':
    main()
