"""Measuring stick for plans from photos and scans: scores a detected level against the known truth.

    python tests/raster_eval.py [--method neu|neu+masse|prototyp] [--markdown out.md]

Metrics per plan (all in plain words in the report):
  modell      a model came out at all (>= 3 walls and >= 1 room)
  waende      share of the true wall length found (shape, after removing the overall scale error)
  praezision  share of detected wall length that lies on a true wall
  tueren      true doors found (door or passage within 0.6 m)
  fenster     true windows found
  raeume      true rooms whose label point lies in a detected room
  mass        error of the overall width/depth in percent (the scale)
  flaeche     mean area error of the found rooms in percent
  brauchbar   modell and waende >= 80 % and raeume >= 60 % and mass <= 20 %  -> "looks right"
"""
import argparse, json, math, os, sys, time
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
FIX = os.path.normpath(os.path.join(ROOT, '..', 'test', 'fixtures', 'plans', 'raster'))


def load_truth():
    with open(os.path.join(FIX, 'truth.json'), encoding='utf-8') as f:
        return json.load(f)


def _extent(level):
    xs, ys = [], []
    for w in level['walls']:
        for p in (w['a'], w['b']):
            xs += [p[0] - w['thickness'] / 2, p[0] + w['thickness'] / 2]
            ys += [p[1] - w['thickness'] / 2, p[1] + w['thickness'] / 2]
    return min(xs), min(ys), max(xs), max(ys)


def _samples(a, b, step=100):
    L = math.dist(a, b)
    n = max(1, int(L / step))
    return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]


def score(level, truth):
    out = {'modell': False, 'waende': 0.0, 'praezision': 0.0, 'tueren': 0.0, 'fenster': 0.0, 'raeume': 0.0,
           'raeume_ist': 0, 'raeume_soll': len(truth['rooms']), 'mass': None, 'flaeche': None, 'brauchbar': False}
    if not level or len(level.get('walls', [])) < 1:
        return out
    x0, y0, x1, y1 = _extent(level)
    dw, dd = x1 - x0, y1 - y0
    out['mass'] = round((abs(dw - truth['width']) / truth['width'] + abs(dd - truth['depth']) / truth['depth']) / 2 * 100, 1)
    fx, fy = truth['width'] / max(dw, 1), truth['depth'] / max(dd, 1)
    N = lambda p: ((p[0] - x0) * fx, (p[1] - y0) * fy)
    det = [LineString([N(w['a']), N(w['b'])]) for w in level['walls'] if math.dist(w['a'], w['b']) > 1]
    tru = [(LineString([a, b]), t) for a, b, t in truth['walls']]
    det_u = unary_union(det) if det else None
    hit = tot = 0
    for line, t in tru:
        for p in _samples(*line.coords):
            tot += 1
            hit += det_u is not None and det_u.distance(Point(p)) <= max(250, t)
    out['waende'] = round(hit / tot * 100, 1)
    tru_u = unary_union([l for l, t in tru])
    hit = tot = 0
    for line in det:
        for p in _samples(*line.coords):
            tot += 1
            hit += tru_u.distance(Point(p)) <= 300
    out['praezision'] = round(hit / max(tot, 1) * 100, 1)
    ops = [(o['kind'], N(o['at'])) for o in level.get('openings', [])]
    for kind, key, ok in (('door', 'tueren', ('door', 'opening')), ('window', 'fenster', ('window',))):
        want = [o for o in truth['openings'] if o['kind'] == kind]
        found = sum(any(k in ok and math.dist(p, o['at']) <= 600 for k, p in ops) for o in want)
        out[key] = round(found / len(want) * 100, 1) if want else 100.0
    rooms = level.get('rooms', [])
    out['raeume_ist'] = len(rooms)
    polys = [(Polygon([N(p) for p in r['polygon']]), r) for r in rooms if len(r.get('polygon', [])) >= 3]
    matched, errs = 0, []
    for tr in truth['rooms']:
        m = next((r for p, r in polys if p.is_valid and p.contains(Point(tr['point']))), None)
        if m:
            matched += 1
            errs.append(abs(m['area_m2'] - tr['area_m2']) / tr['area_m2'] * 100)
    out['raeume'] = round(matched / len(truth['rooms']) * 100, 1)
    out['flaeche'] = round(sum(errs) / len(errs), 1) if errs else None
    out['modell'] = len(level['walls']) >= 3 and len(rooms) >= 1
    out['brauchbar'] = out['modell'] and out['waende'] >= 80 and out['raeume'] >= 60 and out['mass'] <= 20
    return out


def run_prototype(path):
    sys.path.insert(0, os.path.normpath(os.path.join(ROOT, '..', '..', '..', 'ki', 'plan-raster')))
    from plan_raster.pipeline import extract as proto
    res = proto(path)
    return res['levels'][0]


def run_new(path, dims=None):
    from planextract.raster import extract_raster
    level, reason = extract_raster(path, dims=dims)
    return level


def evaluate(method, cases=None):
    data = load_truth()
    rows = []
    for case in data['cases']:
        if cases and case['file'] not in cases:
            continue
        truth = data['houses'][case['house']]
        path = os.path.join(FIX, case['file'])
        t = time.perf_counter()
        try:
            if method == 'prototyp':
                level = run_prototype(path)
            elif method == 'neu+masse':
                # Simulates the dimension reading (Gemini reads the labelled overall dimensions, never coordinates).
                level = run_new(path, dims={'width': truth['width'], 'depth': truth['depth']})
            else:
                level = run_new(path)
        except Exception as e:  # a crash counts as "no model"
            print(case['file'], 'Fehler:', type(e).__name__, e, file=sys.stderr)
            level = None
        r = score(level, truth)
        r.update(file=case['file'], style=case['style'], sekunden=round(time.perf_counter() - t, 2))
        rows.append(r)
    return rows


def pct(v):
    return 'n/a' if v is None else f'{v:.0f} %'


def markdown(rows, title):
    lines = [f'### {title}', '',
             '| Plan | Stil | Modell | brauchbar | Wände | Präzision | Türen | Fenster | Räume (ist/soll) | Maßfehler | Flächenfehler | Zeit |',
             '|---|---|:-:|:-:|--:|--:|--:|--:|--:|--:|--:|--:|']
    for r in rows:
        lines.append(f"| {r['file']} | {r['style']} | {'ja' if r['modell'] else 'nein'} | {'ja' if r['brauchbar'] else 'nein'} | {pct(r['waende'])} | {pct(r['praezision'])} | "
                     f"{pct(r['tueren'])} | {pct(r['fenster'])} | {pct(r['raeume'])} ({r['raeume_ist']}/{r['raeume_soll']}) | {pct(r['mass'])} | {pct(r['flaeche'])} | {r['sekunden']:.1f} s |")
    n = len(rows)
    avg = lambda k: sum(r[k] for r in rows) / n
    lines.append(f"| **Summe** | | **{sum(r['modell'] for r in rows)}/{n}** | **{sum(r['brauchbar'] for r in rows)}/{n}** | {avg('waende'):.0f} % | {avg('praezision'):.0f} % | "
                 f"{avg('tueren'):.0f} % | {avg('fenster'):.0f} % | {avg('raeume'):.0f} % | | | |")
    return '\n'.join(lines) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--method', default='neu', choices=['neu', 'neu+masse', 'prototyp'])
    ap.add_argument('--markdown')
    ap.add_argument('--json')
    ap.add_argument('cases', nargs='*')
    a = ap.parse_args()
    rows = evaluate(a.method, a.cases)
    md = markdown(rows, a.method)
    print(md)
    if a.markdown:
        with open(a.markdown, 'w', encoding='utf-8') as f:
            f.write(md)
    if a.json:
        with open(a.json, 'w', encoding='utf-8') as f:
            json.dump(rows, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
