"""Vector PDF reader based on pdfplumber (MIT). Coordinates in PDF points, y up."""
import math
import pdfplumber
from .primitives import Seg, Text, Plan, bezier_points, fit_arc

MAX_PAGES = 4
MAX_OBJECTS = 60000


def _segments_from_path(path, H, width):
    segs, curves = [], []
    cur = start = None
    for cmd in path:
        op, pts = cmd[0], [(p[0], H - p[1]) for p in cmd[1:]]
        if op == 'm':
            cur = start = pts[0]
        elif op == 'l' and cur is not None:
            segs.append(Seg(cur, pts[0], width=width)); cur = pts[0]
        elif op == 'c' and cur is not None:
            curves.append(bezier_points(cur, pts[0], pts[1], pts[2])); cur = pts[2]
        elif op == 'h' and cur is not None and start is not None:
            if math.dist(cur, start) > 1e-6:
                segs.append(Seg(cur, start, width=width))
            cur = start
    return segs, curves


def _group_chars(chars, H):
    """Groups characters into words along their own (possibly rotated) baseline; merges superscript 5."""
    items = []
    for ch in chars:
        a, b, c, d, e, f = ch['matrix']
        ang = round(math.degrees(math.atan2(b, a)) % 360, 1)
        u = (math.cos(math.radians(ang)), math.sin(math.radians(ang)))
        n = (-u[1], u[0])
        dx, dy = ch['x1'] - ch['x0'], ch['bottom'] - ch['top']
        adv = abs(dx * u[0]) + abs(dy * u[1])
        size = abs(dx * n[0]) + abs(dy * n[1]) or 1.0
        items.append({'t': ch['text'], 'ang': ang, 'size': size, 'u': u, 'n': n,
                      's': e * u[0] + f * u[1], 'base': e * n[0] + f * n[1], 'adv': adv})
    # Baseline clusters per direction, then reading order along the direction.
    items.sort(key=lambda i: (i['ang'], i['base']))
    rows, cur = [], []
    for it in items:
        if cur and (it['ang'] != cur[-1]['ang'] or it['base'] - cur[-1]['base'] > 0.1 * cur[-1]['size']):
            rows.append(cur)
            cur = []
        cur.append(it)
    if cur:
        rows.append(cur)
    words = []
    for row in rows:
        row.sort(key=lambda i: i['s'])
        w = None
        for it in row:
            if not it['t'].strip():
                continue
            if w and abs(w['size'] - it['size']) < 0.2 * w['size'] and -0.2 * it['size'] < it['s'] - w['end'] < 0.35 * it['size']:
                w['t'] += it['t']
                w['end'] = it['s'] + it['adv']
            else:
                w = {**it, 'start': it['s'], 'end': it['s'] + it['adv']}
                words.append(w)
    # Half centimetres are written as a small raised 5 right after the number ("36⁵", "1,01⁵").
    merged, skip = [], set()
    for i, w in enumerate(words):
        if i in skip:
            continue
        for j, v in enumerate(words):
            if j in skip or j == i or v['ang'] != w['ang'] or v['t'] not in ('5', '⁵') or v['size'] > 0.8 * w['size']:
                continue
            if 0 <= v['start'] - w['end'] < 0.4 * w['size'] and 0.15 * w['size'] < v['base'] - w['base'] < 0.9 * w['size'] and w['t'][-1:].isdigit():
                w = {**w, 't': w['t'] + '⁵', 'end': v['end']}; skip.add(j); break
        merged.append(w)
    out = []
    for w in merged:
        mid = (w['start'] + w['end']) / 2
        cx = w['u'][0] * mid + w['n'][0] * (w['base'] + w['size'] * 0.35)
        cy = w['u'][1] * mid + w['n'][1] * (w['base'] + w['size'] * 0.35)
        out.append(Text(w['t'], (cx, cy), w['ang'] % 180 if w['ang'] % 180 < 179.5 else 0.0, w['size']))
    return out


COMPLEX = 60000          # above this many path pieces a plan is treated as large (technical plan, hatching)
HARD_LIMIT = 3000000     # safety stop for pathological files


def _colour(c):
    """Stroke colour -> (r, g, b) in 0..1 or None (unknown / pattern)."""
    if c is None:
        return None
    if isinstance(c, (int, float)):
        return (float(c),) * 3
    if isinstance(c, (list, tuple)):
        v = [float(x) for x in c if isinstance(x, (int, float))]
        if len(v) == 1:
            return (v[0],) * 3
        if len(v) == 3:
            return tuple(v)
        if len(v) == 4:  # CMYK
            cc, m, y, k = v
            return ((1 - cc) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k))
    return None


def _saturation(rgb):
    if rgb is None:
        return 0.0
    mx, mn = max(rgb), min(rgb)
    return 0.0 if mx < 1e-6 else (mx - mn) / mx


def read_pdf(path):
    """Streams vector paths and characters with pdfminer instead of materialising every object (pdfplumber): large
    technical plans (hundreds of thousands of pieces) fit into a few hundred MB. Large plans keep only neutral
    (grey/black/white) building lines; coloured installation layers and tiny hatch strokes are dropped."""
    from pdfminer.converter import PDFLayoutAnalyzer
    from pdfminer.layout import LTChar, LTImage, LTFigure
    from pdfminer.pdfinterp import PDFResourceManager, PDFPageInterpreter
    from pdfminer.pdfpage import PDFPage
    from pdfminer.utils import apply_matrix_pt

    class Device(PDFLayoutAnalyzer):
        def __init__(self, rsrc):
            super().__init__(rsrc, pageno=1, laparams=None)
            self.raw, self.curves, self.count = [], [], 0
            self.result = None

        def receive_layout(self, ltpage):
            self.result = ltpage

        def paint_path(self, gstate, stroke, fill, evenodd, path):
            shape = ''.join(x[0] for x in path)
            if shape[:1] != 'm':
                return
            if shape.count('m') > 1:
                import re as _re
                for m in _re.finditer(r'm[^m]+', shape):
                    self.paint_path(gstate, stroke, fill, evenodd, path[m.start(0):m.end(0)])
                return
            self.count += 1
            if self.count > HARD_LIMIT:
                return
            rect = shape in ('mlllh', 'mllll')
            if not stroke and not rect:
                return
            width = float(gstate.linewidth or 0)
            col = _colour(gstate.scolor if stroke else gstate.ncolor)
            ctm = self.ctm
            cur = start = None
            pts_curve = None
            for op in path:
                o = op[0]
                if o == 'm':
                    cur = start = apply_matrix_pt(ctm, (float(op[1]), float(op[2])))
                elif o == 'l' and cur is not None:
                    nxt = apply_matrix_pt(ctm, (float(op[1]), float(op[2])))
                    self.raw.append((cur[0], cur[1], nxt[0], nxt[1], width, col))
                    cur = nxt
                elif o in ('c', 'v', 'y') and cur is not None:
                    q = [apply_matrix_pt(ctm, (float(op[i]), float(op[i + 1]))) for i in range(1, len(op), 2)]
                    if o == 'v':
                        q = [cur] + q
                    elif o == 'y':
                        q = q + [q[-1]]
                    self.curves.append((bezier_points(cur, q[0], q[1], q[2]), width, col))
                    cur = q[2]
                elif o == 'h' and cur is not None and start is not None:
                    if math.dist(cur, start) > 1e-6:
                        self.raw.append((cur[0], cur[1], start[0], start[1], width, col))
                    cur = start

    plans = []
    rsrc = PDFResourceManager()
    with open(path, 'rb') as fh:
        for index, page in enumerate(PDFPage.get_pages(fh)):
            if index >= MAX_PAGES:
                break
            device = Device(rsrc)
            interp = PDFPageInterpreter(rsrc, device)
            interp.process_page(page)
            layout = device.result
            x0, y0, x1, y1 = page.mediabox
            W, H = float(x1 - x0), float(y1 - y0)
            plan = Plan('pdf', page=index, unit_mm=None)
            if device.count > HARD_LIMIT:
                plan.notes.append('too_many_objects')
                plans.append(plan)
                continue
            raw, curves = device.raw, device.curves
            large = len(raw) + len(curves) > COMPLEX
            if large:
                # Technical (TGA) and very detailed plans: walls are drawn neutral; installations are coloured.
                diag = math.hypot(W, H)
                tiny = diag * 0.0012
                raw = [r for r in raw if _saturation(r[5]) < 0.35 and math.hypot(r[2] - r[0], r[3] - r[1]) >= tiny]
                curves = [c for c in curves if _saturation(c[2]) < 0.35]
                plan.notes.append('large_plan_filtered')
            # pdfminer has y up already (user space); keep the reader's convention (PDF points, y up).
            plan.segs = [Seg((r[0], r[1]), (r[2], r[3]), width=r[4]) for r in raw if (r[2] - r[0]) ** 2 + (r[3] - r[1]) ** 2 > 1e-12]
            for pts, width, _ in curves:
                arc = fit_arc(pts)
                if arc:
                    plan.arcs.append(arc)
                else:
                    plan.segs.extend(Seg(p, q, width=width) for p, q in zip(pts, pts[1:]))
            chars, covered = [], 0.0
            def walk(items):
                nonlocal covered
                for it in items:
                    if isinstance(it, LTChar):
                        chars.append({'text': it.get_text(), 'matrix': it.matrix, 'x0': it.x0, 'x1': it.x1, 'top': H - it.y1, 'bottom': H - it.y0})
                    elif isinstance(it, LTImage):
                        covered += max(0.0, min(it.x1, W) - max(it.x0, 0)) * max(0.0, min(it.y1, H) - max(it.y0, 0))
                    elif isinstance(it, LTFigure):
                        walk(it)
            walk(layout)
            # Same fields as pdfplumber's char dicts (matrix in PDF user space, y up).
            plan.texts = _group_chars(chars, H)
            if covered > 0.25 * W * H:
                plan.notes.append('raster')
            del device, raw, curves
            plans.append(plan)
    return plans
