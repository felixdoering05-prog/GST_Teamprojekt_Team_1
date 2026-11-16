"""Generates the self-made test plans in test/fixtures/plans with exactly known dimensions.

Development tool only (needs reportlab in addition to the runtime requirements):
    python plan-extract/tests/make_fixtures.py
The expected values used by the tests are written to expected.json next to the plans.
"""
import json, math, os, sys
import ezdxf
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'test', 'fixtures', 'plans'))


def house_rect():
    """10.00 x 8.00 m, outer wall 36.5 cm, inner walls 24 / 11.5 cm, four rooms."""
    T = 365
    outline = [(0, 0), (10000, 0), (10000, 8000), (0, 8000)]
    inner = [((5000, T), (5000, 8000 - T), 240), ((5120, 4000), (10000 - T, 4000), 115), ((T, 3000), (4880, 3000), 115)]
    openings = [
        ('door', (2000, T / 2), 0, 1010), ('door', (3500, 3000), 0, 885), ('door', (5000, 6000), 90, 885), ('door', (5000, 1800), 90, 760),
        ('window', (7500, T / 2), 0, 1010), ('window', (2500, 8000 - T / 2), 0, 1510), ('window', (7500, 8000 - T / 2), 0, 1260),
        ('window', (T / 2, 5500), 90, 1010), ('window', (10000 - T / 2, 2000), 90, 885),
    ]
    rooms = [('Küche', (2600, 1650)), ('Wohnen', (2600, 5500)), ('Bad', (7500, 2000)), ('Schlafen', (7500, 6000))]
    return dict(outline=outline, T=T, inner=inner, openings=openings, rooms=rooms)


def house_l():
    """L-shaped, outer wall 30 cm, one 17.5 cm partition, three rooms."""
    T = 300
    outline = [(0, 0), (9000, 0), (9000, 5000), (4000, 5000), (4000, 9000), (0, 9000)]
    inner = [((T, 5000), (4000 - T, 5000), 175), ((4000, T), (4000, 5000 - T), 175)]
    openings = [
        ('door', (6500, T / 2), 0, 1010), ('door', (2000, 5000), 0, 885), ('door', (4000, 2500), 90, 885),
        ('window', (2000, T / 2), 0, 1260), ('window', (2000, 9000 - T / 2), 0, 1010), ('window', (9000 - T / 2, 2500), 90, 1510),
    ]
    rooms = [('Wohnen', (2000, 2500)), ('Arbeiten', (6500, 2500)), ('Schlafen', (2000, 7000))]
    return dict(outline=outline, T=T, inner=inner, openings=openings, rooms=rooms)


def wall_area(h):
    outer = Polygon(h['outline'])
    ring = outer.difference(outer.buffer(-h['T'], join_style=2))
    parts = [ring] + [LineString([a, b]).buffer(t / 2, cap_style=2, join_style=2) for a, b, t in h['inner']]
    walls = unary_union(parts)
    holes = []
    for kind, (x, y), ang, w in h['openings']:
        t = max([h['T']] + [t for a, b, t in h['inner'] if LineString([a, b]).distance(LineString([(x, y), (x, y)]).buffer(1)) < 5]) + 20
        holes.append(box(x - w / 2, y - t / 2, x + w / 2, y + t / 2) if ang == 0 else box(x - t / 2, y - w / 2, x + t / 2, y + w / 2))
    return walls.difference(unary_union(holes))


def thickness_at(h, x, y):
    for a, b, t in h['inner']:
        if LineString([a, b]).distance(LineString([(x, y), (x + 1, y)])) < 5:
            return t
    return h['T']


def drawing(h):
    """Returns plan primitives in mm: lines, arcs, texts, dimension chains."""
    lines, arcs, texts = [], [], []
    area = wall_area(h)
    for poly in getattr(area, 'geoms', [area]):
        for ring in [poly.exterior, *poly.interiors]:
            c = list(ring.coords)
            for p, q in zip(c, c[1:]):
                lines.append(('wall', p, q))
    for kind, (x, y), ang, w in h['openings']:
        t = thickness_at(h, x, y)
        u = (1, 0) if ang == 0 else (0, 1)
        n = (-u[1], u[0])
        p = lambda s, o: (x + u[0] * s + n[0] * o, y + u[1] * s + n[1] * o)
        if kind == 'window':
            for o in (-t / 6, t / 6):
                lines.append(('window', p(-w / 2, o), p(w / 2, o)))
        else:
            # Hinge at the left jamb on the inner face, leaf perpendicular, quarter arc back to the other jamb.
            side = 1 if (y > 4000 if ang == 0 else x > 4500) else -1
            hinge = p(-w / 2, side * t / 2)
            leaf = p(-w / 2, side * (t / 2 + w))
            lines.append(('door', hinge, leaf))
            start = math.degrees(math.atan2(leaf[1] - hinge[1], leaf[0] - hinge[0]))
            end = math.degrees(math.atan2(p(w / 2, side * t / 2)[1] - hinge[1], p(w / 2, side * t / 2)[0] - hinge[0]))
            a0, a1 = (end, start) if (start - end) % 360 < 180 else (start, end)
            arcs.append(('door', hinge, w, a0 % 360, a1 % 360))
    for name, (x, y) in h['rooms']:
        texts.append(('room', name, (x, y + 250), 0, 250))
    return lines, arcs, texts


def room_areas(h):
    area = wall_area(h)
    # Openings make the wall area leak; rooms are measured on closed walls.
    outer = Polygon(h['outline'])
    ring = outer.difference(outer.buffer(-h['T'], join_style=2))
    walls = unary_union([ring] + [LineString([a, b]).buffer(t / 2, cap_style=2, join_style=2) for a, b, t in h['inner']])
    result = {}
    for poly in getattr(walls, 'geoms', [walls]):
        for hole in poly.interiors:
            hp = Polygon(hole)
            for name, pt in h['rooms']:
                if hp.contains(LineString([pt, pt]).centroid):
                    result[name] = round(hp.area / 1e6, 3)
    return result


def chain_points(h, axis):
    """Dimension chain along the bottom (x) or left (y) outer wall: faces, opening edges."""
    xs, ys = zip(*h['outline'])
    T = h['T']
    if axis == 'x':
        pts = {min(xs), min(xs) + T, max(xs) - T, max(xs)}
        pts |= {x + s * w / 2 for k, (x, y), a, w in h['openings'] if a == 0 and y < T for s in (-1, 1)}
    else:
        pts = {min(ys), min(ys) + T, max(ys) - T, max(ys)}
        pts |= {y + s * w / 2 for k, (x, y), a, w in h['openings'] if a == 90 and x < T for s in (-1, 1)}
    return sorted(pts)


def fmt(mm, superscript=False):
    """German dimension text: metres with two decimals from 1 m, centimetres below (half cm as superscript 5)."""
    if mm >= 1000:
        v = mm / 1000
        s = f'{v:.3f}'
        if s.endswith('0'):
            return s[:-1].replace('.', ','), None
        return (s[:-1].replace('.', ','), '5') if superscript else (s.replace('.', ','), None)
    cm = mm / 10
    if abs(cm - round(cm)) < 1e-6:
        return str(int(round(cm))), None
    return (str(int(cm)), '5') if superscript else (f'{cm:.1f}'.replace('.', ','), None)


# ---------------------------------------------------------------- DXF

def door_block(doc, name, w, t):
    blk = doc.blocks.new(name=name)
    blk.add_line((0, t / 2), (0, t / 2 + w))
    blk.add_arc((0, t / 2), w, 0, 90)
    return blk


def write_dxf_blocks(h, path):
    """mm, INSUNITS=4, layered, doors and windows as blocks, real DIMENSION entities, furniture to ignore."""
    doc = ezdxf.new('R2018', setup=True)
    doc.units = ezdxf.units.MM
    for layer in ('A-WAND', 'A-TUER', 'A-FENSTER', 'A-RAUM', 'A-BEMASSUNG', 'MOEBEL'):
        doc.layers.add(layer)
    msp = doc.modelspace()
    lines, arcs, texts = drawing(h)
    for kind, p, q in lines:
        if kind == 'wall':
            msp.add_line(p, q, dxfattribs={'layer': 'A-WAND'})
    for i, (kind, (x, y), ang, w) in enumerate(h['openings']):
        t = thickness_at(h, x, y)
        name = f'{"TUER" if kind == "door" else "FENSTER"}_{w}_{t}'
        if name not in doc.blocks:
            blk = doc.blocks.new(name=name)
            if kind == 'door':
                blk.add_line((0, t / 2), (0, t / 2 + w))
                blk.add_arc((0, t / 2), w, 0, 90)
            else:
                for o in (-t / 6, t / 6):
                    blk.add_line((0, o), (w, o))
                blk.add_line((0, -t / 2), (0, t / 2))
                blk.add_line((w, -t / 2), (w, t / 2))
        u = (1, 0) if ang == 0 else (0, 1)
        ins = (x - u[0] * w / 2, y - u[1] * w / 2)
        msp.add_blockref(name, ins, dxfattribs={'layer': 'A-TUER' if kind == 'door' else 'A-FENSTER', 'rotation': ang})
    for kind, text, (x, y), ang, size in texts:
        msp.add_text(text, height=size, dxfattribs={'layer': 'A-RAUM'}).set_placement((x, y), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
    areas = room_areas(h)
    for name, (x, y) in h['rooms']:
        msp.add_text(f'{areas[name]:.2f} m²'.replace('.', ','), height=180, dxfattribs={'layer': 'A-RAUM'}).set_placement((x, y - 200), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
    xs, ys = zip(*h['outline'])
    pts = chain_points(h, 'x')
    for a, b in zip(pts, pts[1:]):
        msp.add_linear_dim(base=(0, min(ys) - 900), p1=(a, min(ys)), p2=(b, min(ys)), dimstyle='EZDXF', dxfattribs={'layer': 'A-BEMASSUNG'}).render()
    msp.add_linear_dim(base=(0, min(ys) - 1600), p1=(min(xs), min(ys)), p2=(max(xs), min(ys)), dimstyle='EZDXF', dxfattribs={'layer': 'A-BEMASSUNG'}).render()
    msp.add_linear_dim(base=(min(xs) - 1600, 0), p1=(min(xs), min(ys)), p2=(min(xs), max(ys)), angle=90, dimstyle='EZDXF', dxfattribs={'layer': 'A-BEMASSUNG'}).render()
    # Furniture must not become walls: a 2 x 0.9 m table and a parallel sofa.
    msp.add_lwpolyline([(1000, 4500), (3000, 4500), (3000, 5400), (1000, 5400)], close=True, dxfattribs={'layer': 'MOEBEL'})
    msp.add_lwpolyline([(1000, 6800), (3000, 6800), (3000, 7200), (1000, 7200)], close=True, dxfattribs={'layer': 'MOEBEL'})
    doc.saveas(path)


def write_dxf_plain(h, path, unit=10.0):
    """Unitless DXF in centimetres: everything on layer 0, exploded symbols and dimensions, texts in metres."""
    doc = ezdxf.new('R2010')
    doc.header['$INSUNITS'] = 0
    msp = doc.modelspace()
    s = lambda p: (p[0] / unit, p[1] / unit)
    lines, arcs, texts = drawing(h)
    walls = [l for l in lines if l[0] == 'wall']
    # Wall outlines as polylines where consecutive.
    for kind, p, q in walls:
        msp.add_lwpolyline([s(p), s(q)])
    for kind, p, q in lines:
        if kind != 'wall':
            msp.add_line(s(p), s(q))
    for kind, c, r, a0, a1 in arcs:
        msp.add_arc(s(c), r / unit, a0, a1)
    for kind, text, (x, y), ang, size in texts:
        msp.add_text(text, height=size / unit).set_placement(s((x, y)), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
    xs, ys = zip(*h['outline'])
    for axis in ('x', 'y'):
        pts = chain_points(h, axis)
        off = (min(ys) if axis == 'x' else min(xs)) - 900
        for a, b in zip(pts, pts[1:]):
            P = (lambda v: (v, off)) if axis == 'x' else (lambda v: (off, v))
            msp.add_line(s(P(a)), s(P(b)))
            label, sup = fmt(b - a)
            mid = P((a + b) / 2)
            pos = (mid[0], mid[1] + 60) if axis == 'x' else (mid[0] - 60, mid[1])
            msp.add_text(label, height=12, dxfattribs={'rotation': 0 if axis == 'x' else 90}).set_placement(s(pos), align=ezdxf.enums.TextEntityAlignment.BOTTOM_CENTER)
        for v in pts:
            P = (lambda v, o: (v, o)) if axis == 'x' else (lambda v, o: (o, v))
            msp.add_line(s(P(v, off - 200)), s(P(v, (min(ys) if axis == 'x' else min(xs)) - 100)))
            msp.add_line(s(P(v - 70, off - 70)), s(P(v + 70, off + 70)))
    doc.saveas(path)


# ---------------------------------------------------------------- PDF

def write_pdf(h, path, scale, pagesize, title, superscript=True):
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import mm as MM
    W, H = pagesize
    c = canvas.Canvas(path, pagesize=pagesize)
    c.setTitle(title)
    ox, oy = 35 * MM, 35 * MM
    P = lambda p: (ox + p[0] / scale * MM, oy + p[1] / scale * MM)
    lines, arcs, texts = drawing(h)
    # Page frame and title block: must not be mistaken for walls.
    c.setLineWidth(0.7)
    c.rect(10 * MM, 10 * MM, W - 20 * MM, H - 20 * MM)
    c.rect(15 * MM, 15 * MM, W - 30 * MM, H - 30 * MM)
    c.rect(W - 95 * MM, 15 * MM, 80 * MM, 22 * MM)
    c.setFont('Helvetica', 9)
    c.drawString(W - 92 * MM, 27 * MM, title)
    c.drawString(W - 92 * MM, 20 * MM, f'M 1:{scale}')
    c.setLineWidth(0.5)
    walls = [l for l in lines if l[0] == 'wall']
    for kind, p, q in walls:
        c.line(*P(p), *P(q))
    c.setLineWidth(0.18)
    for kind, p, q in lines:
        if kind != 'wall':
            c.line(*P(p), *P(q))
    for kind, ctr, r, a0, a1 in arcs:
        x, y = P(ctr)
        R = r / scale * MM
        extent = (a1 - a0) % 360
        path_ = c.beginPath()
        path_.arc(x - R, y - R, x + R, y + R, startAng=a0, extent=extent)
        c.drawPath(path_, stroke=1, fill=0)
    for kind, text, pt, ang, size in texts:
        c.setFont('Helvetica', 9)
        x, y = P(pt)
        c.drawCentredString(x, y, text)
    areas = room_areas(h)
    for name, pt in h['rooms']:
        x, y = P((pt[0], pt[1] - 200))
        c.setFont('Helvetica', 7)
        c.drawCentredString(x, y, f'{areas[name]:.2f} m²'.replace('.', ','))
    xs, ys = zip(*h['outline'])

    def dim_chain(axis, pts, offset_mm):
        c.setLineWidth(0.18)
        base = (min(ys) if axis == 'x' else min(xs)) - offset_mm
        Q = (lambda v, o: P((v, o))) if axis == 'x' else (lambda v, o: P((o, v)))
        c.line(*Q(pts[0] - 200, base), *Q(pts[-1] + 200, base))
        for v in pts:
            c.line(*Q(v, base - 200), *Q(v, (min(ys) if axis == 'x' else min(xs)) - 150))
            a, b = Q(v - 80, base - 80), Q(v + 80, base + 80)
            c.line(*a, *b)
        for a, b in zip(pts, pts[1:]):
            label, sup = fmt(b - a, superscript)
            x, y = Q((a + b) / 2, base)
            c.saveState()
            c.translate(x, y)
            if axis == 'y':
                c.rotate(90)
            c.setFont('Helvetica', 7)
            c.drawCentredString(0, 1.2, label)
            if sup:
                wlab = c.stringWidth(label, 'Helvetica', 7)
                c.setFont('Helvetica', 4.5)
                c.drawString(wlab / 2 + 0.2, 4.0, sup)
            c.restoreState()

    dim_chain('x', chain_points(h, 'x'), 900)
    dim_chain('x', [min(xs), max(xs)], 1600)
    dim_chain('y', chain_points(h, 'y'), 900)
    dim_chain('y', [min(ys), max(ys)], 1600)
    c.showPage()
    c.save()


def write_text_only_pdf(path):
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    c = canvas.Canvas(path, pagesize=A4)
    c.setFont('Helvetica', 14)
    c.drawString(72, 760, 'Eingescannter Grundriss (nur Text, keine Vektorlinien)')
    c.showPage()
    c.save()


def write_scan_pdf(path):
    """A scanned plan: one raster image on the page plus a vector frame and title block (must go to the image path)."""
    import io
    from PIL import Image, ImageDraw
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm as MM
    from reportlab.lib.utils import ImageReader
    img = Image.new('L', (600, 420), 255)
    d = ImageDraw.Draw(img)
    d.rectangle((60, 60, 540, 360), outline=0, width=12)
    d.line((300, 60, 300, 360), fill=0, width=6)
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    W, H = landscape(A4)
    c = canvas.Canvas(path, pagesize=(W, H))
    c.drawImage(ImageReader(io.BytesIO(buf.getvalue())), 20 * MM, 20 * MM, W - 40 * MM, H - 40 * MM)
    c.rect(10 * MM, 10 * MM, W - 20 * MM, H - 20 * MM)
    c.rect(15 * MM, 15 * MM, W - 30 * MM, H - 30 * MM)
    c.setFont('Helvetica', 9)
    c.drawString(W - 92 * MM, 20 * MM, 'M 1:100')
    c.showPage()
    c.save()


def expected(h):
    xs, ys = zip(*h['outline'])
    doors = sum(1 for o in h['openings'] if o[0] == 'door')
    windows = sum(1 for o in h['openings'] if o[0] == 'window')
    return {'width': max(xs) - min(xs), 'depth': max(ys) - min(ys), 'outer_thickness': h['T'],
            'inner_thickness': sorted({t for a, b, t in h['inner']}), 'doors': doors, 'windows': windows,
            'rooms': room_areas(h), 'walls': None}


def main():
    from reportlab.lib.pagesizes import A4, A3, landscape
    os.makedirs(OUT, exist_ok=True)
    r, l = house_rect(), house_l()
    write_dxf_blocks(r, os.path.join(OUT, 'haus-rechteck-bloecke.dxf'))
    write_dxf_plain(l, os.path.join(OUT, 'haus-l-cm-ohne-einheit.dxf'))
    write_pdf(r, os.path.join(OUT, 'haus-rechteck-1zu100.pdf'), 100, landscape(A4), 'Grundriss EG Haus Rechteck')
    write_pdf(l, os.path.join(OUT, 'haus-l-1zu50.pdf'), 50, landscape(A3), 'Grundriss EG Haus L')
    write_text_only_pdf(os.path.join(OUT, 'nur-text.pdf'))
    write_scan_pdf(os.path.join(OUT, 'scan-mit-rahmen.pdf'))
    exp = {'haus-rechteck': {**expected(r), 'walls': 7}, 'haus-l': {**expected(l), 'walls': 8}}
    with open(os.path.join(OUT, 'expected.json'), 'w', encoding='utf-8') as f:
        json.dump(exp, f, ensure_ascii=False, indent=1)
    print(json.dumps(exp, ensure_ascii=False))


if __name__ == '__main__':
    main()
