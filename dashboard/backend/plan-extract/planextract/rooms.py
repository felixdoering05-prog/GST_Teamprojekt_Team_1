"""Rooms from areas enclosed by walls (shapely), named from labels in the plan."""
import re
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

AREA = re.compile(r'(\d{1,4}[.,]\d{1,2})\s*(m²|m2|qm)', re.I)
ROOM_WORD = re.compile(r'^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß .\-/]{1,40}$')
NOT_NAME = re.compile(r'^(m²|m2|qm|ok|uk|fb|fbh|rh|brh|bh|lh|ff|rd|ld|m|cm|mm|eg|og|dg|kg|ug)$', re.I)
KNOWN = re.compile(r'wohn|ess|küche|kueche|koch|bad|wc|dusch|schlaf|kind|arbeit|büro|buero|flur|diele|gang|abstell|hwr|hauswirt|technik|'
                   r'keller|garage|zimmer|raum|eltern|gäste|gaeste|ankleide|speis|vorrat|terrasse|balkon|loggia|treppe|windfang|lager|'
                   r'living|kitchen|bath|bed|office|hall|storage', re.I)
MIN_ROOM_M2 = 1.0


def wall_polygon(walls):
    parts = []
    for w in walls:
        a = (w['a'][0], w['a'][1]); b = (w['b'][0], w['b'][1])
        parts.append(LineString([a, b]).buffer(w['thickness'] / 2, cap_style='square', join_style='mitre'))
    return unary_union(parts) if parts else None


def find_rooms(walls, texts):
    """walls: [{'id','a','b','thickness'}], texts: [Text in mm]. Returns (rooms, outline polygon)."""
    union = wall_polygon(walls)
    if union is None or union.is_empty:
        return [], None
    polys = list(getattr(union, 'geoms', [union]))
    rooms = []
    for poly in polys:
        for ring in poly.interiors:
            p = Polygon(ring)
            if p.area / 1e6 < MIN_ROOM_M2:
                continue
            rooms.append(p)
    outline = unary_union([Polygon(p.exterior) for p in polys])
    rooms.sort(key=lambda p: (-p.centroid.y, p.centroid.x))
    result = []
    for k, p in enumerate(rooms, 1):
        inside = [t for t in texts if p.contains(Point(t.at))]
        area_label = None
        names = []
        for t in inside:
            m = AREA.search(t.text)
            if m:
                area_label = float(m.group(1).replace(',', '.'))
                continue
            s = t.text.strip()
            if ROOM_WORD.match(s) and not NOT_NAME.match(s):
                names.append((0 if KNOWN.search(s) else 1, -(t.height or 0), s))
        names.sort()
        name = names[0][2] if names else None
        rp = p.representative_point()
        result.append({'id': f'R{k}', 'name': name or f'Raum {k}', 'name_source': 'label' if name else 'default',
                       'area_m2': round(p.area / 1e6, 2), 'labelled_area_m2': area_label,
                       'point': [round(rp.x, 1), round(rp.y, 1)],
                       'polygon': [[round(x, 1), round(y, 1)] for x, y in list(p.exterior.coords)[:-1]],
                       'texts': [t.text for t in inside][:8]})
    return result, outline


def attach_openings(rooms, walls, openings):
    """Counts doors/windows per room: an opening belongs to every room whose boundary touches its wall section."""
    by_id = {w['id']: w for w in walls}
    shapes = [(r, Polygon(r['polygon'])) for r in rooms]
    for r in rooms:
        r['doors'] = 0
        r['windows'] = 0
    for o in openings:
        w = by_id.get(o['wall'])
        if not w:
            continue
        pt = Point(o['at'])
        for r, poly in shapes:
            if poly.exterior.distance(pt) <= w['thickness'] / 2 + 40:
                if o['kind'] in ('door', 'opening'):
                    r['doors'] += 1
                elif o['kind'] == 'window':
                    r['windows'] += 1
