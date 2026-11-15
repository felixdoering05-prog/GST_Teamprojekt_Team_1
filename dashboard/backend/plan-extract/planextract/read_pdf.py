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


def read_pdf(path):
    plans = []
    with pdfplumber.open(path) as pdf:
        for index, page in enumerate(pdf.pages[:MAX_PAGES]):
            H = float(page.height)
            plan = Plan('pdf', page=index, unit_mm=None)
            objs = page.objects
            if sum(len(v) for v in objs.values()) > MAX_OBJECTS:
                plan.notes.append('too_many_objects')
                plans.append(plan)
                continue
            for kind in ('line', 'curve', 'rect'):
                for o in objs.get(kind, []):
                    if not o.get('stroke', True) and kind != 'rect':
                        continue
                    width = float(o.get('linewidth') or 0)
                    if o.get('path'):
                        segs, curves = _segments_from_path(o['path'], H, width)
                    elif kind == 'rect':
                        x0, x1, y0, y1 = o['x0'], o['x1'], H - o['bottom'], H - o['top']
                        segs = [Seg((x0, y0), (x1, y0), width=width), Seg((x1, y0), (x1, y1), width=width),
                                Seg((x1, y1), (x0, y1), width=width), Seg((x0, y1), (x0, y0), width=width)]
                        curves = []
                    else:
                        pts = [(p[0], H - p[1]) for p in o.get('pts', [])]
                        segs = [Seg(p, q, width=width) for p, q in zip(pts, pts[1:])]
                        curves = []
                    plan.segs.extend(s for s in segs if s.length > 1e-6)
                    for pts in curves:
                        arc = fit_arc(pts)
                        if arc:
                            plan.arcs.append(arc)
                        else:
                            plan.segs.extend(Seg(p, q, width=width) for p, q in zip(pts, pts[1:]))
            plan.texts = _group_chars(page.chars, H)
            covered = sum(max(0.0, min(i['x1'], page.width) - max(i['x0'], 0)) * max(0.0, min(i['bottom'], H) - max(i['top'], 0)) for i in page.images)
            if covered > 0.25 * float(page.width) * H:
                plan.notes.append('raster')
            plans.append(plan)
    return plans
