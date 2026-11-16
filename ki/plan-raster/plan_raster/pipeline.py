import math, re, time
from pathlib import Path
import cv2
import numpy as np
from shapely.geometry import LineString
from shapely.ops import unary_union, polygonize

MAX_PIXELS = 20_000_000


def transform(points, matrix):
    return cv2.perspectiveTransform(np.array(points, dtype=np.float32).reshape(-1, 1, 2), matrix).reshape(-1, 2)


def preprocess(image, perspective=True):
    """Return normalized image and original→normalized homography (also used for calibration)."""
    h, w = image.shape[:2]
    factor = min(1., 1800 / max(h, w))
    matrix = np.diag([factor, factor, 1.]).astype(float)
    image = cv2.resize(image, None, fx=factor, fy=factor) if factor < 1 else image.copy()
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    warnings = []
    if perspective:
        # Only bright, nearly page-sized quadrilaterals. Never use dark building outlines as pages.
        mask = cv2.inRange(gray, 180, 255)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in sorted(contours, key=cv2.contourArea, reverse=True)[:1]:
            q = cv2.approxPolyDP(c, .025 * cv2.arcLength(c, True), True)
            if len(q) == 4 and cv2.contourArea(q) > .55 * gray.size:
                p = q[:, 0].astype(np.float32)
                sums, differences = p.sum(axis=1), np.diff(p, axis=1).ravel()
                p = np.array([p[sums.argmin()], p[differences.argmin()], p[sums.argmax()], p[differences.argmax()]])
                width = max(np.linalg.norm(p[1]-p[0]), np.linalg.norm(p[2]-p[3]))
                height = max(np.linalg.norm(p[3]-p[0]), np.linalg.norm(p[2]-p[1]))
                if len(np.unique(p, axis=0)) == 4 and min(width, height) > 100:
                    target = np.float32([[0,0],[width-1,0],[width-1,height-1],[0,height-1]])
                    warp = cv2.getPerspectiveTransform(p, target)
                    image = cv2.warpPerspective(image, warp, (int(width),int(height)), borderValue=(255,255,255))
                    matrix = warp @ matrix
                    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
                    warnings.append('Blattviereck automatisch entzerrt; Kalibrierung und Kontur im Debugbild prüfen.')
    gray = cv2.createCLAHE(clipLimit=2, tileGridSize=(8,8)).apply(gray)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
    lines = cv2.HoughLinesP(binary, 1, np.pi/1800, 50, minLineLength=70, maxLineGap=8)
    angle = 0.
    if lines is not None:
        angles = []
        for x1,y1,x2,y2 in lines.reshape(-1,4):
            a = (math.degrees(math.atan2(y2-y1,x2-x1))+45)%90-45
            if abs(a) <= 20: angles.append(a)
        if angles: angle=float(np.median(angles))
    if abs(angle) > .25:
        h,w=gray.shape
        affine=cv2.getRotationMatrix2D((w/2,h/2), angle, 1)
        image=cv2.warpAffine(image,affine,(w,h),borderValue=(255,255,255))
        matrix=np.vstack([affine,[0,0,1]]) @ matrix
        gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
        _,binary=cv2.threshold(gray,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
    return image, binary, matrix, warnings, angle


def skeleton(mask):
    result=np.zeros_like(mask); work=mask.copy()
    kernel=cv2.getStructuringElement(cv2.MORPH_CROSS,(3,3))
    for _ in range(100):
        eroded=cv2.erode(work,kernel)
        result=cv2.bitwise_or(result,cv2.subtract(work,cv2.dilate(eroded,kernel)))
        work=eroded
        if not cv2.countNonZero(work): break
    return result


def mask_small_text(binary):
    cleaned=binary.copy(); textmask=np.zeros_like(binary)
    n,labels,stats,_=cv2.connectedComponentsWithStats(binary)
    removed=np.zeros(n,dtype=np.uint8)
    for label,(x,y,w,h,area) in enumerate(stats[1:],1):
        # Isolated small glyph-like components only. Wall-attached labels are intentionally retained.
        if 3<=h<=24 and 2<=w<=30 and area<300:
            removed[label]=255
    textmask=removed[labels]
    cleaned[textmask>0]=0
    return cleaned,textmask


def segments(binary):
    items=[]; wallmask=np.zeros_like(binary)
    # Thin labels/dimension lines are rejected by stroke thickness; no OCR text is interpreted as code.
    for axis,kernel in [('h',(35,1)),('v',(1,35))]:
        opened=cv2.morphologyEx(binary,cv2.MORPH_OPEN,np.ones(kernel[::-1],np.uint8))
        n,_,stats,_=cv2.connectedComponentsWithStats(opened)
        for x,y,w,h,area in stats[1:]:
            length,thickness=(w,h) if axis=='h' else (h,w)
            if length<45 or not 5<=thickness<=45 or area/(w*h)<.7: continue
            offset=(y+(h-1)/2) if axis=='h' else (x+(w-1)/2)
            start,end=(x,x+w-1) if axis=='h' else (y,y+h-1)
            items.append(dict(axis=axis,offset=float(offset),start=float(start),end=float(end),thickness=float(thickness)))
            wallmask[y:y+h,x:x+w]=opened[y:y+h,x:x+w]
    return items,wallmask


def tidy(items,binary):
    walls=[]; gaps=[]
    for axis in ['h','v']:
        groups=[]
        for item in sorted([s for s in items if s['axis']==axis],key=lambda s:(s['offset'],s['start'])):
            group=next((g for g in groups if abs(g[0]['offset']-item['offset'])<=4),None)
            if group is None:groups.append([item])
            else:group.append(item)
        for group in groups:
            group.sort(key=lambda s:s['start']);current=dict(group[0])
            for nxt in group[1:]:
                gap=nxt['start']-current['end']
                if gap<=75:
                    if gap>=12:gaps.append((current.copy(),current['end'],nxt['start']))
                    current['end']=max(current['end'],nxt['end'])
                    current['thickness']=float(np.median([current['thickness'],nxt['thickness']]))
                else:walls.append(current);current=dict(nxt)
            walls.append(current)
    # Snap nearby T/corner intersections; do not close arbitrary long gaps.
    for h in [w for w in walls if w['axis']=='h']:
        for v in [w for w in walls if w['axis']=='v']:
            tol=max(h['thickness'],v['thickness'])+4
            if h['start']-tol<=v['offset']<=h['end']+tol and v['start']-tol<=h['offset']<=v['end']+tol:
                for wall,value in [(h,v['offset']),(v,h['offset'])]:
                    if abs(wall['start']-value)<=tol:wall['start']=value
                    if abs(wall['end']-value)<=tol:wall['end']=value
    return walls,gaps


def endpoints(w):
    return ([[w['start'],w['offset']],[w['end'],w['offset']]] if w['axis']=='h' else
            [[w['offset'],w['start']],[w['offset'],w['end']]])


def classify_gap(w,start,end,binary):
    # Symbol evidence is deliberately conservative; unknown gaps are not called doors.
    h,wid=binary.shape; mid=(start+end)/2; length=end-start
    if w['axis']=='h':
        x0,x1=int(start+3),int(end-3);y=int(w['offset']);r=int(length+8)
        patch=binary[max(0,y-r):min(h,y+r),max(0,x0):min(wid,x1)]
    else:
        y0,y1=int(start+3),int(end-3);x=int(w['offset']);r=int(length+8)
        patch=binary[max(0,y0):min(h,y1),max(0,x-r):min(wid,x+r)].T
    if patch.size==0:return 'opening',.25,'wall_gap_only'
    # Two thin parallel strokes spanning most of the opening are window evidence.
    profiles=(patch>0).mean(axis=1)
    runs=[]
    for i in np.flatnonzero(profiles>.7):
        if not runs or i>runs[-1][-1]+1:runs.append([i])
        else:runs[-1].append(i)
    if sum(len(r)<=3 for r in runs)>=2:return 'window',.6,'thin_parallel_lines_in_gap'
    # Look for circular edge fragments with a radius linked to opening width.
    circles=cv2.HoughCircles(cv2.GaussianBlur(patch,(3,3),0),cv2.HOUGH_GRADIENT,1,15,param1=60,param2=8,minRadius=max(8,int(length*.55)),maxRadius=max(10,int(length*1.3)))
    if circles is not None:return 'door',.55,'circular_fragment_near_gap_unverified'
    return 'opening',.25,'wall_gap_only'


def calibration(scale,matrix,default,warnings):
    if scale is None:
        warnings.append('KEIN gemessener Maßstab: 10 mm/Pixel nur Platzhalter; Maße und Flächen nicht belastbar.')
        return float(default),'estimated'
    values=[float(x) for x in re.split('[,;]',scale)]
    if len(values)!=5 or not all(math.isfinite(v) for v in values) or values[-1]<=0:raise ValueError('Maßstab: x1,y1,x2,y2,mm; positive reale Länge erforderlich.')
    a,b=transform([values[:2],values[2:4]],matrix)
    distance=np.linalg.norm(b-a)
    if distance<1:raise ValueError('Kalibrierpunkte liegen zu dicht zusammen.')
    return float(values[-1]/distance),'user'


def extract(path,scale=None,debug_dir=None,perspective=True,method='classical'):
    if method!='classical':raise ValueError('Lernmodell nicht verfügbar: kein geprüftes lokales CubiCasa-Checkpoint. Klassisch mit --method classical starten.')
    started=time.perf_counter()
    image=cv2.imread(str(path),cv2.IMREAD_COLOR)
    if image is None:raise ValueError('Bild nicht lesbar; PDF zuerst als PNG/JPG rasterisieren.')
    if image.shape[0]*image.shape[1]>MAX_PIXELS:raise ValueError('Maximal 20 Megapixel.')
    normalized,binary,matrix,warnings,angle=preprocess(image,perspective)
    cleaned,textmask=mask_small_text(binary)
    items,mask=segments(cleaned);walls,gaps=tidy(items,binary)
    mm,scale_source=calibration(scale,matrix,10,warnings)
    height=normalized.shape[0]
    def point(p):return [round(float(p[0])*mm,2),round((height-1-float(p[1]))*mm,2)]
    outwalls=[]
    for i,w in enumerate(walls):
        a,b=endpoints(w)
        outwalls.append(dict(id=f'W{i+1}',a=point(a),b=point(b),thickness=round(w['thickness']*mm,2),length=round((w['end']-w['start'])*mm,2),confidence=.65))
    openings=[]
    for w,a,b in gaps:
        host=next((i for i,t in enumerate(walls) if t['axis']==w['axis'] and abs(t['offset']-w['offset'])<5 and t['start']<=a and t['end']>=b),None)
        if host is None:continue
        kind,confidence,evidence=classify_gap(w,a,b,binary)
        center=[(a+b)/2,w['offset']] if w['axis']=='h' else [w['offset'],(a+b)/2]
        openings.append(dict(id=f'O{len(openings)+1}',kind=kind,wall=f'W{host+1}',at=point(center),width=round((b-a)*mm,2),height=2010 if kind!='window' else 1350,sill=900 if kind=='window' else 0,height_assumed=True,confidence=confidence,evidence=evidence))
    rooms=[]; boundary=[]
    lines=[LineString(endpoints(w)) for w in walls]
    if lines:
        margin=float(np.median([w['thickness'] for w in walls]))/2
        polygons=list(polygonize(unary_union(lines)))
        footprint=unary_union(polygons)
        if not footprint.is_empty and footprint.geom_type=='Polygon':boundary=[point(p) for p in list(footprint.exterior.coords)[:-1]]
        for poly in polygons:
            inner=poly.buffer(-margin,join_style=2)
            if inner.is_empty or inner.area<400 or inner.geom_type!='Polygon':continue
            coords=[point(p) for p in list(inner.exterior.coords)[:-1]]
            rooms.append(dict(id=f'R{len(rooms)+1}',name=f'Raum {len(rooms)+1}',polygon=coords,area_m2=round(inner.area*mm*mm/1e6,3),area_estimated=scale_source=='estimated'))
    warnings+=['Prototyp: Konfidenzen sind heuristische Kennzeichnungen, keine kalibrierten Wahrscheinlichkeiten.','Raumnamen generisch; OCR dient nur als Prüfhinweis, kein automatischer Maßstabsbeweis.','Öffnungen/Höhen und Raumtopologie manuell prüfen; keine Vermessung.']
    if not walls:warnings.append('Keine ausreichend dicken, achsparallelen Wandstriche gefunden.')
    if debug_dir:
        folder=Path(debug_dir);folder.mkdir(parents=True,exist_ok=True)
        for name,data in [('01-normalized.png',normalized),('02-binary.png',binary),('03-wall-mask.png',mask),('04-skeleton.png',skeleton(mask)),('06-text-mask.png',textmask)]:cv2.imwrite(str(folder/name),data)
        overlay=normalized.copy()
        for w in walls:cv2.line(overlay,*[tuple(map(int,p)) for p in endpoints(w)],(0,0,255),2)
        for room in rooms:
            pixels=np.int32([[p[0]/mm,height-1-p[1]/mm] for p in room['polygon']]);cv2.polylines(overlay,[pixels],True,(0,180,0),2)
        for o in openings:cv2.circle(overlay,(int(o['at'][0]/mm),int(height-1-o['at'][1]/mm)),7,(255,0,0),2)
        cv2.imwrite(str(folder/'05-result.png'),overlay)
    return dict(version=1,source='raster',scale_mm_per_px=mm,scale_source=scale_source,coordinate_system='millimetres_y_up_normalized_image',original_to_normalized=matrix.tolist(),levels=[dict(name='EG',source=dict(kind='raster',page=1,input=0),scale=dict(mm_per_unit=mm,method=scale_source,ratio=None,evidence=[],support=0),detection='raster_classical',height=2500,height_assumed=True,elevation=0.,width=round(normalized.shape[1]*mm,2),depth=round(height*mm,2),boundary=boundary,walls=outwalls,openings=openings,rooms=rooms,texts=[],warnings=warnings)],warnings=warnings,skipped=[],diagnostics=dict(deskew_degrees=angle,runtime_seconds=time.perf_counter()-started))
