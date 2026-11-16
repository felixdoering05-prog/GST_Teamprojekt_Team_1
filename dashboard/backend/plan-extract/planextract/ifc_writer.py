"""IFC4 from measured candidates with IfcOpenShell (LGPL): storeys, walls with real thickness, openings, doors, windows, spaces."""
import math
import numpy as np
import ifcopenshell, ifcopenshell.api

SLAB = 0.2


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

    def entity(self, cls, name, predefined=None, placement=None):
        e = ifcopenshell.api.run('root.create_entity', self.f, ifc_class=cls, name=name, predefined_type=predefined)
        m = np.eye(4)
        if placement is not None:
            (x, y, z), d = placement
            m[:3, 0] = [d[0], d[1], 0]; m[:3, 1] = [-d[1], d[0], 0]; m[:3, 3] = [x, y, z]
        ifcopenshell.api.run('geometry.edit_object_placement', self.f, product=e, matrix=m)
        return e

    def solid(self, e, profile, height):
        f = self.f
        s = f.createIfcExtrudedAreaSolid(profile, f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((0., 0., 0.))), f.createIfcDirection((0., 0., 1.)), float(height))
        rep = f.createIfcShapeRepresentation(self.body, 'Body', 'SweptSolid', [s])
        ifcopenshell.api.run('geometry.assign_representation', f, product=e, representation=rep)

    def rect(self, e, w, d, h):
        f = self.f
        self.solid(e, f.createIfcRectangleProfileDef('AREA', None, f.createIfcAxis2Placement2D(f.createIfcCartesianPoint((0., 0.))), float(max(w, 0.01)), float(max(d, 0.01))), h)

    def poly(self, e, points, h):
        f = self.f
        pts = [f.createIfcCartesianPoint((float(x), float(y))) for x, y in points]
        self.solid(e, f.createIfcArbitraryClosedProfileDef('AREA', None, f.createIfcPolyline(pts + [pts[0]])), h)


def _m(v):
    return v / 1000.0


def write_ifc(levels, path, name='Planentwurf (vermessen)'):
    b = Builder(name)
    f = b.f
    storeys = []
    for li, level in enumerate(levels):
        z0 = _m(level['elevation'])
        H = _m(level['height'])
        storey = b.entity('IfcBuildingStorey', level['name'], placement=((0., 0., z0), (1., 0.)))
        storey.Elevation = z0
        storeys.append(storey)
        contained = []
        types = {}
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
            if key not in types:
                types[key] = ifcopenshell.api.run('root.create_entity', f, ifc_class='IfcWallType', name=f'Wand {key / 10:g} cm', predefined_type='STANDARD')
            mid = (a + c) / 2
            e = b.entity('IfcWall', f'Wand {w["id"]}', 'STANDARD', ((mid[0], mid[1], z0), d))
            b.rect(e, L, t, H)
            ifcopenshell.api.run('type.assign_type', f, related_objects=[e], relating_type=types[key])
            ps = ifcopenshell.api.run('pset.add_pset', f, product=e, name='Pset_WallCommon')
            ifcopenshell.api.run('pset.edit_pset', f, pset=ps, properties={'IsExternal': w['id'] in exterior, 'Reference': f'{key / 10:g} cm'})
            q = ifcopenshell.api.run('pset.add_qto', f, product=e, name='Qto_WallBaseQuantities')
            ifcopenshell.api.run('pset.edit_qto', f, qto=q, properties={'Length': L, 'Width': t, 'Height': H, 'GrossSideArea': L * H})
            walls[w['id']] = (e, w, d)
            contained.append(e)
        counters = {'door': 0, 'window': 0, 'opening': 0}
        for o in level['openings']:
            host = walls.get(o['wall'])
            if not host:
                continue
            e, w, d = host
            counters[o['kind']] += 1
            label = {'door': 'Tür', 'window': 'Fenster', 'opening': 'Öffnung'}[o['kind']] + f' {counters[o["kind"]]}'
            at = np.array(o['at'], float) / 1000
            width, height, sill = _m(o['width']), _m(o['height']), _m(o['sill'])
            op = b.entity('IfcOpeningElement', label, 'OPENING', ((at[0], at[1], z0 + sill), d))
            b.rect(op, width, _m(w['thickness']) + 0.1, height)
            ifcopenshell.api.run('feature.add_feature', f, feature=op, element=e)
            if o['kind'] == 'opening':
                continue
            cls = 'IfcDoor' if o['kind'] == 'door' else 'IfcWindow'
            el = b.entity(cls, label, 'DOOR' if o['kind'] == 'door' else 'WINDOW', ((at[0], at[1], z0 + sill), d))
            b.rect(el, width, min(0.06, _m(w['thickness'])), height)
            ifcopenshell.api.run('feature.add_filling', f, opening=op, element=el)
            el.OverallWidth = width
            el.OverallHeight = height
            pset = ifcopenshell.api.run('pset.add_pset', f, product=el, name='Pset_DoorCommon' if o['kind'] == 'door' else 'Pset_WindowCommon')
            ifcopenshell.api.run('pset.edit_pset', f, pset=pset, properties={'Reference': f'{round(o["width"])} x {round(o["height"])} mm', 'IsExternal': o['wall'] in exterior})
            contained.append(el)
        if level.get('boundary') and len(level['boundary']) >= 3:
            slab = b.entity('IfcSlab', f'Bodenplatte {level["name"]} (Annahme 20 cm)', 'FLOOR', ((0., 0., z0 - SLAB), (1., 0.)))
            b.poly(slab, [(_m(x), _m(y)) for x, y in level['boundary']], SLAB)
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
        if spaces:
            ifcopenshell.api.run('aggregate.assign_object', f, products=spaces, relating_object=storey)
        if contained:
            ifcopenshell.api.run('spatial.assign_container', f, products=contained, relating_structure=storey)
    if storeys:
        ifcopenshell.api.run('aggregate.assign_object', f, products=storeys, relating_object=b.building)
    f.header.file_description.description = ('ViewDefinition [ReferenceView_V1.2]', 'Aus Vektorplan vermessen, Entwurf')
    f.write(path)
