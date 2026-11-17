"""Rooms from areas enclosed by walls (shapely), named from labels in the plan."""
import re
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

AREA = re.compile(r'(?<![\d.,])(\d{1,4}(?:[.,]\d{1,2})?)\s*(m²|m2|qm)(?!\w)', re.I)
# A label may contain a room number, e.g. "Büro 1" or "01 Büro". A pure
# number is still a dimension/identifier, never an inferred room name.
ROOM_WORD = re.compile(r'^(?=.{2,60}$)(?=.*[A-Za-zÄÖÜäöüß])[A-Za-zÄÖÜäöüß0-9 .\-/]+$')
NOT_NAME = re.compile(r'^(m²|m2|qm|ok|uk|fb|fbh|rh|brh|bh|lh|ff|rd|ld|m|cm|mm|eg|og|dg|kg|ug)$', re.I)
TECHNICAL_LABEL = re.compile(r'^(?:(?:brh|rh|lh|bh|ok|uk|fbh|ffb|rfb)\b|[\d.,+\-\s]+\s*(?:mm|cm|m)\b)', re.I)
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
    def enclosed(shape):
        return [Polygon(ring) for poly in getattr(shape, 'geoms', [shape])
                for ring in poly.interiors if Polygon(ring).area / 1e6 >= MIN_ROOM_M2]

    rooms = enclosed(union)
    # Drawing/scan rounding can leave a hairline gap where two wall bands meet.
    # Close at most 30 mm in the room topology only, never door-sized openings
    # and never the source walls. Use it only if it recovers enclosed rooms.
    tolerance = min(15.0, min(w['thickness'] for w in walls) * 0.1)
    repaired = union.buffer(tolerance, join_style='mitre').buffer(-tolerance, join_style='mitre')
    recovered = enclosed(repaired)
    gap_repaired = len(recovered) > len(rooms)
    if gap_repaired:
        union, rooms = repaired, recovered
    polys = list(getattr(union, 'geoms', [union]))
    outline = unary_union([Polygon(p.exterior) for p in polys])
    rooms.sort(key=lambda p: (-p.centroid.y, p.centroid.x))
    result = []
    for k, p in enumerate(rooms, 1):
        inside = [t for t in texts if p.contains(Point(t.at))]
        area_label = None
        names = []
        for t in inside:
            s = ' '.join(t.text.split())
            m = AREA.search(s)
            if m:
                value = float(m.group(1).replace(',', '.'))
                if value > 0:
                    area_label = value
                # PDF/OCR often combines the name and its area in one text item.
                s = AREA.sub('', s).strip(' ·:;-')
            if ROOM_WORD.match(s) and not NOT_NAME.match(s) and not TECHNICAL_LABEL.match(s):
                names.append((0 if KNOWN.search(s) else 1, -(t.height or 0), s))
        names.sort()
        name = names[0][2] if names else None
        rp = p.representative_point()
        result.append({'id': f'R{k}', 'name': name or f'Raum {k}', 'name_source': 'label' if name else 'default',
                       **({'boundary_repaired': True} if gap_repaired else {}),
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
