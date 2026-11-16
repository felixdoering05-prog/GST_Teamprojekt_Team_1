"""Common drawing primitives of DXF and PDF plans, in drawing units with y pointing up."""
from dataclasses import dataclass, field
import math


@dataclass
class Seg:
    a: tuple
    b: tuple
    layer: str = ''
    block: str = ''          # name of the block (DXF INSERT) the segment came from
    width: float = 0.0       # PDF line width in points (0 = unknown)

    @property
    def length(self):
        return math.dist(self.a, self.b)

    @property
    def angle(self):
        """Direction in degrees, 0 <= angle < 180."""
        return math.degrees(math.atan2(self.b[1] - self.a[1], self.b[0] - self.a[0])) % 180.0


@dataclass
class Arc:
    c: tuple
    r: float
    start: float             # degrees, counter-clockwise
    end: float
    layer: str = ''
    block: str = ''

    @property
    def sweep(self):
        return (self.end - self.start) % 360.0 or 360.0

    def point(self, deg):
        return (self.c[0] + self.r * math.cos(math.radians(deg)), self.c[1] + self.r * math.sin(math.radians(deg)))


@dataclass
class Text:
    text: str
    at: tuple                # centre of the text box
    angle: float = 0.0       # reading direction in degrees
    height: float = 0.0
    layer: str = ''


@dataclass
class Dim:
    """A real dimension entity (DXF): two measured points and an optional labelled text."""
    a: tuple
    b: tuple
    measured: float          # drawing units
    label: str = ''          # text override; '' means the CAD measurement is shown


@dataclass
class Insert:
    name: str
    at: tuple
    rotation: float
    corners: list            # world-space bounding box corners of the block geometry
    layer: str = ''


@dataclass
class Plan:
    """Raw content of one plan page/drawing before scaling."""
    kind: str                # 'dxf' | 'pdf'
    segs: list = field(default_factory=list)
    arcs: list = field(default_factory=list)
    texts: list = field(default_factory=list)
    dims: list = field(default_factory=list)
    inserts: list = field(default_factory=list)
    unit_mm: float = None    # mm per drawing unit if declared by the file (DXF $INSUNITS)
    page: int = 0
    notes: list = field(default_factory=list)


def bezier_points(p0, p1, p2, p3, steps=8):
    out = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        out.append((u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
                    u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]))
    return out


def fit_arc(points):
    """Least-squares circle through sampled points; returns Arc or None if not circular."""
    if len(points) < 3:
        return None
    # Kasa fit
    n = len(points)
    sx = sum(p[0] for p in points) / n
    sy = sum(p[1] for p in points) / n
    u = [(p[0] - sx, p[1] - sy) for p in points]
    suu = sum(a * a for a, b in u); svv = sum(b * b for a, b in u); suv = sum(a * b for a, b in u)
    suuu = sum(a ** 3 for a, b in u); svvv = sum(b ** 3 for a, b in u)
    suvv = sum(a * b * b for a, b in u); svuu = sum(b * a * a for a, b in u)
    det = suu * svv - suv * suv
    if abs(det) < 1e-12:
        return None
    rhs1 = 0.5 * (suuu + suvv); rhs2 = 0.5 * (svvv + svuu)
    uc = (rhs1 * svv - rhs2 * suv) / det
    vc = (suu * rhs2 - suv * rhs1) / det
    c = (uc + sx, vc + sy)
    r = math.sqrt(uc * uc + vc * vc + (suu + svv) / n)
    if r <= 0 or max(abs(math.dist(p, c) - r) for p in points) > 0.03 * r:
        return None
    a0 = math.degrees(math.atan2(points[0][1] - c[1], points[0][0] - c[0])) % 360
    a1 = math.degrees(math.atan2(points[-1][1] - c[1], points[-1][0] - c[0])) % 360
    mid = points[len(points) // 2]
    am = math.degrees(math.atan2(mid[1] - c[1], mid[0] - c[0])) % 360
    # Orientation: choose start/end so that the arc runs counter-clockwise through the middle sample.
    if (am - a0) % 360 <= (a1 - a0) % 360:
        return Arc(c, r, a0, a1)
    return Arc(c, r, a1, a0)
