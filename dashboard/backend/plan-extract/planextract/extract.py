"""Deterministic plan measurement: file -> scaled primitives -> walls, openings, rooms (candidates with IDs)."""
import copy, os
from .primitives import Seg, Arc, Text, Insert, Dim
from .read_pdf import read_pdf
from .read_dxf import read_dxf, read_dwg, ConversionError
from .scale import determine_scale
from .detect import Detector, world, DOOR_HEIGHT, WINDOW_SILL, WINDOW_HEIGHT
from .rooms import find_rooms, attach_openings

MIN_WALLS = 3
DEFAULT_HEIGHT = 2500.0


def _scaled(plan, r):
    p = copy.copy(plan)
    s = lambda q: (q[0] * r, q[1] * r)
    p.segs = [Seg(s(x.a), s(x.b), x.layer, x.block, x.width) for x in plan.segs]
    p.arcs = [Arc(s(x.c), x.r * r, x.start, x.end, x.layer, x.block) for x in plan.arcs]
    p.texts = [Text(x.text, s(x.at), x.angle, x.height * r, x.layer) for x in plan.texts]
    p.inserts = [Insert(x.name, s(x.at), x.rotation, [s(c) for c in x.corners], x.layer) for x in plan.inserts]
    p.dims = [Dim(s(x.a), s(x.b), x.measured * r, x.label) for x in plan.dims]
    return p


def _extents(plan):
    pts = [p for s in plan.segs if not s.block for p in (s.a, s.b)]
    if not pts:
        return None
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return (max(xs) - min(xs), max(ys) - min(ys))


def measure(plan):
    """Returns (level dict, None) or (None, reason)."""
    if 'too_many_objects' in plan.notes or 'too_many_entities' in plan.notes:
        return None, 'too_complex'
    if len([s for s in plan.segs if not s.block]) < 8:
        return None, 'no_vectors'
    sc = determine_scale(plan, _extents(plan))
    if not sc['mm_per_unit']:
        return None, 'no_scale'
    mm = _scaled(plan, sc['mm_per_unit'])
    det = Detector(mm, sc['dim_segs'])
    raw = det.build()
    if len(raw) < MIN_WALLS:
        return None, 'no_walls'
    if 'raster' in plan.notes and (len(raw) < 8 or not any(w['openings'] for w in raw)):
        # Scanned page with a few vector lines (frame, title block): leave it to the image path.
        return None, 'raster_page'
    # Origin at the lower left of the walls.
    xs, ys = [], []
    for w in raw:
        for s in (w['s0'], w['s1']):
            for o in (-w['t'] / 2, w['t'] / 2):
                x, y = world(w, s, o)
                xs.append(x); ys.append(y)
    ox, oy = min(xs), min(ys)
    sh = lambda p: [round(p[0] - ox, 1), round(p[1] - oy, 1)]
    walls, openings = [], []
    for k, w in enumerate(raw, 1):
        wid = f'W{k}'
        walls.append({'id': wid, 'a': sh(world(w, w['s0'])), 'b': sh(world(w, w['s1'])), 'thickness': round(w['t'], 1),
                      'length': round(w['s1'] - w['s0'], 1)})
        for o in sorted(w['openings'], key=lambda o: o['s0']):
            door = o['kind'] in ('door', 'opening')
            openings.append({'id': f'O{len(openings) + 1}', 'kind': o['kind'], 'wall': wid, 'at': sh(world(w, (o['s0'] + o['s1']) / 2)),
                             'width': round(o['s1'] - o['s0'], 1), 'height': DOOR_HEIGHT if door else WINDOW_HEIGHT,
                             'sill': 0.0 if door else WINDOW_SILL, 'height_assumed': True, 'evidence': o['evidence']})
    texts = [Text(t.text, (t.at[0] - ox, t.at[1] - oy), t.angle, t.height, t.layer) for t in mm.texts]
    rooms, outline = find_rooms(walls, texts)
    attach_openings(rooms, walls, openings)
    width, depth = max(xs) - ox, max(ys) - oy
    boundary = [sh((x + ox, y + oy)) for x, y in list(outline.exterior.coords)[:-1]] if outline is not None and hasattr(outline, 'exterior') else []
    label_texts = [{'id': f'T{k}', 'text': t.text[:80], 'at': [round(t.at[0], 1), round(t.at[1], 1)]}
                   for k, t in enumerate(texts[:400], 1)
                   if -2000 <= t.at[0] <= width + 2000 and -2000 <= t.at[1] <= depth + 2000]
    level = {
        'source': {'kind': plan.kind, 'page': plan.page},
        'scale': {'mm_per_unit': sc['mm_per_unit'], 'method': sc['method'], 'ratio': sc['ratio'], 'evidence': sc['evidence'],
                  'support': sc['support']},
        'detection': det.mode,
        'width': round(width, 1), 'depth': round(depth, 1), 'boundary': boundary,
        'height': DEFAULT_HEIGHT, 'height_assumed': True, 'elevation': 0.0,
        'walls': walls, 'openings': openings, 'rooms': rooms, 'texts': label_texts,
        'warnings': sc['warnings'] + det.notes,
    }
    return level, None


def read_any(path, kind, workdir):
    if kind == 'pdf':
        return read_pdf(path)
    if kind == 'dxf':
        return [read_dxf(path)]
    if kind == 'dwg':
        return [read_dwg(path, workdir)]
    raise ValueError('unsupported')


def extract(inputs, workdir):
    """inputs: [(path, kind)] -> {'levels': [...], 'skipped': [...]}"""
    levels, skipped = [], []
    for index, (path, kind) in enumerate(inputs):
        try:
            plans = read_any(path, kind, workdir)
        except ConversionError as e:
            skipped.append({'input': index, 'reason': str(e)})
            continue
        except Exception:
            skipped.append({'input': index, 'reason': 'unreadable'})
            continue
        for plan in plans:
            try:
                level, reason = measure(plan)
            except Exception:
                level, reason = None, 'detection_failed'
            if level:
                level['source']['input'] = index
                levels.append(level)
            else:
                skipped.append({'input': index, 'page': plan.page, 'reason': reason})
    names = ['EG', '1. OG', '2. OG', '3. OG']
    for i, l in enumerate(levels[:4]):
        l['name'] = names[i]
        l['elevation'] = i * (DEFAULT_HEIGHT + 200.0)
    return {'version': 1, 'levels': levels[:4], 'skipped': skipped}
