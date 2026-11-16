"""DXF reader based on ezdxf (MIT); DWG is converted to DXF by LibreDWG's dwg2dxf in its own process."""
import math, os, shutil, subprocess, tempfile
import ezdxf
from ezdxf import recover
from ezdxf.math import Vec3
from .primitives import Seg, Arc, Text, Dim, Insert, Plan, fit_arc

MAX_ENTITIES = 80000
# $INSUNITS -> millimetres per unit
UNITS = {1: 25.4, 2: 304.8, 4: 1.0, 5: 10.0, 6: 1000.0, 14: 100.0}


class ConversionError(Exception):
    pass


def dwg_to_dxf(path, workdir, binary=None, runner=subprocess.run):
    """Runs dwg2dxf (GPL, separate executable) with a time limit and returns the DXF path."""
    binary = binary or os.environ.get('DWG2DXF_BIN') or shutil.which('dwg2dxf') or '/opt/libredwg/bin/dwg2dxf'
    out = os.path.join(workdir, 'converted.dxf')
    try:
        runner([binary, '-y', '-o', out, path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90, check=False,
               cwd=workdir, env={'PATH': '/usr/bin:/bin', 'HOME': workdir})
    except (OSError, subprocess.TimeoutExpired) as e:
        raise ConversionError('dwg_conversion_failed') from e
    if not os.path.exists(out) or os.path.getsize(out) < 100:
        raise ConversionError('dwg_conversion_failed')
    return out


def _text_of(e):
    if e.dxftype() == 'MTEXT':
        return e.plain_text().replace('\n', ' ').strip()
    return (e.dxf.get('text') or '').strip()


def _text_centre(e):
    if e.dxftype() == 'MTEXT':
        p = e.dxf.insert
        return (p.x, p.y), e.dxf.get('rotation', 0.0) % 180, e.dxf.get('char_height', 0.0)
    h = e.dxf.get('height', 0.0)
    ang = e.dxf.get('rotation', 0.0)
    p = e.dxf.align_point if e.dxf.get('halign', 0) or e.dxf.get('valign', 0) else e.dxf.insert
    try:
        from ezdxf.tools import text_size
        w = text_size.text_size(e).width
    except Exception:
        w = len(_text_of(e)) * h * 0.7
    u = (math.cos(math.radians(ang)), math.sin(math.radians(ang)))
    n = (-u[1], u[0])
    halign, valign = e.dxf.get('halign', 0), e.dxf.get('valign', 0)
    dx = {0: w / 2, 1: 0, 2: -w / 2, 4: 0}.get(halign, 0)
    dy = {0: h / 2, 1: h / 2, 2: 0, 3: -h / 2}.get(valign, h / 2)
    if halign == 4:
        dy = 0
    return (p.x + u[0] * dx + n[0] * dy, p.y + u[1] * dx + n[1] * dy), ang % 180, h


def _add(plan, e, layer, block):
    t = e.dxftype()
    if t == 'LINE':
        a, b = e.dxf.start, e.dxf.end
        plan.segs.append(Seg((a.x, a.y), (b.x, b.y), layer, block))
    elif t in ('LWPOLYLINE', 'POLYLINE'):
        try:
            for v in e.virtual_entities():
                _add(plan, v, layer, block)
        except Exception:
            pass
    elif t == 'ARC':
        c = e.dxf.center
        plan.arcs.append(Arc((c.x, c.y), e.dxf.radius, e.dxf.start_angle % 360, e.dxf.end_angle % 360, layer, block))
    elif t in ('TEXT', 'MTEXT', 'ATTRIB'):
        s = _text_of(e)
        if s:
            at, ang, h = _text_centre(e)
            plan.texts.append(Text(s, at, ang, h, layer))


def read_dxf(path, max_entities=MAX_ENTITIES):
    try:
        doc, auditor = recover.readfile(path)
    except (IOError, ezdxf.DXFStructureError) as e:
        raise ConversionError('dxf_unreadable') from e
    msp = doc.modelspace()
    plan = Plan('dxf')
    plan.unit_mm = UNITS.get(int(doc.header.get('$INSUNITS', 0) or 0))
    count = 0
    for e in msp:
        count += 1
        if count > max_entities:
            plan.notes.append('too_many_entities')
            break
        layer = e.dxf.get('layer', '0')
        t = e.dxftype()
        if t == 'DIMENSION':
            try:
                dt = e.dimtype
                if dt in (0, 1):  # linear / aligned
                    p1, p2 = e.dxf.defpoint2, e.dxf.defpoint3
                    m = e.get_measurement()
                    if isinstance(m, Vec3):
                        m = m.magnitude
                    label = (e.dxf.get('text') or '').strip()
                    if label in ('<>', ' '):
                        label = ''
                    # Linear dimensions measure along their rotation; project the two points accordingly.
                    if dt == 0:
                        ang = math.radians(e.dxf.get('angle', 0.0))
                        u = (math.cos(ang), math.sin(ang))
                        q2 = (p1.x + u[0] * m * (1 if (p2.x - p1.x) * u[0] + (p2.y - p1.y) * u[1] >= 0 else -1),
                              p1.y + u[1] * m * (1 if (p2.x - p1.x) * u[0] + (p2.y - p1.y) * u[1] >= 0 else -1))
                    else:
                        q2 = (p2.x, p2.y)
                    plan.dims.append(Dim((p1.x, p1.y), q2, float(m), label))
            except Exception:
                pass
            continue
        if t == 'INSERT':
            name = e.dxf.name
            corners = []
            try:
                for v in e.virtual_entities():
                    vt = v.dxftype()
                    if vt == 'INSERT':
                        for w in v.virtual_entities():
                            _add(plan, w, layer, name)
                        continue
                    _add(plan, v, layer, name)
                    if vt == 'LINE':
                        corners += [(v.dxf.start.x, v.dxf.start.y), (v.dxf.end.x, v.dxf.end.y)]
                    elif vt == 'ARC':
                        a = plan.arcs[-1]
                        corners += [a.point(a.start), a.point(a.end), a.c]
                    elif vt in ('LWPOLYLINE', 'POLYLINE'):
                        corners += [(p[0], p[1]) for p in v.vertices()] if vt == 'LWPOLYLINE' else [(p.dxf.location.x, p.dxf.location.y) for p in v.vertices]
            except Exception:
                continue
            ins = e.dxf.insert
            plan.inserts.append(Insert(name, (ins.x, ins.y), e.dxf.get('rotation', 0.0), corners, layer))
            continue
        if t == 'CIRCLE':
            continue
        if t in ('SPLINE', 'ELLIPSE'):
            try:
                pts = [(p.x, p.y) for p in e.flattening(0.01 * max(1.0, e.dxf.get('major_axis', Vec3(1, 0, 0)).magnitude if t == 'ELLIPSE' else 1.0))]
            except Exception:
                continue
            arc = fit_arc(pts[::max(1, len(pts) // 12)] + [pts[-1]]) if len(pts) > 2 else None
            if arc:
                arc.layer = layer
                plan.arcs.append(arc)
            continue
        _add(plan, e, layer, '')
    return plan


def read_dwg(path, workdir, **kw):
    return read_dxf(dwg_to_dxf(path, workdir, **kw))
