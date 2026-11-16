"""Applies the (optional) AI review to the measured candidates, writes IFC, preview and quality report."""
import copy, math, re
from shapely.geometry import LineString, Point, Polygon
from .primitives import Text
from .rooms import find_rooms, attach_openings
from .ifc_writer import write_ifc
from .preview import render

MAX_REJECTED_SHARE = 0.3
NAME = re.compile(r'^[^\x00-\x1f]{1,60}$')


def _num(v, lo, hi):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and lo <= v <= hi


def _rehost(o, walls):
    """Nearest parallel wall whose band can take the opening."""
    best = None
    for w in walls:
        line = LineString([w['a'], w['b']])
        d = line.distance(Point(o['at']))
        if d <= w['thickness'] / 2 + 200 and line.length >= o['width'] and (best is None or d < best[0]):
            best = (d, w)
    if not best:
        return None
    w = best[1]
    line = LineString([w['a'], w['b']])
    s = min(max(line.project(Point(o['at'])), o['width'] / 2), line.length - o['width'] / 2)
    p = line.interpolate(s)
    return {**o, 'wall': w['id'], 'at': [round(p.x, 1), round(p.y, 1)]}


def apply_dimensions(level, review, warnings):
    """Photo/scan levels: overall dimensions read from the plan text (by the reviewer, values only, never coordinates)
    replace the estimated scale. Width and depth must agree; out-of-range values are ignored."""
    from .raster import rescale
    read = {k: review.get(f'overall_{k}_mm') for k in ('width', 'depth')}
    factors = {k: v / level[k] for k, v in read.items() if _num(v, 1500, 100000) and level.get(k)}
    if not factors:
        return
    if len(factors) == 2 and abs(factors['width'] / factors['depth'] - 1) > 0.15:
        k = min(factors, key=lambda k: abs(math.log(factors[k])))
        warnings.append(f'{level["name"]}: abgelesene Gesamtmaße passen nicht zum Grundriss; nur die {"Breite" if k == "width" else "Tiefe"} verwendet.')
        factors = {k: factors[k]}
    f = sum(factors.values()) / len(factors)
    if not 0.2 <= f <= 5:
        warnings.append(f'{level["name"]}: abgelesenes Gesamtmaß unplausibel – Maßstab bleibt geschätzt.')
        return
    rescale(level, f)
    ev = []
    for k, v in read.items():
        if k in factors:
            ev.append({'label': f'{v / 1000:.2f} m'.replace('.', ','), 'value_mm': round(v, 1), 'measured_mm': level[k],
                       'error_pct': round(abs(level[k] - v) / v * 100, 2)})
    level['scale'].update({'method': 'Gesamtmaße aus dem Plan', 'estimated': False, 'evidence': ev, 'support': len(ev)})
    level['warnings'] = [w for w in level.get('warnings', []) if not w.startswith('Maßstab geschätzt')]


def apply_review(level, review, warnings):
    """review uses candidate IDs only; unknown IDs or values out of range are ignored."""
    level = copy.deepcopy(level)
    if not review:
        return level
    if level.get('source', {}).get('kind') == 'raster' and level['scale'].get('estimated'):
        apply_dimensions(level, review, warnings)
    ids = {w['id'] for w in level['walls']}
    rejected = {c['id'] for c in review.get('walls', []) if isinstance(c, dict) and c.get('id') in ids and c.get('is_wall') is False}
    if rejected and len(rejected) <= MAX_REJECTED_SHARE * len(ids) and len(ids) - len(rejected) >= 3:
        old_rooms = level['rooms']
        level['walls'] = [w for w in level['walls'] if w['id'] not in rejected]
        kept, lost = [], 0
        for o in level['openings']:
            if o['wall'] in rejected:
                o = _rehost(o, level['walls'])
                if not o:
                    lost += 1
                    continue
            kept.append(o)
        level['openings'] = kept
        texts = [Text(t['text'], tuple(t['at'])) for t in level.get('texts', [])]
        rooms, outline = find_rooms(level['walls'], texts)
        for r in rooms:
            prev = next((o for o in old_rooms if Polygon(r['polygon']).contains(Point(o['point']))), None)
            if prev:
                r['name'], r['name_source'], r['id'] = prev['name'], prev['name_source'], prev['id']
        level['rooms'] = rooms
        if outline is not None and hasattr(outline, 'exterior'):
            level['boundary'] = [[round(x, 1), round(y, 1)] for x, y in list(outline.exterior.coords)[:-1]]
        warnings.append(f'{level["name"]}: KI-Prüfung hat {len(rejected)} Linienpaar(e) als Nicht-Wand verworfen.' + (f' {lost} Öffnung(en) ohne Wand entfallen.' if lost else ''))
    elif rejected:
        warnings.append(f'{level["name"]}: KI wollte {len(rejected)} von {len(ids)} Wänden verwerfen – ignoriert, Geometrie bleibt erhalten.')
    by_id = {o['id']: o for o in level['openings']}
    for c in review.get('openings', []):
        o = by_id.get(c.get('id')) if isinstance(c, dict) else None
        if not o:
            continue
        if c.get('kind') in ('door', 'window', 'opening') and c['kind'] != o['kind']:
            o['kind'] = c['kind']
            o['evidence'] = (o.get('evidence') or '') + '+ki'
            if c['kind'] == 'door':
                o['sill'], o['height'] = 0.0, 2010.0
            elif c['kind'] == 'window' and o['sill'] == 0:
                o['sill'], o['height'] = 900.0, 1350.0
        if _num(c.get('height'), 300, 3500):
            o['height'] = float(c['height'])
            o['height_assumed'] = False
        if o['kind'] == 'window' and _num(c.get('sill'), 0, 2500):
            o['sill'] = float(c['sill'])
    rooms = {r['id']: r for r in level['rooms']}
    for c in review.get('rooms', []):
        r = rooms.get(c.get('id')) if isinstance(c, dict) else None
        name = c.get('name') if isinstance(c, dict) else None
        if r and isinstance(name, str) and NAME.match(name.strip()) and r['name_source'] != 'label':
            r['name'] = name.strip()
            r['name_source'] = 'ki'
    if _num(review.get('storey_height'), 2000, 6000):
        level['height'] = float(review['storey_height'])
        level['height_assumed'] = False
    return level


def _exterior_walls(level):
    if not level.get('boundary'):
        return set()
    ring = Polygon(level['boundary']).exterior
    return {w['id'] for w in level['walls'] if LineString([w['a'], w['b']]).distance(ring) <= w['thickness'] / 2 + 20}


def report(level):
    attach_openings(level['rooms'], level['walls'], level['openings'])
    for o in level['openings']:
        if o['height'] + o['sill'] > level['height']:
            o['height'] = max(300.0, level['height'] - o['sill'])
    ev = level['scale']['evidence']
    errors = [e['error_pct'] for e in ev]
    areas = [{'room': r['name'], 'measured_m2': r['area_m2'], 'labelled_m2': r['labelled_area_m2'],
              'error_pct': round(abs(r['area_m2'] - r['labelled_area_m2']) / r['labelled_area_m2'] * 100, 2)}
             for r in level['rooms'] if r.get('labelled_area_m2')]
    kinds = [o['kind'] for o in level['openings']]
    no_door = [r['name'] for r in level['rooms'] if r['doors'] == 0]
    rep = {
        'level': level['name'], 'source': level.get('source', {}).get('kind'),
        'scale': {'method': level['scale']['method'], 'ratio': level['scale']['ratio'], 'support': level['scale']['support'],
                  'estimated': bool(level['scale'].get('estimated'))},
        'width_mm': level['width'], 'depth_mm': level['depth'],
        'walls': len(level['walls']), 'doors': kinds.count('door'), 'windows': kinds.count('window'), 'openings_unclear': kinds.count('opening'),
        'rooms': len(level['rooms']), 'rooms_without_door': no_door,
        'dimensions': ev[:40], 'dimension_max_error_pct': max(errors) if errors else None,
        'dimension_mean_error_pct': round(sum(errors) / len(errors), 2) if errors else None,
        'room_areas': areas, 'heights_assumed': level['height_assumed'] or any(o['height_assumed'] for o in level['openings']),
    }
    good = rep['source'] != 'raster' and rep['dimension_max_error_pct'] is not None and rep['dimension_max_error_pct'] <= 2 and len(ev) >= 3 and not no_door and rep['rooms'] > 0
    rep['grade'] = 'gut' if good else 'prüfen'
    return rep


def summary_lines(reports):
    out = []
    for r in reports:
        sc = r['scale']
        scale = f"1:{sc['ratio']:g}" if sc['ratio'] else {'units': 'DXF-Einheit', 'units+dimensions': 'DXF-Einheit, durch Maße bestätigt'}.get(sc['method'], 'aus Maßketten')
        size = f"{r['width_mm'] / 1000:.2f} × {r['depth_mm'] / 1000:.2f} m".replace('.', ',')
        counts = f"{r['walls']} Wände, {r['doors']} Türen, {r['windows']} Fenster, {r['rooms']} Räume."
        if r.get('source') == 'raster':
            out.append(f"{r['level']}: aus Foto/Scan erkannt, {size}, {counts}")
            out.append(f"{r['level']}: Maßstab {sc['method']}." + (' Maße sind ungefähr – bitte prüfen oder eine bekannte Strecke angeben.' if sc.get('estimated') else ''))
        else:
            out.append(f"{r['level']}: vermessen ({scale}), {size}, {counts}")
        if r.get('source') == 'raster':
            pass  # no dimension chain check for photos; the scale line above says how the size was found
        elif r['dimension_max_error_pct'] is not None:
            pct = f"{r['dimension_max_error_pct']:.1f}".replace('.', ',')
            out.append(f"{r['level']}: {len(r['dimensions'])} Planmaße geprüft, größte Abweichung {pct} %.")
        else:
            out.append(f"{r['level']}: keine Maßzahlen zum Gegenprüfen gefunden – Maße bitte kontrollieren.")
        if r['rooms_without_door']:
            out.append(f"{r['level']}: Räume ohne erkannte Tür: {', '.join(r['rooms_without_door'][:8])}.")
        if r['openings_unclear']:
            out.append(f"{r['level']}: {r['openings_unclear']} Wandöffnung(en) ohne eindeutiges Tür-/Fenstersymbol als Durchgang modelliert.")
        if r['heights_assumed']:
            out.append(f"{r['level']}: Höhen teilweise angenommen (Geschoss 2,50 m, Türen 2,01 m, Fenster Brüstung 0,90 m / Höhe 1,35 m).")
    return out


def _normalise_origin(level):
    """Moves the geometry so the lower left outer corner is (0, 0); keeps the photo overlay in place."""
    xs = [c for w in level['walls'] for c in (w['a'][0] - w['thickness'] / 2, w['b'][0] - w['thickness'] / 2, w['a'][0] + w['thickness'] / 2, w['b'][0] + w['thickness'] / 2)]
    ys = [c for w in level['walls'] for c in (w['a'][1] - w['thickness'] / 2, w['b'][1] - w['thickness'] / 2, w['a'][1] + w['thickness'] / 2, w['b'][1] + w['thickness'] / 2)]
    dx, dy = min(xs), min(ys)
    move = lambda p: [round(p[0] - dx, 1), round(p[1] - dy, 1)]
    for w in level['walls']:
        w['a'], w['b'] = move(w['a']), move(w['b'])
    for o in level['openings']:
        o['at'] = move(o['at'])
    for r in level.get('room_names', []):
        r['point'] = move(r['point'])
    level['width'], level['depth'] = round(max(xs) - dx, 1), round(max(ys) - dy, 1)
    ras = level.get('raster')
    if ras and ras.get('mm_per_px'):
        ras['origin_px'] = [round(ras['origin_px'][0] + dx / ras['mm_per_px'], 2), round(ras['origin_px'][1] - dy / ras['mm_per_px'], 2)]


def apply_edits(level, warnings):
    """A level corrected by the user in the editor: optional known distance (scale), openings re-hosted on the edited
    walls, rooms recomputed from the walls and named from the user's labels."""
    from .raster import rescale
    level = copy.deepcopy(level)
    for w in level['walls']:
        w['length'] = round(math.dist(w['a'], w['b']), 1)
    ref = level.pop('reference', None)
    if ref:
        d = math.dist(ref['a'], ref['b'])
        if d > 50 and _num(ref.get('mm'), 100, 200000):
            f = ref['mm'] / d
            level.setdefault('rooms', [])
            rescale(level, f)
            for r in level.get('room_names', []):
                r['point'] = [r['point'][0] * f, r['point'][1] * f]
            label = f"{ref['mm'] / 1000:.2f} m".replace('.', ',')
            level['scale'].update({'method': 'Strecke vom Nutzer', 'estimated': False, 'support': 1,
                                   'evidence': [{'label': label, 'value_mm': ref['mm'], 'measured_mm': ref['mm'], 'error_pct': 0.0}]})
            level['warnings'] = [w for w in level.get('warnings', []) if not w.startswith('Maßstab geschätzt')]
    kept, lost = [], 0
    for o in level['openings']:
        h = _rehost(o, level['walls'])
        if h:
            kept.append(h)
        else:
            lost += 1
    level['openings'] = [{**o, 'id': f'O{k}'} for k, o in enumerate(kept, 1)]
    if lost:
        warnings.append(f'{level["name"]}: {lost} Öffnung(en) ohne passende Wand entfallen.')
    _normalise_origin(level)
    rooms, outline = find_rooms(level['walls'], [])
    names = level.pop('room_names', [])
    for r in rooms:
        poly = Polygon(r['polygon'])
        hit = next((n for n in names if poly.contains(Point(n['point']))), None)
        if hit:
            r['name'], r['name_source'] = hit['name'], 'user'
    level['rooms'] = rooms
    level['boundary'] = [[round(x, 1), round(y, 1)] for x, y in list(outline.exterior.coords)[:-1]] if outline is not None and hasattr(outline, 'exterior') else []
    level['warnings'] = [w for w in level.get('warnings', []) if not w.startswith('Außenwand nicht vollständig')] + ['Von Hand korrigiert.']
    return level


def final_levels(levels):
    """Geometry after review/edits, for the correction editor (JSON-safe)."""
    keep = ('name', 'source', 'scale', 'width', 'depth', 'height', 'height_assumed', 'elevation', 'walls', 'openings', 'raster')
    out = []
    for l in levels:
        lv = {k: copy.deepcopy(l[k]) for k in keep if k in l}
        lv['rooms'] = [{k: r[k] for k in ('id', 'name', 'name_source', 'area_m2', 'point', 'polygon')} for r in l['rooms']]
        out.append(lv)
    return out


def build(candidates, review, ifc_path, preview_path):
    warnings = []
    levels = []
    reviews = (review or {}).get('levels', [])
    for i, level in enumerate(candidates['levels']):
        if level.get('edited'):
            lv = apply_edits(level, warnings)
        else:
            r = reviews[i] if i < len(reviews) and isinstance(reviews[i], dict) else None
            lv = apply_review(level, r, warnings)
        lv['exterior_walls'] = _exterior_walls(lv)
        levels.append(lv)
    reports = [report(l) for l in levels]
    write_ifc(levels, ifc_path)
    render(levels, preview_path)
    for l in levels:
        warnings += [w for w in l.get('warnings', [])]
    return {'version': 1, 'quality': {'levels': reports, 'grade': 'gut' if all(r['grade'] == 'gut' for r in reports) else 'prüfen'},
            'summary': summary_lines(reports), 'warnings': warnings[:20], 'levels': final_levels(levels)}
