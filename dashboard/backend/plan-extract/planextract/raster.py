"""Floor plans from photos and scans (OpenCV, local, no AI): image -> walls, doors, windows, rooms in mm.

Goal: always deliver a plausible model, also from poor plans. Where something cannot be measured it is estimated and
marked (scale from door widths / wall thickness / typical house size); the user can correct it in the editor.

Steps
 1. Normalise: page detection and perspective correction (phone photos), uneven light, deskew to the main direction.
 2. Ink: adaptive binarisation; page frames, title blocks and small text are removed for the wall search.
 3. Wall mask: filled walls stay, outlined/hatched walls are filled between their parallel face lines, thin lines
    (dimensions, furniture, text) are opened away. A sketch with single lines falls back to long strokes.
 4. Walls: axis-parallel runs -> centre line + thickness, collinear pieces joined across openings, corners and
    T-junctions closed, isolated fragments dropped.
 5. Openings: cross sections along every wall: no ink -> opening (door if a quarter arc fits), thin lines inside the
    wall band -> window.
 6. Scale: given dimensions (Gemini reads labelled overall dimensions) or a user reference; otherwise estimated.
 7. Tidy and output in the Phase-1 level format, so build.py / ifc_writer.py are reused unchanged.
"""
import math
import numpy as np
import cv2
from shapely.geometry import LineString
from .rooms import find_rooms

MAX_PIXELS = 30_000_000
WORK_SIDE = 2200
DOOR_MM = 900.0          # typical clear door opening (885-1010 in German plans)
OUTER_WALL_MM = 320.0    # typical outer wall (300-365)
TYPICAL_AREA_M2 = 110.0  # typical footprint when nothing else is known
DOOR_HEIGHT, WINDOW_SILL, WINDOW_HEIGHT = 2010.0, 900.0, 1350.0
OUTER_STD = [240.0, 300.0, 365.0, 425.0, 490.0]
INNER_STD = [100.0, 115.0, 175.0, 240.0]


class RasterError(Exception):
    pass


# ------------------------------------------------------------------ 1. load and normalise

def load_image(path):
    data = np.fromfile(path, dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise RasterError('unreadable')
    if img.shape[0] * img.shape[1] > MAX_PIXELS:
        raise RasterError('too_large')
    return img


def _order(p):
    s, d = p.sum(axis=1), np.diff(p, axis=1).ravel()
    return np.float32([p[s.argmin()], p[d.argmin()], p[s.argmax()], p[d.argmax()]])


def find_page(gray):
    """Bright sheet on a darker background -> 4 corners, or None (scan, screenshot, crop)."""
    h, w = gray.shape
    small = cv2.GaussianBlur(gray, (0, 0), max(2, min(h, w) / 300))
    _, m = cv2.threshold(small, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
    contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    c = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(c)
    if area < 0.2 * h * w or area > 0.97 * h * w:
        return None
    hull = cv2.convexHull(c)
    for eps in (0.01, 0.02, 0.03, 0.05):
        q = cv2.approxPolyDP(hull, eps * cv2.arcLength(hull, True), True)
        if len(q) == 4:
            break
    else:
        return None
    # Page must not be the whole frame: some background must be visible outside the quadrilateral.
    mean_in = cv2.mean(gray, mask=m)[0]
    mean_out = cv2.mean(gray, mask=255 - m)[0]
    if mean_in - mean_out < 25:
        return None
    return _order(q[:, 0].astype(np.float32))


def normalise(img):
    """Returns (gray normalised, matrix original->normalised, notes)."""
    notes = []
    h, w = img.shape[:2]
    f = min(1.0, WORK_SIDE / max(h, w))
    M = np.diag([f, f, 1.0])
    if f < 1:
        img = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    page = find_page(gray)
    if page is not None:
        wid = int(max(np.linalg.norm(page[1] - page[0]), np.linalg.norm(page[2] - page[3])))
        hei = int(max(np.linalg.norm(page[3] - page[0]), np.linalg.norm(page[2] - page[1])))
        target = np.float32([[0, 0], [wid - 1, 0], [wid - 1, hei - 1], [0, hei - 1]])
        P = cv2.getPerspectiveTransform(page, target)
        gray = cv2.warpPerspective(gray, P, (wid, hei), flags=cv2.INTER_LINEAR, borderValue=255)
        M = P @ M
        notes.append('Foto: Blatt erkannt und entzerrt.')
    # Even out light and shadows: divide by the local paper brightness.
    k = max(15, (min(gray.shape) // 25) | 1)
    bg = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    bg = cv2.GaussianBlur(bg, (0, 0), k / 3)
    norm = np.clip(gray.astype(np.float32) / np.maximum(bg.astype(np.float32), 1) * 255, 0, 255).astype(np.uint8)
    angle = _skew(norm)
    if abs(angle) > 0.2:
        hh, ww = norm.shape
        R = cv2.getRotationMatrix2D((ww / 2, hh / 2), angle, 1.0)
        cos, sin = abs(R[0, 0]), abs(R[0, 1])
        nw, nh = int(hh * sin + ww * cos), int(hh * cos + ww * sin)
        R[0, 2] += nw / 2 - ww / 2
        R[1, 2] += nh / 2 - hh / 2
        norm = cv2.warpAffine(norm, R, (nw, nh), flags=cv2.INTER_LINEAR, borderValue=255)
        M = np.vstack([R, [0, 0, 1]]) @ M
        notes.append(f'Plan um {angle:.1f}° gerade gedreht.')
    rect = _keystone(norm)
    if rect is not None:
        K, size = rect
        norm = cv2.warpPerspective(norm, K, size, flags=cv2.INTER_LINEAR, borderValue=255)
        M = K @ M
        notes.append('Plan nach seinen Außenlinien rechtwinklig entzerrt.')
    return norm, M, notes


def _line_eq(x1, y1, x2, y2):
    x1, y1, x2, y2 = float(x1), float(y1), float(x2), float(y2)
    a, b = y2 - y1, x1 - x2
    return a, b, a * x1 + b * y1


def _cross(l1, l2):
    a1, b1, c1 = l1
    a2, b2, c2 = l2
    d = a1 * b2 - a2 * b1
    if abs(d) < 1e-9:
        return None
    return ((c1 * b2 - c2 * b1) / d, (a1 * c2 - a2 * c1) / d)


def _keystone(norm):
    """Residual perspective of a photo: the outermost long horizontal/vertical lines (outer walls or frame) should
    form a rectangle. Returns (homography, size) or None when the plan is already rectangular."""
    ink = _ink(norm)
    h, w = ink.shape
    L = int(0.25 * min(h, w))
    lines = cv2.HoughLinesP(ink, 1, np.pi / 720, max(60, L // 2), minLineLength=L, maxLineGap=max(4, L // 30))
    if lines is None:
        return None
    hs, vs = [], []
    for x1, y1, x2, y2 in lines.reshape(-1, 4):
        a = math.degrees(math.atan2(y2 - y1, x2 - x1)) % 180
        if a < 8 or a > 172:
            hs.append((x1, y1, x2, y2))
        elif 82 < a < 98:
            vs.append((x1, y1, x2, y2))
    if len(hs) < 2 or len(vs) < 2:
        return None
    top = min(hs, key=lambda l: (l[1] + l[3]) / 2)
    bottom = max(hs, key=lambda l: (l[1] + l[3]) / 2)
    left = min(vs, key=lambda l: (l[0] + l[2]) / 2)
    right = max(vs, key=lambda l: (l[0] + l[2]) / 2)
    if (bottom[1] + bottom[3]) / 2 - (top[1] + top[3]) / 2 < 0.25 * h or (right[0] + right[2]) / 2 - (left[0] + left[2]) / 2 < 0.25 * w:
        return None
    T, B, Lf, R = (_line_eq(*l) for l in (top, bottom, left, right))
    pts = [_cross(T, Lf), _cross(T, R), _cross(B, R), _cross(B, Lf)]
    if any(p is None for p in pts):
        return None
    q = np.float32(pts)

    def ang(p0, p1, p2):
        v1, v2 = p0 - p1, p2 - p1
        return math.degrees(math.acos(np.clip(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9), -1, 1)))
    dev = max(abs(ang(q[i - 1], q[i], q[(i + 1) % 4]) - 90) for i in range(4))
    if dev < 0.4 or dev > 12:
        return None
    wid = (np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2
    hei = (np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2
    x0, y0 = q[0]
    dst = np.float32([[x0, y0], [x0 + wid, y0], [x0 + wid, y0 + hei], [x0, y0 + hei]])
    K = cv2.getPerspectiveTransform(q, dst)
    corners = cv2.perspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2), K).reshape(-1, 2)
    mn = corners.min(axis=0)
    shift = np.array([[1, 0, -min(0, mn[0])], [0, 1, -min(0, mn[1])], [0, 0, 1]])
    K = shift @ K
    mx = cv2.perspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2), K).reshape(-1, 2).max(axis=0)
    size = (int(min(mx[0], 1.3 * w)), int(min(mx[1], 1.3 * h)))
    return K, size


def _ink(norm):
    """Ink mask: dark relative to the paper. Robust for grey copies and photos."""
    paper, dark = np.percentile(norm, 50), np.percentile(norm, 0.5)
    t = min(230, max(60, paper - max(22, 0.3 * (paper - dark))))
    return (norm < t).astype(np.uint8) * 255


def _skew(norm):
    ink = _ink(norm)
    lines = cv2.HoughLinesP(ink, 1, np.pi / 720, 80, minLineLength=max(40, min(ink.shape) // 12), maxLineGap=4)
    if lines is None:
        return 0.0
    angles, weights = [], []
    for x1, y1, x2, y2 in lines.reshape(-1, 4):
        a = (math.degrees(math.atan2(y2 - y1, x2 - x1)) + 45) % 90 - 45
        angles.append(a)
        weights.append(math.hypot(x2 - x1, y2 - y1))
    hist, edges = np.histogram(angles, bins=180, range=(-45, 45), weights=weights)
    i = int(hist.argmax())
    sel = [(a, w) for a, w in zip(angles, weights) if edges[i] - 0.5 <= a <= edges[i + 1] + 0.5]
    a = sum(a * w for a, w in sel) / max(sum(w for a, w in sel), 1e-9)
    return float(a) if abs(a) <= 30 else 0.0


# ------------------------------------------------------------------ 2. ink cleaning

def remove_frames(ink):
    """Page frames: long thin lines near the sheet border spanning most of it. Only those pixels are removed, so a
    building connected to the frame through dimension lines stays. A removed outer wall face is restored later by
    add_missing_outline (the frame test is deliberately strict)."""
    h, w = ink.shape
    out = ink.copy()
    thin = max(3, int(0.004 * max(h, w)))
    for axis in ('h', 'v'):
        span = int((w if axis == 'h' else h) * 0.8)
        k = _ker(1, span) if axis == 'h' else _ker(span, 1)
        long_ = cv2.morphologyEx(ink, cv2.MORPH_OPEN, k)
        n, lab, st, _ = cv2.connectedComponentsWithStats(long_, connectivity=8)
        for i in range(1, n):
            x, y, bw, bh, area = st[i]
            t = area / max(bw if axis == 'h' else bh, 1)
            pos = (y + bh / 2) / h if axis == 'h' else (x + bw / 2) / w
            if t <= thin and (pos < 0.12 or pos > 0.88):
                sel = (lab == i).astype(np.uint8) * 255
                out[cv2.dilate(sel, _ker(3, 3)) > 0] = 0
    return out


def content_box(ink):
    ys, xs = np.nonzero(ink)
    if not xs.size:
        return None
    # Robust against a few stray specks: use percentiles.
    return (np.percentile(xs, 0.5), np.percentile(ys, 0.5), np.percentile(xs, 99.5), np.percentile(ys, 99.5))


def drop_small(ink, max_side):
    """Removes isolated small components (text, symbols, speckles)."""
    n, lab, st, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    keep = np.zeros(n, np.uint8)
    for i in range(1, n):
        x, y, bw, bh, area = st[i]
        if max(bw, bh) >= max_side:
            keep[i] = 255
    return keep[lab]


# ------------------------------------------------------------------ 3. wall mask

def _ker(rows, cols):
    return np.ones((max(1, int(rows)), max(1, int(cols))), np.uint8)


def wall_mask(ink, u):
    """u = rough px per mm. Returns mask of wall bands."""
    clean = drop_small(ink, max(6, 500 * u))
    L = max(9, int(350 * u))
    H = cv2.morphologyEx(clean, cv2.MORPH_OPEN, _ker(1, L))
    V = cv2.morphologyEx(clean, cv2.MORPH_OPEN, _ker(L, 1))
    kb = max(3, int(520 * u))
    Hf = cv2.morphologyEx(H, cv2.MORPH_CLOSE, _ker(kb, 1))
    Vf = cv2.morphologyEx(V, cv2.MORPH_CLOSE, _ker(1, kb))
    filled = cv2.bitwise_or(clean, cv2.bitwise_or(Hf, Vf))
    # Fill hatching / small holes inside wall bands.
    filled = cv2.morphologyEx(filled, cv2.MORPH_CLOSE, _ker(3, 3))
    s = max(2, int(round(70 * u)))
    thick = cv2.morphologyEx(filled, cv2.MORPH_OPEN, _ker(s, s))
    return thick, clean


def wall_thickness_px(ink, size):
    """Most frequent wall thickness in px, measured without knowing the scale: width of thick strokes (filled walls)
    and the outer distance of two adjacent thin parallel lines (outlined walls). Pen width is measured first, so
    blurred lines in photos do not count as filled walls. Returns (px or None, share of thick strokes)."""
    clean = drop_small(ink, max(8, int(0.03 * size)))
    Lp = max(15, int(0.03 * size))
    tmax = max(6, int(0.07 * size))
    runs = []   # per column: (starts, ends)
    for m in (cv2.morphologyEx(clean, cv2.MORPH_OPEN, _ker(1, Lp)), cv2.morphologyEx(clean, cv2.MORPH_OPEN, _ker(Lp, 1)).T):
        for x in np.flatnonzero(m.any(axis=0))[::2]:
            on = np.flatnonzero(m[:, x])
            br = np.flatnonzero(np.diff(on) > 1)
            runs.append((np.r_[on[0], on[br + 1]], np.r_[on[br], on[-1]]))
    if not runs:
        return [], 0.0
    lengths = np.concatenate([e - a + 1 for a, e in runs])
    lw = max(1, int(np.bincount(np.minimum(lengths, tmax)).argmax()))
    hist = np.zeros(tmax + 1)
    solid = 0.0
    for starts, ends in runs:
        L = ends - starts + 1
        for l in L[(L >= max(3, 2.5 * lw)) & (L <= tmax)]:
            hist[l] += 1.5
            solid += 1.5
        thin = L <= max(2, 1.6 * lw)
        for i in np.flatnonzero(thin[:-1] & thin[1:]):
            d = ends[i + 1] - starts[i] + 1
            if d <= tmax:
                hist[d] += 1
    if hist.sum() < 20:
        return [], 0.0
    sm = np.convolve(hist, np.ones(3) / 3, mode='same')
    sm[:max(3, int(2.5 * lw))] = 0
    k = int(sm.argmax())
    if sm[k] <= 0:
        return [], 0.0
    # Strong peaks (outer walls, inner walls, sometimes dimension chains): the caller tries each.
    peaks = sorted(((sm[i], i) for i in range(1, len(sm) - 1) if sm[i] >= sm[i - 1] and sm[i] > sm[i + 1] and sm[i] >= 0.6 * sm[k]), reverse=True)
    out = []
    for v, i in peaks:
        if all(abs(i / j - 1) > 0.25 for j in out):
            out.append(float(i))
    return out[:3], solid / max(hist.sum(), 1)


# ------------------------------------------------------------------ 4. walls

def runs_from_mask(mask, u, min_len_mm=300, text=None):
    """Axis-parallel bands of the mask. Bands with text inside (between dimension lines) are not walls."""
    items = []
    # Kernel longer than any wall is thick, so perpendicular bands do not survive and corners do not merge h and v.
    L = max(7, int(min_len_mm * u), int(650 * u))
    for axis, k in (('h', _ker(1, L)), ('v', _ker(L, 1))):
        m = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)
        n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=4)
        for i in range(1, n):
            x, y, bw, bh, area = st[i]
            length, span = (bw, bh) if axis == 'h' else (bh, bw)
            t = area / max(length, 1)
            if length < L or t < max(1.5, 40 * u) or t > 900 * u or area / (bw * bh) < 0.5:
                continue
            ys, xs = np.nonzero(lab[y:y + bh, x:x + bw] == i)
            if text is not None and np.count_nonzero(text[y:y + bh, x:x + bw]) > 0.015 * area:
                continue
            off = (y + ys.mean()) if axis == 'h' else (x + xs.mean())
            a, b = (x, x + bw - 1) if axis == 'h' else (y, y + bh - 1)
            items.append({'axis': axis, 'off': float(off), 's0': float(a), 's1': float(b), 't': float(t)})
    return items


def join_runs(items, u):
    walls = []
    gap_max = 2600 * u
    for axis in ('h', 'v'):
        group = sorted([i for i in items if i['axis'] == axis], key=lambda i: i['off'])
        clusters = []
        for it in group:
            c = next((c for c in clusters if abs(c['off'] - it['off']) <= max(3, 0.3 * min(c['t'], it['t']))), None)
            if c is None:
                clusters.append({'off': it['off'], 't': it['t'], 'items': [it]})
            else:
                c['items'].append(it)
                tot = sum(i['s1'] - i['s0'] for i in c['items'])
                c['off'] = sum(i['off'] * (i['s1'] - i['s0']) for i in c['items']) / tot
                c['t'] = max(i['t'] for i in c['items'])
        for c in clusters:
            parts = sorted(c['items'], key=lambda i: i['s0'])
            cur = dict(parts[0])
            cur['pieces'] = [(cur['s0'], cur['s1'], cur['t'])]
            for nx in parts[1:]:
                if nx['s0'] - cur['s1'] <= gap_max:
                    cur['s1'] = max(cur['s1'], nx['s1'])
                    cur['pieces'].append((nx['s0'], nx['s1'], nx['t']))
                else:
                    walls.append(cur)
                    cur = dict(nx)
                    cur['pieces'] = [(cur['s0'], cur['s1'], cur['t'])]
            walls.append(cur)
    for w in walls:
        w['off'] = next(c['off'] for c in [{'off': w['off']}])
        lens = [(p[1] - p[0], p[2]) for p in w['pieces']]
        w['t'] = float(np.median(np.repeat([t for l, t in lens], [max(1, int(l)) for l, t in lens])))
    return walls


def close_corners(walls, u):
    """Extends or trims wall ends to the centre line of a perpendicular wall nearby (corners, T-junctions)."""
    reach = 900 * u
    for w in walls:
        for end in ('s0', 's1'):
            best = None
            for o in walls:
                if o['axis'] == w['axis']:
                    continue
                tol = max(o['t'], w['t']) + 3
                # perpendicular wall must span across this wall's line
                if not (o['s0'] - tol <= w['off'] <= o['s1'] + tol):
                    continue
                d = o['off'] - w[end]
                if abs(d) <= reach and (best is None or abs(d) < abs(best)):
                    # Only extend outward from the wall end or trim a small overshoot.
                    outward = d < 0 if end == 's0' else d > 0
                    if outward or abs(d) <= tol:
                        best = d
            if best is not None:
                w[end] += best
        if w['s1'] < w['s0']:
            w['s0'], w['s1'] = w['s1'], w['s0']
    # Perpendicular walls whose end lies just short of this wall's span get it extended (L-corners).
    for w in walls:
        for o in walls:
            if o['axis'] == w['axis']:
                continue
            for end in ('s0', 's1'):
                if abs(o[end] - w['off']) <= max(o['t'], w['t']) + 3:
                    if w['s0'] - reach <= o['off'] < w['s0']:
                        w['s0'] = o['off']
                    elif w['s1'] < o['off'] <= w['s1'] + reach:
                        w['s1'] = o['off']
    return [w for w in walls if w['s1'] - w['s0'] >= 250 * u]


def connected(walls):
    """Keeps the largest group of touching walls (drops legends, dimension fragments, stray strokes)."""
    n = len(walls)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(n):
        for j in range(i + 1, n):
            a, b = walls[i], walls[j]
            tol = max(a['t'], b['t']) + 4
            if a['axis'] == b['axis']:
                touch = abs(a['off'] - b['off']) <= tol and a['s0'] <= b['s1'] + tol and b['s0'] <= a['s1'] + tol
            else:
                touch = a['s0'] - tol <= b['off'] <= a['s1'] + tol and b['s0'] - tol <= a['off'] <= b['s1'] + tol
            if touch:
                parent[find(i)] = find(j)
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(walls[i])
    if not groups:
        return []
    return max(groups.values(), key=lambda g: sum(w['s1'] - w['s0'] for w in g))


# ------------------------------------------------------------------ 5. openings

def _band(ink, w, s0, s1, pad):
    o, t = w['off'], w['t']
    a, b = int(max(0, math.floor(o - t / 2 - pad))), int(math.ceil(o + t / 2 + pad)) + 1
    s0, s1 = int(max(0, s0)), int(s1) + 1
    if w['axis'] == 'h':
        return ink[a:b, s0:s1]          # rows = across, cols = along
    return ink[s0:s1, a:b].T


def _runs(col):
    on = np.flatnonzero(col)
    if not on.size:
        return 0
    return 1 + int(np.sum(np.diff(on) > 1))


def _longest(col):
    on = np.flatnonzero(col)
    if not on.size:
        return 0
    br = np.flatnonzero(np.diff(on) > 1)
    starts = np.r_[on[0], on[br + 1]]
    ends = np.r_[on[br], on[-1]]
    return int((ends - starts).max()) + 1


def profile(ink, w, u):
    """Per position along the wall: 'wall', 'glass', 'empty'."""
    band = _band(ink, w, w['s0'], w['s1'], max(2, 20 * u, 0.2 * w['t'] + 1)) > 0
    if band.size == 0:
        return np.array([], dtype='<U5'), 0
    runs = np.array([_runs(band[:, i]) for i in range(band.shape[1])])
    # Filled wall: one ink run covering most of the wall thickness (robust to a slightly shifted centre line).
    longest = np.array([_longest(band[:, i]) for i in range(band.shape[1])])
    solid = longest >= 0.6 * w['t']
    filled_style = solid.mean() > 0.4
    cls = np.full(band.shape[1], 'wall', dtype='<U5')
    if filled_style:
        cls[(~solid) & (runs >= 1)] = 'glass'
        cls[runs == 0] = 'empty'
    else:
        cls[runs >= 3] = 'glass'
        cls[runs <= 1] = 'empty'
    # Smooth: merge stretches shorter than 120 mm into the neighbour.
    m = max(2, int(120 * u))
    out = cls.copy()
    i = 0
    while i < len(out):
        j = i
        while j < len(out) and out[j] == out[i]:
            j += 1
        if j - i < m:
            left = out[i - 1] if i > 0 else None
            right = out[j] if j < len(out) else None
            fill = left or right
            if fill:
                out[i:j] = fill
        i = j
    return out, int(w['s0'])


def door_arc(ink, w, a, b):
    """Looks for a quarter circle hinged at one jamb on either side of the wall (door swing)."""
    r = b - a
    if r < 3:
        return False
    dil = cv2.dilate(ink, np.ones((3, 3), np.uint8))
    h, wd = ink.shape
    best = 0.0
    for hinge in (a, b):
        for side in (-1, 1):
            face = w['off'] + side * w['t'] / 2
            hits = tot = 0
            for k in range(1, 12):
                ang = math.pi / 2 * k / 12
                along = hinge + (r * math.cos(ang) if hinge == a else -r * math.cos(ang))
                across = face + side * r * math.sin(ang)
                x, y = (along, across) if w['axis'] == 'h' else (across, along)
                xi, yi = int(round(x)), int(round(y))
                if 0 <= xi < wd and 0 <= yi < h:
                    tot += 1
                    hits += dil[yi, xi] > 0
            if tot >= 8:
                best = max(best, hits / tot)
    return best >= 0.6


def openings_of(ink, w, u):
    cls, base = profile(ink, w, u)
    out = []
    i = 0
    while i < len(cls):
        j = i
        while j < len(cls) and cls[j] == cls[i]:
            j += 1
        kind = cls[i]
        a, b = base + i, base + j - 1
        length_mm = (b - a) / u
        # ignore the wall ends (corner areas)
        inner = a > w['s0'] + w['t'] * 0.6 and b < w['s1'] - w['t'] * 0.6
        if kind == 'empty' and 450 <= length_mm <= 2600 and inner:
            out.append({'s0': a, 's1': b, 'kind': 'door' if door_arc(ink, w, a, b) else 'opening'})
        elif kind == 'glass' and 400 <= length_mm <= 4000 and inner:
            out.append({'s0': a, 's1': b, 'kind': 'window'})
        i = j
    for o in out:
        o['evidence'] = {'door': 'arc', 'opening': 'gap', 'window': 'glass_lines'}[o['kind']]
    return out


# ------------------------------------------------------------------ 6. scale

def _snap(v, std):
    return min(std, key=lambda s: abs(s - v))


def estimate_scale(walls, ops, u_guess):
    """mm per px estimated from doors, wall thickness or typical house size. Returns (mm_per_px, method)."""
    xs = [w['off'] for w in walls if w['axis'] == 'v'] + [p for w in walls if w['axis'] == 'h' for p in (w['s0'], w['s1'])]
    ys = [w['off'] for w in walls if w['axis'] == 'h'] + [p for w in walls if w['axis'] == 'v' for p in (w['s0'], w['s1'])]
    wpx, dpx = (max(xs) - min(xs)), (max(ys) - min(ys))
    cands = []
    doors = [o['s1'] - o['s0'] for o in ops if o['kind'] == 'door']
    if len(doors) >= 2 or (doors and len(walls) < 8):
        cands.append((DOOR_MM / float(np.median(doors)), 'Türbreiten'))
    outer = outer_walls(walls)
    if outer and not drawn_lines(walls):
        t = float(np.median([w['t'] for w in outer]))
        cands.append((OUTER_WALL_MM / t, 'Wandstärke'))
    cands.append((math.sqrt(TYPICAL_AREA_M2 * 1e6 / max(wpx * dpx, 1)), 'übliche Hausgröße'))

    def plausible(s):
        W, D = wpx * s, dpx * s
        return 3500 <= W <= 40000 and 3500 <= D <= 40000 and 25e6 <= W * D <= 900e6

    door = next((c for c in cands if c[1] == 'Türbreiten'), None)
    wall = next((c for c in cands if c[1] == 'Wandstärke'), None)
    if door and wall and 0.6 <= door[0] / wall[0] <= 1.6:
        s = math.sqrt(door[0] * wall[0])
        if plausible(s):
            return s, 'geschätzt aus Türbreiten und Wandstärke'
    for s, name in cands:
        if plausible(s):
            return s, f'geschätzt aus {name}'
    return cands[-1][0], 'geschätzt aus üblicher Hausgröße'


def outer_walls(walls):
    if not walls:
        return []
    x0 = min(w['off'] for w in walls if w['axis'] == 'v') if any(w['axis'] == 'v' for w in walls) else None
    x1 = max(w['off'] for w in walls if w['axis'] == 'v') if x0 is not None else None
    y0 = min(w['off'] for w in walls if w['axis'] == 'h') if any(w['axis'] == 'h' for w in walls) else None
    y1 = max(w['off'] for w in walls if w['axis'] == 'h') if y0 is not None else None
    res = []
    for w in walls:
        ref = (y0, y1) if w['axis'] == 'h' else (x0, x1)
        if any(r is not None and abs(w['off'] - r) <= w['t'] for r in ref):
            res.append(w)
    return res


# ------------------------------------------------------------------ 7. tidy and output

def add_missing_outline(walls, u):
    """If the outer ring is not closed, add the missing sides of the bounding rectangle (marked as estimate)."""
    if not walls:
        return walls, False
    t = float(np.median([w['t'] for w in outer_walls(walls)] or [w['t'] for w in walls]))
    xs = [w['off'] for w in walls if w['axis'] == 'v'] + [p for w in walls if w['axis'] == 'h' for p in (w['s0'], w['s1'])]
    ys = [w['off'] for w in walls if w['axis'] == 'h'] + [p for w in walls if w['axis'] == 'v' for p in (w['s0'], w['s1'])]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    added = False
    for axis, off, s0, s1 in (('h', y0, x0, x1), ('h', y1, x0, x1), ('v', x0, y0, y1), ('v', x1, y0, y1)):
        same = [w for w in walls if w['axis'] == axis and abs(w['off'] - off) <= max(w['t'], t)]
        covered = sum(max(0, min(w['s1'], s1) - max(w['s0'], s0)) for w in same)
        if covered < 0.5 * (s1 - s0):
            walls.append({'axis': axis, 'off': off, 's0': s0, 's1': s1, 't': t, 'added': True})
            added = True
    return walls, added


def _snap_offsets(walls):
    """Walls with almost the same line are aligned exactly (clean, right-angled look)."""
    for axis in ('h', 'v'):
        ws = sorted([w for w in walls if w['axis'] == axis], key=lambda w: w['off'])
        for a, b in zip(ws, ws[1:]):
            if abs(a['off'] - b['off']) <= 0.5 * min(a['t'], b['t']):
                b['off'] = a['off']


def real_walls(walls, ink, u):
    """A wall shows two face lines or a filled band over at least 45 % of its length; a dimension line with its ticks,
    a single furniture edge or a text row does not."""
    out = []
    for w in walls:
        cls, _ = profile(ink, w, u)
        if len(cls) and np.mean(cls == 'wall') >= 0.45:
            out.append(w)
    return out


def detect(norm, u):
    ink = remove_frames(_ink(norm))
    mask, clean = wall_mask(ink, u)
    items = runs_from_mask(mask, u)
    mode = 'flächig'
    walls = connected(close_corners(real_walls(join_runs(items, u), ink, u), u)) if items else []
    if len(walls) < 4:
        # Sketch: single lines. Long strokes become walls with an assumed thickness.
        lines = drop_small(clean, max(8, 1500 * u))
        lines = cv2.dilate(lines, np.ones((3, 3), np.uint8))
        items = runs_from_mask(lines, u, 600)
        for it in items:
            it['t'] = max(it['t'], 2.0)
        walls = connected(close_corners(join_runs(items, u), u)) if items else []
        mode = 'Linien'
    return walls, ink, mode


def _rooms_px(walls, u):
    """Rooms of px walls, measured in approximate mm (1/u). Returns (good rooms, all rooms)."""
    s = 1.0 / u
    ws = []
    for k, w in enumerate(walls):
        a = (w['s0'] * s, w['off'] * s) if w['axis'] == 'h' else (w['off'] * s, w['s0'] * s)
        b = (w['s1'] * s, w['off'] * s) if w['axis'] == 'h' else (w['off'] * s, w['s1'] * s)
        ws.append({'id': f'W{k}', 'a': a, 'b': b, 'thickness': w['t'] * s})
    rooms, _ = find_rooms(ws, [])

    def ok(r):
        xs, ys = [p[0] for p in r['polygon']], [p[1] for p in r['polygon']]
        narrow = min(max(xs) - min(xs), max(ys) - min(ys))
        return 2.0 <= r['area_m2'] <= 120 and narrow >= 900   # strips between dimension lines are not rooms
    return [r for r in rooms if ok(r)], rooms


def plausibility(walls, u, mode='flächig'):
    """How much the walls look like a house at px scale u: closed rooms of sensible size, connected walls.
    Filled/outlined walls with rooms always beat the single-line fallback."""
    if len(walls) < 3:
        return (0, -1.0)
    good, rooms = _rooms_px(walls, u)
    odd = sum(1 for w in walls if not 60 <= w['t'] / u <= 600)
    score = len(good) * 3 + min(len(walls), 40) * 0.3 - 1.5 * (len(rooms) - len(good)) - odd * 0.5
    if mode == 'flächig' and not drawn_lines(walls):
        # Real outer walls are 24-50 cm: the right px scale makes them look like that.
        t = float(np.median([w['t'] for w in outer_walls(walls)])) / u
        score -= 6 * abs(math.log(t / OUTER_WALL_MM)) / math.log(1.5)
    return (1 if mode == 'flächig' and good else 0, score)


def _extent_px(walls):
    xs = [w['off'] for w in walls if w['axis'] == 'v'] + [p for w in walls if w['axis'] == 'h' for p in (w['s0'], w['s1'])]
    ys = [w['off'] for w in walls if w['axis'] == 'h'] + [p for w in walls if w['axis'] == 'v' for p in (w['s0'], w['s1'])]
    return max(xs) - min(xs), max(ys) - min(ys)


def drawn_lines(walls):
    """Walls drawn as (double) pen strokes, not to scale: thickness tiny compared with the house (sketch)."""
    outer = outer_walls(walls) or walls
    t = float(np.median([w['t'] for w in outer]))
    return t / max(max(_extent_px(walls)), 1) < 0.012


def trim_to_footprint(walls, u):
    """Clips walls to the building: dimension extension lines and chains sticking out of the closed rooms go."""
    good, _ = _rooms_px(walls, u)
    if not good:
        return walls
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    tmax = max(w['t'] for w in walls)
    foot = unary_union([Polygon([(x * u, y * u) for x, y in r['polygon']]) for r in good]).buffer(tmax * 1.2 + 2, join_style=2)
    out = []
    for w in walls:
        a = (w['s0'], w['off']) if w['axis'] == 'h' else (w['off'], w['s0'])
        b = (w['s1'], w['off']) if w['axis'] == 'h' else (w['off'], w['s1'])
        part = LineString([a, b]).intersection(foot)
        pieces = [g for g in getattr(part, 'geoms', [part]) if not g.is_empty and g.length > 0]
        if not pieces:
            continue
        g = max(pieces, key=lambda g: g.length)
        (x0, y0), (x1, y1) = g.coords[0], g.coords[-1]
        lo, hi = (min(x0, x1), max(x0, x1)) if w['axis'] == 'h' else (min(y0, y1), max(y0, y1))
        if hi - lo >= 250 * u:
            out.append({**w, 's0': lo, 's1': hi})
    return out


def extract_raster(path, dims=None, reference=None, gray=None):
    """Returns (level, None) or (None, reason).

    dims:      {'width': mm, 'depth': mm} read from the plan (overall dimensions, e.g. by Gemini) -> scale
    reference: {'a': [x, y], 'b': [x, y], 'mm': length} in original image pixels (user marks a known distance)
    """
    if gray is None:
        img = load_image(path)
    else:
        img = gray
    norm, M, notes = normalise(img)
    ink0 = _ink(norm)
    box = content_box(remove_frames(ink0))
    if box is None:
        return None, 'no_walls'
    size = max(box[2] - box[0], box[3] - box[1])
    # The thresholds are in mm, but the px scale is unknown: try several guesses (content = 14 m, or the house only
    # fills part of the sheet) and refine with the measured outer wall thickness. Keep the most plausible result.
    base = size / 14000.0
    peaks, _ = wall_thickness_px(remove_frames(ink0), size)
    peaks = [t for t in peaks if t / size >= 0.005]
    queue = [t / OUTER_WALL_MM for t in peaks] or [base, base * 0.75, base * 1.33]
    u0 = queue[0]
    tried, best = set(), None
    while queue:
        u = queue.pop(0)
        key = round(math.log(u), 1)
        if key in tried or len(tried) >= 8:
            continue
        tried.add(key)
        walls, ink, mode = detect(norm, u)
        score = plausibility(walls, u, mode)
        if best is None or score > best[0]:
            best = (score, walls, ink, mode, u)
        outer = outer_walls(walls)
        if outer and mode == 'flächig' and not drawn_lines(walls):
            u2 = float(np.median([w['t'] for w in outer])) / OUTER_WALL_MM
            if any(0.8 <= u2 / q <= 1.25 for q in [u0] + queue) and abs(u2 / u - 1) > 0.1:
                queue.insert(0, u2)
    score, walls, ink, mode, u = best
    if len(walls) < 3:
        return None, 'no_walls'
    walls = trim_to_footprint(walls, u)
    walls, added = add_missing_outline(walls, u)
    _snap_offsets(walls)
    walls = close_corners(walls, u)
    ops = []
    for k, w in enumerate(walls):
        if w.get('added'):
            continue
        for o in openings_of(ink, w, u):
            o['wall'] = k
            ops.append(o)
    # ---- scale
    method = None
    s = None
    evidence = []
    if reference:
        a, b = cv2.perspectiveTransform(np.float32([reference['a'], reference['b']]).reshape(-1, 1, 2), M).reshape(-1, 2)
        d = float(np.linalg.norm(b - a))
        if d >= 5 and reference['mm'] > 0:
            s = reference['mm'] / d
            method = 'Strecke vom Nutzer'
            evidence.append({'label': f"{reference['mm'] / 1000:.2f} m".replace('.', ','), 'value_mm': reference['mm'], 'measured_mm': reference['mm'], 'error_pct': 0.0})
    xs = [w['off'] for w in walls if w['axis'] == 'v'] + [p for w in walls if w['axis'] == 'h' for p in (w['s0'], w['s1'])]
    ys = [w['off'] for w in walls if w['axis'] == 'h'] + [p for w in walls if w['axis'] == 'v' for p in (w['s0'], w['s1'])]
    tout = float(np.median([w['t'] for w in outer_walls(walls)] or [w['t'] for w in walls]))
    wpx, dpx = max(xs) - min(xs) + tout, max(ys) - min(ys) + tout
    if s is None and dims and (dims.get('width') or dims.get('depth')):
        r = [dims[k] / v for k, v in (('width', wpx), ('depth', dpx)) if dims.get(k)]
        if len(r) == 2 and max(r) / min(r) > 1.25:
            notes.append('Abgelesene Gesamtmaße passen nicht zueinander; Mittelwert verwendet.')
        s = float(np.mean(r))
        method = 'Gesamtmaße aus dem Plan'
    if s is None:
        s, method = estimate_scale(walls, ops, u)
        notes.append(f'Maßstab {method} – Maße sind ungefähr. Für genaue Maße im Editor eine bekannte Strecke markieren.')
    return build_level(walls, ops, s, method, evidence, norm, M, mode, added, notes), None


def build_level(walls, ops, s, method, evidence, norm, M, mode, added, notes):
    """px walls (axis, off, s0, s1, t) -> Phase-1 level in mm, origin at the lower left outer corner, y up."""
    H = norm.shape[0]
    tout = float(np.median([w['t'] for w in outer_walls(walls)] or [w['t'] for w in walls]))
    outer_ids = {id(w) for w in outer_walls(walls)}
    sketch = drawn_lines(walls)
    x0 = min(min(w['off'] for w in walls if w['axis'] == 'v'), min(w['s0'] for w in walls if w['axis'] == 'h')) - tout / 2
    y1 = max(max(w['off'] for w in walls if w['axis'] == 'h'), max(w['s1'] for w in walls if w['axis'] == 'v')) + tout / 2
    P = lambda along, off, axis: ((along - x0) * s, (y1 - off) * s) if axis == 'h' else ((off - x0) * s, (y1 - along) * s)
    out_walls, out_ops = [], []
    for k, w in enumerate(walls, 1):
        t_mm = w['t'] * s
        if mode == 'Linien' or sketch:
            t_mm = 300.0 if id(w) in outer_ids else 115.0
        else:
            t_mm = _snap(t_mm, OUTER_STD if id(w) in outer_ids else INNER_STD) if 60 <= t_mm <= 700 else min(max(t_mm, 100.0), 500.0)
        a, b = P(w['s0'], w['off'], w['axis']), P(w['s1'], w['off'], w['axis'])
        a, b = [round(a[0], 1), round(a[1], 1)], [round(b[0], 1), round(b[1], 1)]
        if a[0] > b[0] or a[1] > b[1]:
            a, b = b, a
        out_walls.append({'id': f'W{k}', 'a': a, 'b': b, 'thickness': round(t_mm, 1), 'length': round(math.dist(a, b), 1),
                          **({'estimated': True} if w.get('added') else {})})
    for o in sorted(ops, key=lambda o: (o['wall'], o['s0'])):
        w = walls[o['wall']]
        door = o['kind'] in ('door', 'opening')
        at = P((o['s0'] + o['s1']) / 2, w['off'], w['axis'])
        out_ops.append({'id': f'O{len(out_ops) + 1}', 'kind': o['kind'], 'wall': f"W{o['wall'] + 1}", 'at': [round(at[0], 1), round(at[1], 1)],
                        'width': round((o['s1'] - o['s0']) * s, 1), 'height': DOOR_HEIGHT if door else WINDOW_HEIGHT,
                        'sill': 0.0 if door else WINDOW_SILL, 'height_assumed': True, 'evidence': o['evidence']})
    rooms, outline = find_rooms(out_walls, [])
    xs = [c for w in out_walls for c in (w['a'][0] - w['thickness'] / 2, w['b'][0] + w['thickness'] / 2)]
    ys = [c for w in out_walls for c in (w['a'][1] - w['thickness'] / 2, w['b'][1] + w['thickness'] / 2)]
    boundary = [[round(x, 1), round(y, 1)] for x, y in list(outline.exterior.coords)[:-1]] if outline is not None and hasattr(outline, 'exterior') else []
    warnings = list(notes)
    if mode == 'Linien':
        warnings.append('Wände als einfache Linien gezeichnet (Skizze): Wandstärken angenommen.')
    if added:
        warnings.append('Außenwand nicht vollständig erkannt: fehlende Seite(n) ergänzt. Bitte im Editor prüfen.')
    estimated = not method.startswith('Strecke') and not method.startswith('Gesamtmaße')
    return {
        'source': {'kind': 'raster', 'page': 1},
        'scale': {'mm_per_unit': round(s, 4), 'method': method, 'ratio': None, 'evidence': evidence, 'support': len(evidence),
                  'estimated': estimated},
        'detection': f'raster-{mode}',
        'width': round(max(xs) - min(xs), 1), 'depth': round(max(ys) - min(ys), 1), 'boundary': boundary,
        'height': 2500.0, 'height_assumed': True, 'elevation': 0.0,
        'walls': out_walls, 'openings': out_ops, 'rooms': rooms, 'texts': [],
        'raster': {'mm_per_px': round(s, 4), 'origin_px': [round(x0, 2), round(y1, 2)], 'size_px': [int(norm.shape[1]), int(H)],
                   'original_to_plan': [[round(v, 8) for v in row] for row in M.tolist()]},
        'warnings': warnings,
    }


def plan_image(path, out_path, gray=None, max_side=1600):
    """Normalised plan as JPEG for the editor background; returns the px scale factor applied."""
    img = load_image(path) if gray is None else gray
    norm, M, _ = normalise(img)
    f = min(1.0, max_side / max(norm.shape))
    small = cv2.resize(norm, None, fx=f, fy=f, interpolation=cv2.INTER_AREA) if f < 1 else norm
    cv2.imwrite(out_path, small, [cv2.IMWRITE_JPEG_QUALITY, 75])
    return f


def rescale(level, factor):
    """Scales a raster level (e.g. after the overall dimensions were read). Thicknesses re-snapped."""
    def P(p):
        return [round(p[0] * factor, 1), round(p[1] * factor, 1)]
    for w in level['walls']:
        w['a'], w['b'] = P(w['a']), P(w['b'])
        w['length'] = round(w['length'] * factor, 1)
        t = w['thickness'] * factor
        w['thickness'] = round(min(max(t, 100.0), 500.0), 1)
    for o in level['openings']:
        o['at'] = P(o['at'])
        o['width'] = round(o['width'] * factor, 1)
    for r in level['rooms']:
        r['polygon'] = [P(p) for p in r['polygon']]
        r['point'] = P(r['point'])
        r['area_m2'] = round(r['area_m2'] * factor * factor, 2)
    level['boundary'] = [P(p) for p in level.get('boundary', [])]
    level['width'] = round(level['width'] * factor, 1)
    level['depth'] = round(level['depth'] * factor, 1)
    level['scale']['mm_per_unit'] = round(level['scale']['mm_per_unit'] * factor, 4)
    if 'raster' in level:
        level['raster']['mm_per_px'] = round(level['raster']['mm_per_px'] * factor, 4)
    return level
