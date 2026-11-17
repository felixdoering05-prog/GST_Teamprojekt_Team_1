"""IFC4 from measured candidates with IfcOpenShell (LGPL): storeys, walls with real thickness and material layers, openings,
doors and windows with frame/glass/leaf, floor slabs, a roof (flat with parapet, gable or shed) and spaces.
Every visible part carries a surface colour so viewers show a realistic draft."""
import math, re
import numpy as np
import ifcopenshell, ifcopenshell.api

SLAB = 0.2
ROOF_SLAB = 0.25
PARAPET = 0.4
OVERHANG = 0.4

# Typical, deliberately calm colours of a draft model.
COLOURS = {
    'wall_ext': ((0.93, 0.91, 0.86), 0.0), 'wall_int': ((0.97, 0.97, 0.95), 0.0), 'slab': ((0.72, 0.72, 0.70), 0.0),
    'roof': ((0.27, 0.29, 0.32), 0.0), 'roof_edge': ((0.58, 0.60, 0.62), 0.0), 'glass': ((0.62, 0.80, 0.92), 0.55),
    'frame': ((0.96, 0.96, 0.96), 0.0), 'sill': ((0.80, 0.80, 0.78), 0.0), 'door': ((0.63, 0.46, 0.31), 0.0),
    'metal': ((0.55, 0.56, 0.58), 0.0), 'terrain': ((0.55, 0.68, 0.42), 0.0), 'stair': ((0.78, 0.76, 0.72), 0.0),
    'railing': ((0.35, 0.36, 0.38), 0.0), 'wood_light': ((0.80, 0.68, 0.52), 0.0), 'fabric': ((0.52, 0.56, 0.62), 0.0),
    'white': ((0.96, 0.96, 0.95), 0.0), 'ceramic': ((0.98, 0.98, 0.98), 0.0),
}
STYLE_NAMES = {'wall_ext': 'Außenputz', 'wall_int': 'Innenputz', 'slab': 'Beton', 'roof': 'Dach', 'roof_edge': 'Attikablech',
               'glass': 'Glas', 'frame': 'Fensterrahmen', 'sill': 'Fensterbank', 'door': 'Holz', 'metal': 'Metall',
               'terrain': 'Rasen', 'stair': 'Treppe', 'railing': 'Geländer', 'wood_light': 'Holz hell', 'fabric': 'Stoff', 'white': 'Weiß',
               'ceramic': 'Keramik'}


class Builder:
    def __init__(self, name):
        f = self.f = ifcopenshell.api.run('project.create_file', version='IFC4')
        self.project = ifcopenshell.api.run('root.create_entity', f, ifc_class='IfcProject', name=name)
        ifcopenshell.api.run('unit.assign_unit', f, length={'is_metric': True, 'raw': 'METERS'}, area={'is_metric': True, 'raw': 'SQUARE_METERS'},
                             volume={'is_metric': True, 'raw': 'CUBIC_METERS'})
        model = ifcopenshell.api.run('context.add_context', f, context_type='Model')
        self.body = ifcopenshell.api.run('context.add_context', f, context_type='Model', context_identifier='Body', target_view='MODEL_VIEW', parent=model)
        self.site = self.entity('IfcSite', 'Grundstück')
        self.building = self.entity('IfcBuilding', name)
        ifcopenshell.api.run('aggregate.assign_object', f, products=[self.site], relating_object=self.project)
        ifcopenshell.api.run('aggregate.assign_object', f, products=[self.building], relating_object=self.site)
        self.styles, self.materials = {}, {}
        self.colours = dict(COLOURS)

    def entity(self, cls, name, predefined=None, placement=None):
        e = ifcopenshell.api.run('root.create_entity', self.f, ifc_class=cls, name=name, predefined_type=predefined)
        m = np.eye(4)
        if placement is not None:
            (x, y, z), d = placement
            m[:3, 0] = [d[0], d[1], 0]; m[:3, 1] = [-d[1], d[0], 0]; m[:3, 3] = [x, y, z]
        ifcopenshell.api.run('geometry.edit_object_placement', self.f, product=e, matrix=m)
        return e

    # ---------------------------------------------------------------- appearance
    def style(self, key):
        """Named surface colour (RGB 0..1, transparency 0..1), created once."""
        if key not in self.styles:
            rgb, transparency = self.colours[key]
            st = ifcopenshell.api.run('style.add_style', self.f, name=STYLE_NAMES.get(key, key))
            ifcopenshell.api.run('style.add_surface_style', self.f, style=st, ifc_class='IfcSurfaceStyleShading',
                                 attributes={'SurfaceColour': {'Name': None, 'Red': rgb[0], 'Green': rgb[1], 'Blue': rgb[2]}, 'Transparency': transparency})
            self.styles[key] = st
        return self.styles[key]

    def material(self, name, category=None):
        if name not in self.materials:
            self.materials[name] = ifcopenshell.api.run('material.add_material', self.f, name=name, category=category)
        return self.materials[name]

    def assign_material(self, products, name, category=None):
        ifcopenshell.api.run('material.assign_material', self.f, products=products, type='IfcMaterial', material=self.material(name, category))

    # ---------------------------------------------------------------- geometry
    def extrusion(self, profile, height, origin=(0., 0., 0.), axis=None, ref=None):
        f = self.f
        place = f.createIfcAxis2Placement3D(f.createIfcCartesianPoint(tuple(float(v) for v in origin)),
                                            f.createIfcDirection(axis) if axis else None, f.createIfcDirection(ref) if ref else None)
        return f.createIfcExtrudedAreaSolid(profile, place, f.createIfcDirection((0., 0., 1.)), float(max(height, 0.005)))

    def rect_profile(self, w, d, cx=0., cy=0.):
        f = self.f
        return f.createIfcRectangleProfileDef('AREA', None, f.createIfcAxis2Placement2D(f.createIfcCartesianPoint((float(cx), float(cy)))), float(max(w, 0.005)), float(max(d, 0.005)))

    def poly_profile(self, points, holes=()):
        f = self.f
        def curve(pts):
            c = [f.createIfcCartesianPoint((float(x), float(y))) for x, y in pts]
            return f.createIfcPolyline(c + [c[0]])
        if holes:
            return f.createIfcArbitraryProfileDefWithVoids('AREA', None, curve(points), [curve(h) for h in holes])
        return f.createIfcArbitraryClosedProfileDef('AREA', None, curve(points))

    def box(self, cx, cy, z, w, d, h):
        """Box item in the element's local system: centred on (cx, cy), from z up by h."""
        return self.extrusion(self.rect_profile(w, d, cx, cy), h, (0., 0., z))

    def show(self, e, items):
        """items: [(solid, style key)] -> one body representation with a colour per item."""
        f = self.f
        rep = f.createIfcShapeRepresentation(self.body, 'Body', 'SweptSolid', [i for i, _ in items])
        for item, key in items:
            ifcopenshell.api.run('style.assign_item_style', f, item=item, style=self.style(key))
        ifcopenshell.api.run('geometry.assign_representation', f, product=e, representation=rep)

    def rect(self, e, w, d, h, style=None):
        item = self.extrusion(self.rect_profile(w, d), h)
        self.show(e, [(item, style)]) if style else self._plain(e, item)

    def poly(self, e, points, h, style=None):
        item = self.extrusion(self.poly_profile(points), h)
        self.show(e, [(item, style)]) if style else self._plain(e, item)

    def _plain(self, e, item):
        rep = self.f.createIfcShapeRepresentation(self.body, 'Body', 'SweptSolid', [item])
        ifcopenshell.api.run('geometry.assign_representation', self.f, product=e, representation=rep)


def _m(v):
    return v / 1000.0


def _wall_layers(t_mm, external):
    """Plausible layer build-up that adds up to the measured thickness (assumption, named as such)."""
    if external and t_mm >= 300:
        ins = min(160.0, round(t_mm * 0.4 / 10) * 10)
        return [('Innenputz', 15.0), ('Mauerwerk', t_mm - 35.0 - ins), ('Wärmedämmung', ins), ('Außenputz', 20.0)]
    if t_mm >= 60:
        return [('Putz', 10.0), ('Mauerwerk' if t_mm >= 100 else 'Trockenbau', t_mm - 20.0), ('Putz', 10.0)]
    return [('Trockenbau', t_mm)]


def _window(b, width, height, t):
    """Frame, glazing (with mullion above 1.2 m) and a sill through the reveal; local x along the wall, y across."""
    fw, fd = 0.06, 0.07
    items = [(b.box(-width / 2 + fw / 2, 0, 0, fw, fd, height), 'frame'), (b.box(width / 2 - fw / 2, 0, 0, fw, fd, height), 'frame'),
             (b.box(0, 0, 0, width, fd, fw), 'frame'), (b.box(0, 0, height - fw, width, fd, fw), 'frame')]
    panes = [(-width / 2 + fw, width / 2 - fw)]
    if width > 1.2:
        items.append((b.box(0, 0, fw, fw, fd, height - 2 * fw), 'frame'))
        panes = [(-width / 2 + fw, -fw / 2), (fw / 2, width / 2 - fw)]
    for x0, x1 in panes:
        items.append((b.box((x0 + x1) / 2, 0, fw, x1 - x0, 0.024, height - 2 * fw), 'glass'))
    items.append((b.box(0, 0, -0.03, width + 0.06, t + 0.08, 0.03), 'sill'))
    return items


def _door(b, width, height, t):
    """Frame (Zarge) through the reveal, door leaf and handle."""
    zw = 0.05
    leaf_w = max(width - 2 * zw, 0.3)
    return [(b.box(-width / 2 + zw / 2, 0, 0, zw, t + 0.02, height), 'frame'), (b.box(width / 2 - zw / 2, 0, 0, zw, t + 0.02, height), 'frame'),
            (b.box(0, 0, height - zw, width, t + 0.02, zw), 'frame'),
            (b.box(0, 0, 0.01, leaf_w, 0.04, height - zw - 0.01), 'door'),
            (b.box(leaf_w / 2 - 0.12, 0.04, 1.02, 0.12, 0.02, 0.025), 'metal'), (b.box(leaf_w / 2 - 0.12, -0.04, 1.02, 0.12, 0.02, 0.025), 'metal')]


def _roof_spec(roof):
    roof = roof if isinstance(roof, dict) else {}
    kind = roof.get('type') if roof.get('type') in ('flat', 'gable', 'shed') else 'flat'
    pitch = roof.get('pitch') if isinstance(roof.get('pitch'), (int, float)) and 5 <= roof.get('pitch') <= 60 else (35 if kind == 'gable' else 10)
    ridge = roof.get('ridge') if roof.get('ridge') in ('long', 'short') else 'long'
    return kind, float(pitch), ridge


def _add_roof(b, storey, level, roof, warnings):
    """Roof over the top storey: flat roof with parapet over the outline, or gable/shed roof over the bounding rectangle."""
    from shapely.geometry import Polygon
    pts = [(_m(x), _m(y)) for x, y in level.get('boundary') or []]
    if len(pts) < 3:
        return None
    outline = Polygon(pts)
    if not outline.is_valid:
        outline = outline.buffer(0)
        if outline.geom_type == 'MultiPolygon':
            outline = max(outline.geoms, key=lambda g: g.area)
    if outline.is_empty or outline.geom_type != 'Polygon' or outline.area < 1:
        return None
    pts = [(round(x, 4), round(y, 4)) for x, y in list(outline.simplify(0.02).exterior.coords)[:-1]]
    kind, pitch, ridge = _roof_spec(roof)
    z = _m(level['elevation']) + _m(level['height'])
    e = b.entity('IfcRoof', {'flat': 'Flachdach', 'gable': 'Satteldach', 'shed': 'Pultdach'}[kind] + ' (Entwurf)',
                 {'flat': 'FLAT_ROOF', 'gable': 'GABLE_ROOF', 'shed': 'SHED_ROOF'}[kind], ((0., 0., 0.), (1., 0.)))
    if kind == 'flat':
        inner = outline.buffer(-0.24, join_style=2)
        items = [(b.extrusion(b.poly_profile(pts), ROOF_SLAB, (0., 0., z)), 'roof')]
        if not inner.is_empty and inner.geom_type == 'Polygon':
            ring = list(inner.exterior.coords)[:-1]
            items.append((b.extrusion(b.poly_profile(pts, [ring]), PARAPET, (0., 0., z + ROOF_SLAB)), 'wall_ext'))
            items.append((b.extrusion(b.poly_profile(pts, [ring]), 0.03, (0., 0., z + ROOF_SLAB + PARAPET)), 'roof_edge'))
        b.show(e, items)
    else:
        x0, y0, x1, y1 = outline.bounds
        along_x = (x1 - x0 >= y1 - y0) == (ridge == 'long')
        L, W = (x1 - x0, y1 - y0) if along_x else (y1 - y0, x1 - x0)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        tp, o, th = math.tan(math.radians(pitch)), OVERHANG, ROOF_SLAB
        # Profile plane: u across the ridge, v up; extruded along the ridge.
        axis, ref = ((1., 0., 0.), (0., 1., 0.)) if along_x else ((0., 1., 0.), (-1., 0., 0.))
        start = (x0 - o, cy, z) if along_x else (cx, y0 - o, z)
        start_gable = (x0, cy, z) if along_x else (cx, y0, z)
        b_ = W / 2 + o
        if kind == 'gable':
            hb = b_ * tp
            drop = o * tp - th            # underside meets the wall top at the eaves line
            skin = [(-b_, -drop), (0, hb - drop), (b_, -drop), (b_, -drop - th), (0, hb - drop - th), (-b_, -drop - th)]
            gable = [(-W / 2, 0.), (W / 2, 0.), (0., W / 2 * tp)]
        else:
            v = lambda u: (u + W / 2) * tp
            skin = [(-b_, v(-b_) - th), (b_, v(b_) - th), (b_, v(b_)), (-b_, v(-b_))]
            skin = [(u, y + th - 0.0) for u, y in skin]
            gable = [(-W / 2, 0.), (W / 2, 0.), (W / 2, W * tp)]
        b.show(e, [(b.extrusion(b.poly_profile(skin), L + 2 * o, start, axis, ref), 'roof'),
                   (b.extrusion(b.poly_profile(gable), L, start_gable, axis, ref), 'wall_ext')])
        if outline.area < 0.9 * (x1 - x0) * (y1 - y0):
            warnings.append(f'Dach als {"Satteldach" if kind == "gable" else "Pultdach"} über das umschließende Rechteck gelegt; Grundriss ist nicht rechteckig.')
    ps = ifcopenshell.api.run('pset.add_pset', b.f, product=e, name='Pset_RoofCommon')
    ifcopenshell.api.run('pset.edit_pset', b.f, pset=ps, properties={'Reference': f'{kind} {pitch:g}°' if kind != 'flat' else 'Flachdach mit Attika'})
    b.assign_material([e], 'Dachabdichtung' if kind == 'flat' else 'Dachziegel', 'roofing')
    return e


APPEARANCE_KEYS = {'facade': 'wall_ext', 'roof': 'roof', 'frame': 'frame', 'door': 'door'}


def _hex(v):
    if isinstance(v, str) and len(v) == 7 and v[0] == '#':
        try:
            return tuple(int(v[i:i + 2], 16) / 255 for i in (1, 3, 5))
        except ValueError:
            return None
    return None


def _apply_appearance(b, appearance):
    """Colours chosen in the app or read from building photos: {'facade': '#rrggbb', 'roof': …, 'frame': …, 'door': …}."""
    if not isinstance(appearance, dict):
        return
    for k, style in APPEARANCE_KEYS.items():
        rgb = _hex(appearance.get(k))
        if rgb:
            b.colours[style] = (rgb, b.colours[style][1])
            if k == 'facade':
                b.colours['roof_edge'] = b.colours['roof_edge']


STAIR_ROOM = re.compile(r'trepp|\btrh\b|stair|stiege', re.I)


def _room_frame(polygon_m):
    """Oriented rectangle of a room: centre, unit vector along the long side, long and short length."""
    from shapely.geometry import Polygon
    poly = Polygon(polygon_m)
    if not poly.is_valid:
        poly = poly.buffer(0)
    if poly.is_empty or poly.geom_type != 'Polygon':
        return None
    rect = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
    e1 = np.subtract(rect[1], rect[0]); e2 = np.subtract(rect[2], rect[1])
    l1, l2 = float(np.linalg.norm(e1)), float(np.linalg.norm(e2))
    if l1 < 1e-6 or l2 < 1e-6:
        return None
    u = e1 / l1 if l1 >= l2 else e2 / l2
    c = np.mean(rect, axis=0)
    return poly, c, u, max(l1, l2), min(l1, l2)


def _fits(poly, c, u, along, across, w, d):
    """Footprint w (along u) x d (across) centred at local (along, across) lies inside the room."""
    from shapely.geometry import Polygon
    n = np.array([-u[1], u[0]])
    p0 = c + u * along + n * across
    corners = [p0 + u * sx * w / 2 + n * sy * d / 2 for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    return poly.buffer(0.02).contains(Polygon(corners)), p0


def _add_stair(b, storey, room, z0, rise, label):
    fr = _room_frame([(_m(x), _m(y)) for x, y in room['polygon']])
    if not fr:
        return []
    poly, c, u, long_, short = fr
    width = min(1.2, short - 0.3)
    n_risers = max(2, math.ceil(rise / 0.185))
    going = 0.27
    run = (n_risers - 1) * going
    if width < 0.8 or run > long_ - 0.3:
        return []
    ok, p0 = _fits(poly, c, u, 0.0, -(short / 2 - width / 2 - 0.05), run, width)
    if not ok:
        return []
    stair = b.entity('IfcStair', f'Treppe {label} (Annahme)', 'STRAIGHT_RUN_STAIR', ((p0[0], p0[1], z0), (u[0], u[1])))
    h = rise / n_risers
    steps = [(b.box(-run / 2 + going * (k + 0.5), 0, 0, going, width, h * (k + 1)), 'stair') for k in range(n_risers - 1)]
    b.show(stair, steps)
    ps = ifcopenshell.api.run('pset.add_pset', b.f, product=stair, name='Pset_StairCommon')
    ifcopenshell.api.run('pset.edit_pset', b.f, pset=ps, properties={'NumberOfRiser': n_risers, 'NumberOfTreads': n_risers - 1,
                                                                    'RiserHeight': round(h, 3), 'TreadLength': going})
    b.assign_material([stair], 'Stahlbeton', 'concrete')
    rail = b.entity('IfcRailing', f'Geländer {label}', 'HANDRAIL', ((p0[0], p0[1], z0), (u[0], u[1])))
    posts = [(b.box(-run / 2 + going * (k + 0.5), width / 2 - 0.03, h * (k + 1), 0.03, 0.03, 0.9), 'railing') for k in range(0, n_risers - 1, 3)]
    slope = math.atan2(rise - h, run - going)
    hand = b.f.createIfcExtrudedAreaSolid(b.rect_profile(0.05, 0.04), b.f.createIfcAxis2Placement3D(
        b.f.createIfcCartesianPoint((float(-run / 2 + going / 2), float(width / 2 - 0.03), float(h + 0.9))),
        b.f.createIfcDirection((math.cos(slope), 0., math.sin(slope))), b.f.createIfcDirection((0., 1., 0.))),
        b.f.createIfcDirection((0., 0., 1.)), float(math.hypot(run - going, rise - h)))
    b.show(rail, posts + [(hand, 'railing')])
    return [stair, rail]


FURNITURE = [  # (pattern, [(class, name, w, d, h, style, z)], against wall)
    (re.compile(r'küche|kueche|kitchen|koch', re.I), [('IfcFurniture', 'Küchenzeile', 2.4, 0.6, 0.9, 'white', 0.0)]),
    (re.compile(r'\bbad\b|badezimmer|dusche|\bwc\b|toilette|sanitär', re.I), [('IfcSanitaryTerminal', 'WC', 0.4, 0.6, 0.42, 'ceramic', 0.0),
                                                                             ('IfcSanitaryTerminal', 'Waschtisch', 0.6, 0.45, 0.12, 'ceramic', 0.78)]),
    (re.compile(r'schlaf|eltern|gäste|gaeste|kind', re.I), [('IfcFurniture', 'Bett', 1.6, 2.0, 0.45, 'fabric', 0.0)]),
    (re.compile(r'wohn|living|aufenthalt', re.I), [('IfcFurniture', 'Sofa', 2.2, 0.9, 0.8, 'fabric', 0.0)]),
    (re.compile(r'ess|dining', re.I), [('IfcFurniture', 'Esstisch', 1.6, 0.9, 0.75, 'wood_light', 0.0)]),
    (re.compile(r'arbeit|büro|buero|office|studio', re.I), [('IfcFurniture', 'Schreibtisch', 1.6, 0.8, 0.75, 'wood_light', 0.0)]),
]


def _add_furniture(b, room, z0):
    name = room.get('name') or ''
    rule = next((items for pat, items in FURNITURE if pat.search(name)), None)
    if not rule:
        return []
    fr = _room_frame([(_m(x), _m(y)) for x, y in room['polygon']])
    if not fr:
        return []
    poly, c, u, long_, short = fr
    placed, offset = [], -long_ / 2 + 0.1
    for cls, label, w, d, h, style, zb in rule:
        if label == 'Bett' and short < 2.8:
            w = 0.9
        if label == 'Küchenzeile':
            w = max(1.2, min(w, long_ - 0.4))
        along = offset + w / 2
        across = -(short / 2 - d / 2 - 0.05)
        ok, p0 = _fits(poly, c, u, along, across, w, d)
        if not ok:
            ok, p0 = _fits(poly, c, u, 0.0, across, w, d)
        if not ok:
            continue
        e = b.entity(cls, f'{label} (Platzhalter)', 'NOTDEFINED' if cls == 'IfcFurniture' else ('TOILETPAN' if label == 'WC' else 'WASHHANDBASIN'),
                     ((p0[0], p0[1], z0 + zb), (u[0], u[1])))
        b.show(e, [(b.box(0, 0, 0, w, d, h), style)])
        placed.append(e)
        offset = along + w / 2 + 0.3
    return placed


def _add_terrain(b, levels):
    from shapely.geometry import Polygon, MultiPolygon
    from shapely.ops import unary_union
    shapes = [Polygon([(_m(x), _m(y)) for x, y in l['boundary']]).buffer(0) for l in levels if l.get('boundary') and len(l['boundary']) >= 3]
    if not shapes:
        return None
    x0, y0, x1, y1 = unary_union(shapes).bounds
    m = max(8.0, 0.4 * max(x1 - x0, y1 - y0))
    ground = min([_m(l['elevation']) for l in levels if l['elevation'] >= 0] or [0.0])
    terrain = b.entity('IfcGeographicElement', 'Gelände (Annahme)', 'TERRAIN', (((x0 + x1) / 2, (y0 + y1) / 2, ground - 0.32), (1., 0.)))
    b.show(terrain, [(b.box(0, 0, 0, x1 - x0 + 2 * m, y1 - y0 + 2 * m, 0.3), 'terrain')])
    return terrain


def write_ifc(levels, path, name='Planentwurf (vermessen)', roof=None, warnings=None, appearance=None):
    warnings = warnings if warnings is not None else []
    b = Builder(name)
    _apply_appearance(b, appearance)
    order = sorted(range(len(levels)), key=lambda k: levels[k]['elevation'])
    above = {order[i]: order[i + 1] for i in range(len(order) - 1)}
    n_stairs = n_furniture = 0
    f = b.f
    storeys = []
    wall_types = {}
    for li, level in enumerate(levels):
        z0 = _m(level['elevation'])
        H = _m(level['height'])
        storey = b.entity('IfcBuildingStorey', level['name'], placement=((0., 0., z0), (1., 0.)))
        storey.Elevation = z0
        storeys.append(storey)
        contained = []
        walls = {}
        exterior = level.get('exterior_walls', set())
        for w in level['walls']:
            a, c = np.array(w['a'], float) / 1000, np.array(w['b'], float) / 1000
            L = float(np.linalg.norm(c - a))
            if L < 0.05:
                continue
            d = (c - a) / L
            t = _m(w['thickness'])
            key = round(w['thickness'])
            ext = w['id'] in exterior
            tkey = (key, ext)
            if tkey not in wall_types:
                wt = ifcopenshell.api.run('root.create_entity', f, ifc_class='IfcWallType', name=f'{"Außenwand" if ext else "Innenwand"} {key / 10:g} cm (Annahme)', predefined_type='STANDARD')
                mset = ifcopenshell.api.run('material.add_material_set', f, name=wt.Name, set_type='IfcMaterialLayerSet')
                for lname, lt in _wall_layers(float(key), ext):
                    layer = ifcopenshell.api.run('material.add_layer', f, layer_set=mset, material=b.material(lname))
                    ifcopenshell.api.run('material.edit_layer', f, layer=layer, attributes={'LayerThickness': _m(lt)})
                ifcopenshell.api.run('material.assign_material', f, products=[wt], material=mset)
                wall_types[tkey] = wt
            mid = (a + c) / 2
            e = b.entity('IfcWall', f'Wand {w["id"]}', 'STANDARD', ((mid[0], mid[1], z0), d))
            b.rect(e, L, t, H, 'wall_ext' if ext else 'wall_int')
            ifcopenshell.api.run('type.assign_type', f, related_objects=[e], relating_type=wall_types[tkey])
            ps = ifcopenshell.api.run('pset.add_pset', f, product=e, name='Pset_WallCommon')
            ifcopenshell.api.run('pset.edit_pset', f, pset=ps, properties={'IsExternal': ext, 'Reference': f'{key / 10:g} cm', **({'FireRating': w['fire']} if w.get('fire') else {})})
            q = ifcopenshell.api.run('pset.add_qto', f, product=e, name='Qto_WallBaseQuantities')
            ifcopenshell.api.run('pset.edit_qto', f, qto=q, properties={'Length': L, 'Width': t, 'Height': H, 'GrossSideArea': L * H})
            walls[w['id']] = (e, w, d)
            contained.append(e)
        counters = {'door': 0, 'window': 0, 'opening': 0}
        doors, windows = [], []
        for o in level['openings']:
            host = walls.get(o['wall'])
            if not host:
                continue
            e, w, d = host
            counters[o['kind']] += 1
            label = {'door': 'Tür', 'window': 'Fenster', 'opening': 'Öffnung'}[o['kind']] + f' {counters[o["kind"]]}'
            at = np.array(o['at'], float) / 1000
            width, height, sill = _m(o['width']), _m(o['height']), _m(o['sill'])
            t = _m(w['thickness'])
            op = b.entity('IfcOpeningElement', label, 'OPENING', ((at[0], at[1], z0 + sill), d))
            b.rect(op, width, t + 0.1, height)
            ifcopenshell.api.run('feature.add_feature', f, feature=op, element=e)
            if o['kind'] == 'opening':
                continue
            is_door = o['kind'] == 'door'
            cls = 'IfcDoor' if is_door else 'IfcWindow'
            el = b.entity(cls, label, 'DOOR' if is_door else 'WINDOW', ((at[0], at[1], z0 + sill), d))
            b.show(el, _door(b, width, height, t) if is_door else _window(b, width, height, t))
            ifcopenshell.api.run('feature.add_filling', f, opening=op, element=el)
            el.OverallWidth = width
            el.OverallHeight = height
            pset = ifcopenshell.api.run('pset.add_pset', f, product=el, name='Pset_DoorCommon' if is_door else 'Pset_WindowCommon')
            ifcopenshell.api.run('pset.edit_pset', f, pset=pset, properties={'Reference': f'{round(o["width"])} x {round(o["height"])} mm', 'IsExternal': o['wall'] in exterior, **({'FireRating': o['fire']} if o.get('fire') else {})})
            (doors if is_door else windows).append(el)
            contained.append(el)
        if doors:
            b.assign_material(doors, 'Holz', 'wood')
        if windows:
            b.assign_material(windows, 'Kunststoff-Fenster mit Isolierglas', 'glass')
        if level.get('boundary') and len(level['boundary']) >= 3:
            slab = b.entity('IfcSlab', f'{"Bodenplatte" if li == 0 else "Decke unter"} {level["name"]} (Annahme 20 cm)', 'BASESLAB' if li == 0 else 'FLOOR', ((0., 0., z0 - SLAB), (1., 0.)))
            b.poly(slab, [(_m(x), _m(y)) for x, y in level['boundary']], SLAB, 'slab')
            b.assign_material([slab], 'Stahlbeton', 'concrete')
            contained.append(slab)
        spaces = []
        for r in level['rooms']:
            sp = b.entity('IfcSpace', r['name'], 'INTERNAL', ((0., 0., z0), (1., 0.)))
            sp.LongName = r['name']
            pts = [(_m(x), _m(y)) for x, y in r['polygon']]
            b.poly(sp, pts, H)
            area = r['area_m2']
            perim = sum(math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts)))
            q = ifcopenshell.api.run('pset.add_qto', f, product=sp, name='Qto_SpaceBaseQuantities')
            ifcopenshell.api.run('pset.edit_qto', f, qto=q, properties={'NetFloorArea': area, 'NetPerimeter': perim, 'Height': H, 'NetVolume': area * H})
            ps = ifcopenshell.api.run('pset.add_pset', f, product=sp, name='Pset_SpaceCommon')
            ifcopenshell.api.run('pset.edit_pset', f, pset=ps, properties={'IsExternal': False, 'Reference': r['id']})
            spaces.append(sp)
        for r in level['rooms']:
            if li in above and STAIR_ROOM.search(r.get('name') or ''):
                upper = levels[above[li]]
                parts = _add_stair(b, storey, r, z0, _m(upper['elevation']) - _m(level['elevation']), f'{level["name"]} → {upper["name"]}')
                n_stairs += 1 if parts else 0
                contained += parts
            else:
                items = _add_furniture(b, r, z0)
                n_furniture += len(items)
                contained += items
        if spaces:
            ifcopenshell.api.run('aggregate.assign_object', f, products=spaces, relating_object=storey)
        if contained:
            ifcopenshell.api.run('spatial.assign_container', f, products=contained, relating_structure=storey)
    if levels:
        top = max(range(len(levels)), key=lambda k: levels[k]['elevation'])
        r = _add_roof(b, storeys[top], levels[top], roof, warnings)
        if r is not None:
            ifcopenshell.api.run('spatial.assign_container', f, products=[r], relating_structure=storeys[top])
    terrain = _add_terrain(b, levels)
    if terrain is not None:
        ifcopenshell.api.run('spatial.assign_container', f, products=[terrain], relating_structure=b.site)
    if n_stairs:
        warnings.append(f'{n_stairs} Treppe(n) in Treppenräumen angenommen (gerade Läufe, Steigung ≈ 18 cm).')
    if n_furniture:
        warnings.append(f'{n_furniture} Möbel/Sanitärobjekt(e) als Platzhalter nach Raumnamen gesetzt.')
    if storeys:
        ifcopenshell.api.run('aggregate.assign_object', f, products=storeys, relating_object=b.building)
    f.header.file_description.description = ('ViewDefinition [ReferenceView_V1.2]', 'Aus Plan vermessen, Entwurf mit angenommenen Materialien')
    f.write(path)
    return warnings
