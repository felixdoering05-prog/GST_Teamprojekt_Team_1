"""Walls from parallel face lines, openings from wall gaps and symbols. All values in millimetres."""
import bisect, math, re
from collections import defaultdict

T_MIN, T_MAX = 50.0, 700.0        # plausible wall thickness
MIN_OVERLAP = 100.0               # minimum common length of two faces
ANGLE_SNAP = 2.0                  # degrees to snap to a dominant direction
OFFSET_TOL = 20.0
MAX_DOOR, MAX_WINDOW, MAX_UNCLEAR = 2600.0, 6000.0, 3000.0
MIN_OPENING = 250.0
DOOR_HEIGHT, WINDOW_SILL, WINDOW_HEIGHT = 2010.0, 900.0, 1350.0

WALL_LAYER = re.compile(r'wand|w[äa]nde|wall|mauer|mw[-_ ]|tragend|a[-_]wall|stb|beton', re.I)
SKIP_LAYER = re.compile(r'bema|dim|ma(ss|ß)|text|schrift|m[öo]b|furn|einricht|hatch|schraff|achs|axis|raster|grid|rahmen|frame|'
                        r'plankopf|title|sanit|k[üu]che|treppe|stair|elektr|heiz|symbol|defpoints', re.I)
DOOR_NAME = re.compile(r't(u|ü|ue)r|door|^t[_-]?\d', re.I)
WINDOW_NAME = re.compile(r'fenster|window|^fe?[_-]?\d|^win', re.I)


def angdiff(a, b):
    d = abs(a - b) % 180
    return min(d, 180 - d)


def unit(angle):
    r = math.radians(angle)
    return (math.cos(r), math.sin(r)), (-math.sin(r), math.cos(r))


def dot(p, v):
    return p[0] * v[0] + p[1] * v[1]


def dominant_angles(segs):
    hist = defaultdict(float)
    for s in segs:
        hist[round((s.angle % 90) * 2) / 2 % 90] += s.length
    if not hist:
        return []
    base = max(hist, key=hist.get)
    return [base % 180, (base + 90) % 180]


def snapped(angle, dominant):
    for d in dominant:
        if angdiff(angle, d) <= ANGLE_SNAP:
            return round(d, 3)
    return round(angle, 1) % 180


def subtract(intervals, lo, hi):
    out = []
    for a, b in intervals:
        if b <= lo or a >= hi:
            out.append((a, b))
            continue
        if a < lo:
            out.append((a, lo))
        if b > hi:
            out.append((hi, b))
    return out


def intersect(intervals, lo, hi):
    return [(max(a, lo), min(b, hi)) for a, b in intervals if min(b, hi) - max(a, lo) > 0]


class Line:
    """A segment in the coordinate frame of its snapped direction."""
    __slots__ = ('angle', 'u', 'n', 'c', 's0', 's1', 'src', 'free')

    def __init__(self, angle, seg, src):
        self.angle = angle
        self.u, self.n = unit(angle)
        sa, sb = dot(seg.a, self.u), dot(seg.b, self.u)
        self.c = (dot(seg.a, self.n) + dot(seg.b, self.n)) / 2
        self.s0, self.s1 = min(sa, sb), max(sa, sb)
        self.src = src
        self.free = [(self.s0, self.s1)]


def merge_collinear(lines):
    """Joins touching/overlapping pieces of the same line (PDF exports often split lines)."""
    by = defaultdict(list)
    for l in lines:
        by[(l.angle, round(l.c))].append(l)
    out = []
    for key, group in by.items():
        group.sort(key=lambda l: l.s0)
        cur = group[0]
        for l in group[1:]:
            if l.s0 <= cur.s1 + 2.0:
                cur.s1 = max(cur.s1, l.s1)
                cur.free = [(cur.s0, cur.s1)]
            else:
                out.append(cur)
                cur = l
        out.append(cur)
    return out


def wall_segments(segs, excluded):
    """Chooses the segments that may be wall faces: wall layers when present, never dimensions/blocks/annotation layers."""
    usable = [(i, s) for i, s in enumerate(segs) if i not in excluded and not s.block and s.length >= 20]
    named = [(i, s) for i, s in usable if s.layer and WALL_LAYER.search(s.layer)]
    if len(named) >= 8:
        return named, 'layer'
    return [(i, s) for i, s in usable if not (s.layer and SKIP_LAYER.search(s.layer))], 'geometry'


def pair_faces(lines, t_min=T_MIN):
    """Greedy nearest pairing of parallel faces into wall pieces (centre line + thickness)."""
    by_angle = defaultdict(list)
    for l in lines:
        by_angle[l.angle].append(l)
    pieces = []
    for angle, group in by_angle.items():
        group.sort(key=lambda l: l.c)
        cs = [l.c for l in group]
        cands = []
        for i, a in enumerate(group):
            j = bisect.bisect_left(cs, a.c + t_min)
            while j < len(group) and group[j].c - a.c <= T_MAX:
                b = group[j]
                lo, hi = max(a.s0, b.s0), min(a.s1, b.s1)
                if hi - lo >= MIN_OVERLAP:
                    cands.append((b.c - a.c, i, j, lo, hi))
                j += 1
        cands.sort()
        for d, i, j, lo, hi in cands:
            a, b = group[i], group[j]
            for x0, x1 in intersect(a.free, lo, hi):
                for y0, y1 in intersect(b.free, x0, x1):
                    if y1 - y0 >= MIN_OVERLAP:
                        pieces.append({'angle': angle, 'u': a.u, 'n': a.n, 'c': (a.c + b.c) / 2, 't': d, 's0': y0, 's1': y1,
                                       'faces': (a, b)})
                        a.free = subtract(a.free, y0, y1)
                        b.free = subtract(b.free, y0, y1)
    return pieces


def cluster(pieces):
    by_angle = defaultdict(list)
    for p in pieces:
        by_angle[p['angle']].append(p)
    clusters = []
    for angle, group in by_angle.items():
        group.sort(key=lambda p: (round(p['t'] / OFFSET_TOL), p['c']))
        used = [False] * len(group)
        for i, p in enumerate(group):
            if used[i]:
                continue
            members = [p]
            used[i] = True
            for j in range(i + 1, len(group)):
                q = group[j]
                if not used[j] and abs(q['c'] - p['c']) <= OFFSET_TOL and abs(q['t'] - p['t']) <= OFFSET_TOL:
                    members.append(q)
                    used[j] = True
            clusters.append({'angle': angle, 'u': p['u'], 'n': p['n'],
                             'c': sum(m['c'] * (m['s1'] - m['s0']) for m in members) / sum(m['s1'] - m['s0'] for m in members),
                             't': sum(m['t'] * (m['s1'] - m['s0']) for m in members) / sum(m['s1'] - m['s0'] for m in members),
                             'pieces': sorted(members, key=lambda m: m['s0'])})
    return clusters


def world(cl, s, o=0.0):
    return (cl['u'][0] * s + cl['n'][0] * (cl['c'] + o), cl['u'][1] * s + cl['n'][1] * (cl['c'] + o))


def local(cl, p):
    return dot(p, cl['u']), dot(p, cl['n']) - cl['c']


class Detector:
    def __init__(self, plan, excluded):
        self.plan = plan
        self.excluded = excluded
        self.notes = []

    # ------------------------------------------------------------------ walls
    def walls(self):
        chosen, mode = wall_segments(self.plan.segs, self.excluded)
        self.mode = mode
        dom = dominant_angles([s for i, s in chosen])
        self.dominant = dom
        lines = merge_collinear([Line(snapped(s.angle, dom), s, i) for i, s in chosen])
        self.lines = lines
        # Technical plans (filtered large plans): thin double lines are pipes and ducts, not walls.
        large = 'large_plan_filtered' in getattr(self.plan, 'notes', [])
        pieces = pair_faces(lines, t_min=115.0 if large else T_MIN)
        if large:
            self.notes.append('Technikplan erkannt: farbige Leitungen, Schraffuren und Doppellinien unter 11,5 cm ignoriert.')
        clusters = cluster(pieces)
        clusters.sort(key=lambda k: -k['t'])
        main, symbols = [], []
        for k in clusters:
            span = [(p['s0'], p['s1']) for p in k['pieces']]
            host = None
            for m in main:
                if m['angle'] != k['angle'] or k['t'] >= m['t'] - 10:
                    continue
                if abs(k['c'] - m['c']) + k['t'] / 2 <= m['t'] / 2 + 15:
                    lo = min(p['s0'] for p in m['pieces']) - 50
                    hi = max(p['s1'] for p in m['pieces']) + 50
                    if all(lo <= a and b <= hi for a, b in span):
                        host = m
                        break
            if host:
                symbols.append((host, k))
                continue
            total = sum(b - a for a, b in span)
            if total < k['t'] and len(k['pieces']) == 1:
                k['short'] = True
            main.append(k)
        self.symbol_pieces = defaultdict(list)
        for host, k in symbols:
            self.symbol_pieces[id(host)] += [(p['s0'], p['s1']) for p in k['pieces']]
        return main

    # ------------------------------------------------------------- evidence
    # Spatial indexes: large plans have tens of thousands of arcs and segments; every wall gap only looks nearby.
    def _box(self, cl, g0, g1, pad_s, pad_o):
        from shapely.geometry import Polygon
        t = cl['t']
        return Polygon([world(cl, g0 - pad_s, -t / 2 - pad_o), world(cl, g1 + pad_s, -t / 2 - pad_o),
                        world(cl, g1 + pad_s, t / 2 + pad_o), world(cl, g0 - pad_s, t / 2 + pad_o)])

    def _arc_index(self):
        if not hasattr(self, '_arc_tree'):
            from shapely.geometry import Point
            from shapely.strtree import STRtree
            self._arc_list = [a for a in self.plan.arcs if 45 <= a.sweep <= 135]
            self._arc_tree = STRtree([Point(a.c) for a in self._arc_list]) if self._arc_list else None
        return self._arc_tree

    def _seg_index(self):
        if not hasattr(self, '_seg_tree'):
            from shapely.geometry import LineString
            from shapely.strtree import STRtree
            self._seg_ids = [i for i, sg in enumerate(self.plan.segs) if i not in self.excluded]
            self._seg_tree = STRtree([LineString([self.plan.segs[i].a, self.plan.segs[i].b]) for i in self._seg_ids]) if self._seg_ids else None
        return self._seg_tree

    def _arcs_near(self, cl, g0, g1):
        t, g = cl['t'], g1 - g0
        found = []
        tree = self._arc_index()
        if tree is None:
            return found
        for k in tree.query(self._box(cl, g0, g1, 110, 90)):
            a = self._arc_list[k]
            if not 45 <= a.sweep <= 135:
                continue
            s, o = local(cl, a.c)
            if abs(o) > t / 2 + 80:
                continue
            for end in (g0, g1):
                if abs(s - end) <= 100 and 0.7 * g <= a.r <= 1.3 * g:
                    found.append(('single', a))
                if abs(s - end) <= 100 and 0.35 * g <= a.r <= 0.65 * g:
                    found.append(('half', a))
        return found

    def _inserts_in(self, cl, g0, g1):
        hits = []
        for ins in self.plan.inserts:
            if not ins.corners:
                continue
            xs = [local(cl, p) for p in ins.corners]
            smin, smax = min(x[0] for x in xs), max(x[0] for x in xs)
            omin, omax = min(x[1] for x in xs), max(x[1] for x in xs)
            if smax < g0 - 50 or smin > g1 + 50 or omax < -cl['t'] / 2 - 50 or omin > cl['t'] / 2 + 50:
                continue
            kind = 'door' if DOOR_NAME.search(ins.name) else 'window' if WINDOW_NAME.search(ins.name) else None
            hits.append((kind, ins))
        return hits

    def _glass_lines(self, cl, g0, g1):
        t = cl['t']
        g = g1 - g0
        cover = []
        for lo, hi in self.symbol_pieces.get(id(cl), []):
            if hi > g0 and lo < g1:
                cover.append((max(lo, g0), min(hi, g1)))
        tree = self._seg_index()
        for k in (tree.query(self._box(cl, g0, g1, 0, 0)) if tree is not None else []):
            i = self._seg_ids[k]
            s = self.plan.segs[i]
            if angdiff(s.angle, cl['angle']) > ANGLE_SNAP:
                continue
            sa, oa = local(cl, s.a)
            sb, ob = local(cl, s.b)
            if max(abs(oa), abs(ob)) > t / 2 - 0.1 * t:
                continue
            lo, hi = max(min(sa, sb), g0), min(max(sa, sb), g1)
            if hi > lo:
                cover.append((lo, hi))
        if not cover:
            return False
        best = max(hi - lo for lo, hi in cover)
        return best >= 0.6 * g

    def _junction(self, cl, g0, g1, walls):
        if getattr(self, '_junction_for', None) is not walls:
            from shapely.geometry import Point
            from shapely.strtree import STRtree
            self._junction_for = walls
            self._ends = [(w, s_end) for w in walls for p in w['pieces'] for s_end in (p['s0'], p['s1'])]
            self._end_tree = STRtree([Point(world(w, s_end)) for w, s_end in self._ends]) if self._ends else None
        if self._end_tree is None:
            return False
        for k in self._end_tree.query(self._box(cl, g0, g1, 400, 45)):
            w, s_end = self._ends[k]
            if w is cl or angdiff(w['angle'], cl['angle']) < 20:
                continue
            if True:
                if True:
                    e = world(w, s_end)
                    s, o = local(cl, e)
                    if abs(o) <= cl['t'] / 2 + 40:
                        lo, hi = s - w['t'] / 2, s + w['t'] / 2
                        if min(hi, g1) - max(lo, g0) >= 0.6 * (g1 - g0):
                            return True
        return False

    # ----------------------------------------------------------- openings
    def build(self):
        clusters = self.walls()
        walls, openings, used_arcs, used_ins = [], [], set(), set()
        for cl in clusters:
            runs = []
            pieces = cl['pieces']
            cur = {'s0': pieces[0]['s0'], 's1': pieces[0]['s1'], 'openings': []}
            for p in pieces[1:]:
                g0, g1 = cur['s1'], p['s0']
                gap = g1 - g0
                decision = None
                if gap <= 5:
                    decision = ('merge', None)
                else:
                    arcs = self._arcs_near(cl, g0, g1)
                    ins = self._inserts_in(cl, g0, g1)
                    door_ins = [x for x in ins if x[0] == 'door']
                    win_ins = [x for x in ins if x[0] == 'window']
                    singles = [a for k, a in arcs if k == 'single']
                    halves = {id(a): a for k, a in arcs if k == 'half'}
                    if self._junction(cl, g0, g1, clusters):
                        decision = ('merge', None)
                    elif (singles or len(halves) >= 2 or door_ins) and gap <= MAX_DOOR:
                        ev = 'block:' + door_ins[0][1].name if door_ins else 'arc' if singles else 'double-arc'
                        for a in singles[:1] or list(halves.values())[:2]:
                            used_arcs.add(id(a))
                        for k, i in door_ins:
                            used_ins.add(id(i))
                        decision = ('door', ev)
                    elif (win_ins or self._glass_lines(cl, g0, g1)) and gap <= MAX_WINDOW:
                        for k, i in win_ins:
                            used_ins.add(id(i))
                        decision = ('window', 'block:' + win_ins[0][1].name if win_ins else 'glass-lines')
                    elif gap < MIN_OPENING:
                        decision = ('merge', None)
                    elif gap <= MAX_UNCLEAR:
                        for k, i in ins:
                            used_ins.add(id(i))
                        decision = ('opening', 'gap')
                if decision is None:
                    runs.append(cur)
                    cur = {'s0': p['s0'], 's1': p['s1'], 'openings': []}
                    continue
                if decision[0] != 'merge':
                    cur['openings'].append({'kind': decision[0], 's0': g0, 's1': g1, 'evidence': decision[1]})
                cur['s1'] = max(cur['s1'], p['s1'])
            runs.append(cur)
            for r in runs:
                walls.append({'angle': cl['angle'], 'u': cl['u'], 'n': cl['n'], 'c': cl['c'], 't': cl['t'],
                              's0': r['s0'], 's1': r['s1'], 'openings': r['openings'], 'short': cl.get('short', False)})
        walls = [w for w in walls if w['s1'] - w['s0'] >= max(100.0, 0.5 * w['t']) or w['openings']]
        if 'large_plan_filtered' in getattr(self.plan, 'notes', []):
            # Technical plans: short double-line stubs without openings are installation details, not walls.
            before = len(walls)
            walls = [w for w in walls if w['s1'] - w['s0'] >= 1000.0 or w['openings']]
            if before - len(walls):
                self.notes.append(f'{before - len(walls)} kurze Linienpaare ohne Öffnung (unter 1 m) als Technikdetail ignoriert.')
        self._close_corners(walls)
        walls = self._largest_component(walls)
        self._host_symbols(walls, used_arcs, used_ins)
        return walls

    def _close_corners(self, walls):
        """Extends wall ends to the centre line of the wall they run into (L-, T- and X-junctions)."""
        from shapely.geometry import LineString, Point
        from shapely.strtree import STRtree
        reach = max([w['t'] for w in walls] or [0]) + 200.0
        tree = STRtree([LineString([world(v, v['s0']), world(v, v['s1'])]) for v in walls]) if walls else None
        for w in walls:
            for end in ('s0', 's1'):
                sign = -1 if end == 's0' else 1
                p = world(w, w[end])
                best = None
                near = [walls[i] for i in tree.query(Point(p).buffer(reach + w['t']))] if tree is not None else []
                for v in near:
                    if v is w or angdiff(v['angle'], w['angle']) < 20:
                        continue
                    # Intersection of w's centre line with v's centre line, as parameter along w.
                    den = dot(w['u'], v['n'])
                    if abs(den) < 1e-9:
                        continue
                    s = (v['c'] - dot((w['n'][0] * w['c'], w['n'][1] * w['c']), v['n'])) / den
                    ext = (s - w[end]) * sign
                    if not -(v['t'] / 2 + 10) <= ext <= v['t'] / 2 + w['t'] / 2 + 60:
                        continue
                    x = world(w, s)
                    sv = dot(x, v['u'])
                    if not v['s0'] - w['t'] / 2 - 60 <= sv <= v['s1'] + w['t'] / 2 + 60:
                        continue
                    # Farthest valid target closes L-corners that also have a partition right next to them.
                    if best is None or ext > best[0]:
                        best = (ext, s)
                if best and best[0] > 0:
                    w[end] = best[1]

    def _largest_component(self, walls):
        if not walls:
            return walls
        from shapely.geometry import LineString
        geoms = [LineString([world(w, w['s0']), world(w, w['s1'])]).buffer(w['t'] / 2 + 30) for w in walls]
        parent = list(range(len(walls)))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i
        from shapely.strtree import STRtree
        tree = STRtree(geoms)
        for i, g in enumerate(geoms):
            for j in tree.query(g, predicate='intersects'):
                if j > i:
                    parent[find(i)] = find(int(j))
        comps = defaultdict(list)
        for i in range(len(walls)):
            comps[find(i)].append(i)
        from shapely.ops import unary_union
        from shapely.geometry import Polygon, box
        shapes = {k: unary_union([geoms[i] for i in v]) for k, v in comps.items()}
        holes = {k: unary_union([Polygon(r) for g in getattr(sh, 'geoms', [sh]) for r in g.interiors]) for k, sh in shapes.items()}
        total = {k: sum(walls[i]['s1'] - walls[i]['s0'] for i in v) for k, v in comps.items()}

        def on_box(k):
            # Few wall pairs, all lying on the component's own bounding box: a (possibly open) frame line.
            x0, y0, x1, y1 = shapes[k].bounds
            edge = box(x0, y0, x1, y1).exterior.buffer(1000)
            return len(comps[k]) <= 8 and all(edge.contains(geoms[i]) for i in comps[k])

        def encloses(k, j):
            # Rooms contain small symbols; a frame encloses a substantial part of the drawing.
            if total[j] < 0.2 * total[k]:
                return False
            if not holes[k].is_empty and holes[k].contains(shapes[j]):
                return True
            x0, y0, x1, y1 = shapes[k].bounds
            return on_box(k) and box(x0, y0, x1, y1).contains(shapes[j])
        # Plan frames and title blocks enclose the drawing: the outer component is a frame, not the building.
        frames = {k for k in comps for j in comps if j != k and encloses(k, j)}
        size = {k: s for k, s in total.items() if k not in frames} or total
        keep = max(size, key=size.get)
        dropped = [w for i, w in enumerate(walls) if find(i) != keep]
        if dropped:
            self.notes.append(f'{len(dropped)} Linienpaare außerhalb des Gebäudes ignoriert (z. B. Planrahmen oder Schriftfeld).')
        return [w for i, w in enumerate(walls) if find(i) == keep]

    def _host_symbols(self, walls, used_arcs, used_ins):
        """Door arcs and opening blocks that did not explain a gap are hosted in the nearest wall instead of being dropped."""
        def nearest(pt, max_off):
            best = None
            for w in walls:
                s, o = local(w, pt)
                if w['s0'] - 50 <= s <= w['s1'] + 50 and abs(o) <= w['t'] / 2 + max_off:
                    if best is None or abs(o) < best[1]:
                        best = (w, abs(o), s)
            return best

        def overlaps(w, lo, hi):
            return any(min(hi, o['s1']) - max(lo, o['s0']) > 0.3 * (hi - lo) for o in w['openings'])

        for a in self.plan.arcs:
            if id(a) in used_arcs or not 60 <= a.sweep <= 120 or not 500 <= a.r <= 1500:
                continue
            hit = nearest(a.c, 80)
            if not hit:
                continue
            w, off, sh = hit
            ends = [local(w, a.point(a.start)), local(w, a.point(a.end))]
            jamb = min(ends, key=lambda e: abs(e[1]))
            if abs(jamb[1]) > w['t'] / 2 + 80:
                continue
            lo, hi = sorted((sh, jamb[0]))
            if hi - lo < 400 or overlaps(w, lo, hi):
                continue
            w['openings'].append({'kind': 'door', 's0': lo, 's1': hi, 'evidence': 'arc-on-wall'})
        for ins in self.plan.inserts:
            if id(ins) in used_ins or not ins.corners:
                continue
            kind = 'door' if DOOR_NAME.search(ins.name) else 'window' if WINDOW_NAME.search(ins.name) else None
            if not kind:
                continue
            cx = sum(p[0] for p in ins.corners) / len(ins.corners)
            cy = sum(p[1] for p in ins.corners) / len(ins.corners)
            hit = nearest((cx, cy), 400 if kind == 'door' else 150)
            if not hit:
                continue
            w = hit[0]
            ss = [local(w, p)[0] for p in ins.corners]
            lo, hi = min(ss), max(ss)
            if kind == 'door':
                # The leaf drawn perpendicular to the wall is part of the symbol; the opening is the extent along the wall.
                pass
            if hi - lo < 300 or overlaps(w, lo, hi):
                continue
            w['openings'].append({'kind': kind, 's0': lo, 's1': hi, 'evidence': 'block-on-wall:' + ins.name})
