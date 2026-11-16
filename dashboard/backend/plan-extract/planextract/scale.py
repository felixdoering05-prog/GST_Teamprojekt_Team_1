"""Scale from dimension texts measured against their dimension lines, with plausibility checks."""
import math, re
from statistics import median

PT_MM = 25.4 / 72.0
STANDARD = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000]
NUM = re.compile(r'^(\d{1,5})(?:[.,](\d{1,3}))?(⁵)?$')
SCALE_LABEL = re.compile(r'(?:^|[^\d])1\s*:\s*(\d{1,4})(?![\d,.])')


def parse_dimension(text):
    """Possible millimetre values of a German dimension text ('4,00', '3,51', '1,01⁵', '36⁵', '24', '1250')."""
    s = text.strip().replace(' ', '').rstrip('m').replace('⁵', '⁵')
    m = NUM.match(s)
    if not m:
        return []
    whole, frac, half = m.group(1), m.group(2), bool(m.group(3))
    if frac is not None:
        if len(whole) > 3:
            return []
        if len(frac) >= 2:      # metres: 4,00 / 1,01⁵ / 0,885
            v = float(whole + '.' + frac) * 1000 + (5 if half and len(frac) == 2 else 0)
            return [v]
        v = float(whole + '.' + frac)
        return [v * 10, v * 1000]  # 36,5 cm or 3,5 m
    n = int(whole)
    if n == 0 or (n < 10 and not half):
        return []
    c = [n * 10 + (5 if half else 0)]
    if not half:
        c += [float(n), n * 1000.0]
    return c


def _project(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dy * dy
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2
    q = (a[0] + t * dx, a[1] + t * dy)
    return t, math.dist(p, q)


def _angle_diff(a, b):
    d = abs(a - b) % 180
    return min(d, 180 - d)


def _intersection_param(a, b, c, d):
    """Parameter t on a-b where segment c-d crosses it (with slack), or None."""
    r = (b[0] - a[0], b[1] - a[1]); s = (d[0] - c[0], d[1] - c[1])
    den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-12:
        return None
    qp = (c[0] - a[0], c[1] - a[1])
    t = (qp[0] * s[1] - qp[1] * s[0]) / den
    u = (qp[0] * r[1] - qp[1] * r[0]) / den
    return t, u


def dimension_items(plan):
    """Pairs numeric texts with the dimension (sub-)line they label. Returns list of dicts in drawing units."""
    items = []
    for d in plan.dims:
        cands = parse_dimension(d.label) if d.label else []
        items.append({'label': d.label or None, 'cands': cands, 'measured': d.measured, 'segs': set(), 'cad': True})
    segs = plan.segs
    if not segs:
        return items
    lengths = sorted(s.length for s in segs)
    ref = lengths[len(lengths) // 2] or 1.0
    for text in plan.texts:
        cands = parse_dimension(text.text)
        if not cands:
            continue
        h = text.height or ref * 0.05
        best = None
        for i, s in enumerate(segs):
            if s.block or s.length < 2 * h or _angle_diff(s.angle, text.angle) > 3:
                continue
            t, dist = _project(text.at, s.a, s.b)
            if not (0.0 < t < 1.0) or dist > 2.5 * h:
                continue
            if best is None or dist < best[1]:
                best = (i, dist, t)
        if best is None:
            continue
        i, dist, t = best
        line = segs[i]
        cuts, cross = [0.0, 1.0], set()
        for j, s in enumerate(segs):
            if j == i or _angle_diff(s.angle, line.angle) < 20:
                continue
            res = _intersection_param(line.a, line.b, s.a, s.b)
            if not res:
                continue
            tt, uu = res
            slack = h / max(s.length, 1e-9)
            if -0.001 <= tt <= 1.001 and -slack <= uu <= 1 + slack:
                near = min(_project(s.a, line.a, line.b)[1], _project(s.b, line.a, line.b)[1])
                if near <= 3 * h:
                    cuts.append(min(1.0, max(0.0, tt)))
                    cross.add(j)
        cuts = sorted(set(round(c, 9) for c in cuts))
        lo = max([c for c in cuts if c <= t], default=0.0)
        hi = min([c for c in cuts if c >= t], default=1.0)
        measured = (hi - lo) * line.length
        if measured <= 0:
            continue
        items.append({'label': text.text, 'cands': cands, 'measured': measured, 'segs': {i} | cross, 'cad': False,
                      'at': text.at})
    return items


def _vote(items, tol=0.015):
    pool = [(math.log(v / it['measured']), k) for k, it in enumerate(items) if it['cands'] for v in it['cands'] if v > 0]
    best = None
    for lr, _ in pool:
        support = {}
        for lr2, k in pool:
            if abs(lr2 - lr) <= tol and (k not in support or abs(lr2 - lr) < abs(support[k] - lr)):
                support[k] = lr2
        score = len(support)
        if best is None or score > best[0] or (score == best[0] and abs(lr) < abs(best[1])):
            best = (score, lr, support)
    if not best:
        return None, {}
    score, lr, support = best
    r = math.exp(median(support.values()))
    return r, support


def determine_scale(plan, extents_units=None):
    """Returns dict with mm_per_unit, method, ratio (1:N for PDFs), evidence, warnings, dim_segs."""
    items = dimension_items(plan)
    warnings = []
    r, support = _vote(items)
    method = None
    ratio = None
    if r and len(support) >= 2:
        method = 'dimensions'
    elif r and len(support) == 1:
        method = 'single_dimension'
    else:
        r = None
    if plan.kind == 'pdf':
        if r:
            n = r / PT_MM
            std = min(STANDARD, key=lambda s: abs(s / n - 1))
            if not 5 <= n <= 2000:
                warnings.append('Maßstab aus den Maßzahlen ist unplausibel und wurde verworfen.')
                r, method = None, None
            elif abs(std / n - 1) <= 0.015:
                r, ratio = std * PT_MM, std
            else:
                ratio = round(n, 1)
            if r and method == 'single_dimension' and ratio not in STANDARD:
                warnings.append('Maßstab nur aus einer einzigen Maßzahl abgeleitet.')
        if not r:
            labels = [int(m.group(1)) for t in plan.texts for m in [SCALE_LABEL.search(t.text)] if m]
            labels = [n for n in labels if n in STANDARD and n >= 10]
            if labels:
                ratio = max(set(labels), key=labels.count)
                r, method = ratio * PT_MM, 'scale_label'
                warnings.append(f'Keine verwertbaren Maßketten – Maßstab 1:{ratio} aus der Planbeschriftung übernommen.')
    else:
        declared = plan.unit_mm
        if r and declared:
            if abs(r / declared - 1) <= 0.02:
                r, method = declared, 'units+dimensions'
            elif len(support) >= 3:
                warnings.append('Zeichnungseinheit der DXF widerspricht den Maßzahlen; Maßzahlen verwendet.')
            else:
                r, method = declared, 'units'
        elif declared:
            r, method = declared, 'units'
        elif r:
            # Snap to a usual unit when close (mm, cm, dm, m, inch).
            for u in (1.0, 10.0, 100.0, 1000.0, 25.4):
                if abs(r / u - 1) <= 0.02:
                    r = u
                    break
        elif extents_units:
            ext = max(extents_units)
            r = 1000.0 if ext < 200 else 10.0 if ext < 2500 else 1.0
            method = 'extent_guess'
            warnings.append('DXF ohne Einheit und ohne lesbare Maßzahlen: Einheit aus der Gebäudegröße geschätzt.')
    evidence, dim_segs = [], set()
    if r:
        for k, it in enumerate(items):
            measured = it['measured'] * r
            if it['cands']:
                lab = min(it['cands'], key=lambda v: abs(v - measured))
                if k in support:
                    evidence.append({'label': it['label'], 'labelled_mm': round(lab, 1), 'measured_mm': round(measured, 1),
                                     'error_pct': round(abs(measured - lab) / lab * 100, 2)})
                    dim_segs |= it['segs']
            elif it['cad']:
                dim_segs |= it['segs']
    return {'mm_per_unit': r, 'method': method, 'ratio': ratio, 'evidence': evidence, 'warnings': warnings, 'dim_segs': dim_segs,
            'support': len(support) if r else 0}
