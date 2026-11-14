"""Builds a clean IFC4 model from an iPhone RoomPlan scan (JSON, validated by the API).

Input coordinates are RoomPlan world space: metres, Y up. IFC uses X, -Z, Y up.
The scan is local data only: no AI provider and no network access is used here.
Usage: python roomscan.py scan.json model.ifc  -> prints a JSON summary on stdout.
"""
import json,math,sys
import numpy as np
import ifcopenshell,ifcopenshell.api,ifcopenshell.guid

DEFAULT_THICKNESS=0.24      # Assumed when a wall was scanned from one side only.
MIN_PARTITION,MAX_PARTITION=0.04,0.45
SLAB=0.15
FURNITURE={'table':('IfcFurniture','TABLE','Tisch'),'chair':('IfcFurniture','CHAIR','Stuhl'),'sofa':('IfcFurniture','SOFA','Sofa'),
 'bed':('IfcFurniture','BED','Bett'),'storage':('IfcFurniture','SHELF','Schrank'),'fireplace':('IfcFurniture','USERDEFINED','Kamin'),
 'television':('IfcElectricAppliance','USERDEFINED','Fernseher'),'refrigerator':('IfcElectricAppliance','REFRIGERATOR','Kühlschrank'),
 'stove':('IfcElectricAppliance','ELECTRICCOOKER','Herd'),'oven':('IfcElectricAppliance','USERDEFINED','Backofen'),
 'dishwasher':('IfcElectricAppliance','DISHWASHER','Spülmaschine'),'washerDryer':('IfcElectricAppliance','WASHINGMACHINE','Waschmaschine'),
 'sink':('IfcSanitaryTerminal','SINK','Waschbecken'),'toilet':('IfcSanitaryTerminal','TOILETPAN','WC'),'bathtub':('IfcSanitaryTerminal','BATH','Badewanne'),
 'stairs':('IfcFurniture','USERDEFINED','Treppe')}
LABELS={'bathroom':'Bad','bedroom':'Schlafzimmer','diningRoom':'Esszimmer','kitchen':'Küche','livingRoom':'Wohnzimmer'}
GENERIC={'','Raum','Bad','Schlafzimmer','Esszimmer','Küche','Wohnzimmer'}

def box(item,floor):
    m=np.array(item['transform'],dtype=float).reshape(4,4).T  # simd matrices are column-major
    w,h,d=item['size']
    c=m[:3,3]
    x=np.array([m[0,0],-m[2,0]]);n=np.linalg.norm(x)
    x=x/n if n>1e-6 else np.array([1.0,0.0])
    return {'c':np.array([c[0],-c[2]]),'dir':x,'w':float(w),'h':float(h),'d':float(d),'bottom':float(c[1]-h/2-floor)}

def polygon_area(p):
    return 0.5*sum(p[i][0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*p[i][1] for i in range(len(p)))
def inside(pt,poly):
    c=False;j=len(poly)-1
    for i in range(len(poly)):
        if (poly[i][1]>pt[1])!=(poly[j][1]>pt[1]) and pt[0]<(poly[j][0]-poly[i][0])*(pt[1]-poly[i][1])/(poly[j][1]-poly[i][1])+poly[i][0]:c=not c
        j=i
    return c

def edge_distance(pt,poly):
    best=1e9
    for i in range(len(poly)):
        a=np.array(poly[i]);b=np.array(poly[(i+1)%len(poly)]);ab=b-a;l=float(np.dot(ab,ab))
        t=0.0 if l<1e-12 else min(1.0,max(0.0,float(np.dot(pt-a,ab))/l))
        best=min(best,float(np.linalg.norm(pt-(a+ab*t))))
    return best

def classify(room,objects):
    """German room type from RoomPlan label, furniture inside and shape. Returns (type, evidence)."""
    cats=[o['category'] for o in objects]
    has=lambda *k:any(c in cats for c in k)
    if has('toilet') and not has('bathtub') and room['area']<3.5 and not has('bed'):return 'WC','WC erkannt'
    if has('toilet','bathtub'):return 'Bad','Sanitärobjekte erkannt'
    if has('stove','oven','dishwasher','refrigerator'):return 'Küche','Küchengeräte erkannt'
    if has('bed'):return 'Schlafzimmer','Bett erkannt'
    if room['label'] in LABELS:return LABELS[room['label']],'RoomPlan-Raumtyp'
    if has('sofa','television','fireplace'):return 'Wohnzimmer','Sofa/Fernseher erkannt'
    if has('washerDryer'):return 'Hauswirtschaftsraum','Waschmaschine erkannt'
    if has('sink'):return 'Bad','Waschbecken erkannt'
    if cats.count('chair')>=3 and has('table'):return 'Esszimmer','Tisch mit Stühlen erkannt'
    if has('table') and has('chair'):return 'Arbeitszimmer','Tisch mit Stuhl erkannt'
    xs=[p[0] for p in room['poly']];ys=[p[1] for p in room['poly']]
    short,long=sorted([max(xs)-min(xs),max(ys)-min(ys)])
    if short<1.8 and long>2.5*short:return 'Flur','lange, schmale Form'
    if has('storage') and room['area']<6:return 'Abstellraum','kleiner Raum mit Schrank'
    return 'Raum',None

def walls_from_scan(scan_walls,rooms,warnings):
    """Pairs the two scanned faces of a partition into one wall with measured thickness."""
    ws=[]
    for w in scan_walls:
        n=np.array([-w['dir'][1],w['dir'][0]])
        if rooms:
            # The scanned face lies on the boundary of its own room; the outward normal points away from it.
            own=min(rooms,key=lambda r:edge_distance(w['c'],r['poly']))
            if inside(w['c']+n*0.25,own['poly']):n=-n
            elif not inside(w['c']-n*0.25,own['poly']) and np.dot(own['centre']-w['c'],n)>0:n=-n
        ws.append({**w,'n':n})  # n points away from the scanned room
    used=set();result=[]
    for i,a in enumerate(ws):
        if i in used:continue
        best=None
        for j,b in enumerate(ws):
            if j<=i or j in used or abs(np.dot(a['dir'],b['dir']))<math.cos(math.radians(8)) or np.dot(a['n'],b['n'])>-0.9:continue
            gap=float(np.dot(b['c']-a['c'],a['n']))
            if not MIN_PARTITION<=gap<=MAX_PARTITION:continue
            ta=np.dot(b['c']-a['c'],a['dir']);lo=max(-a['w']/2,ta-b['w']/2);hi=min(a['w']/2,ta+b['w']/2)
            if hi-lo<0.5*min(a['w'],b['w']):continue
            if best is None or gap<best[1]:best=(j,gap,ta)
        if best:
            j,gap,ta=best;b=ws[j];used.update({i,j})
            lo=min(-a['w']/2,ta-b['w']/2);hi=max(a['w']/2,ta+b['w']/2)
            centre=a['c']+a['dir']*((lo+hi)/2)+a['n']*(gap/2)
            result.append({'c':centre,'dir':a['dir'],'n':a['n'],'w':hi-lo,'h':max(a['h'],b['h']),'bottom':min(a['bottom'],b['bottom']),'t':gap,'shared':True,'assumed':False})
        else:
            t=a['d'] if 0.05<a['d']<0.8 else DEFAULT_THICKNESS
            result.append({'c':a['c']+a['n']*(t/2),'dir':a['dir'],'n':a['n'],'w':a['w'],'h':a['h'],'bottom':a['bottom'],'t':t,'shared':False,'assumed':t==DEFAULT_THICKNESS})
    if any(w['assumed'] for w in result):warnings.append(f'Wandstärke bei {sum(w["assumed"] for w in result)} nur einseitig gescannten Wänden mit {int(DEFAULT_THICKNESS*100)} cm angenommen.')
    return result

class Builder:
    def __init__(self,name):
        f=self.f=ifcopenshell.api.run('project.create_file',version='IFC4')
        self.project=ifcopenshell.api.run('root.create_entity',f,ifc_class='IfcProject',name=name)
        ifcopenshell.api.run('unit.assign_unit',f,length={'is_metric':True,'raw':'METERS'},area={'is_metric':True,'raw':'SQUARE_METERS'},volume={'is_metric':True,'raw':'CUBIC_METERS'})
        model=ifcopenshell.api.run('context.add_context',f,context_type='Model')
        self.body=ifcopenshell.api.run('context.add_context',f,context_type='Model',context_identifier='Body',target_view='MODEL_VIEW',parent=model)
        self.site=self.entity('IfcSite','Grundstück');self.building=self.entity('IfcBuilding',name)
        ifcopenshell.api.run('aggregate.assign_object',f,products=[self.site],relating_object=self.project)
        ifcopenshell.api.run('aggregate.assign_object',f,products=[self.building],relating_object=self.site)
    def entity(self,cls,name,predefined=None,placement=None):
        e=ifcopenshell.api.run('root.create_entity',self.f,ifc_class=cls,name=name,predefined_type=predefined)
        m=np.eye(4)
        if placement is not None:
            (x,y,z),d=placement;m[:3,0]=[d[0],d[1],0];m[:3,1]=[-d[1],d[0],0];m[:3,3]=[x,y,z]
        ifcopenshell.api.run('geometry.edit_object_placement',self.f,product=e,matrix=m)
        return e
    def solid(self,e,profile,height):
        f=self.f
        s=f.createIfcExtrudedAreaSolid(profile,f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((0.,0.,0.))),f.createIfcDirection((0.,0.,1.)),float(height))
        rep=f.createIfcShapeRepresentation(self.body,'Body','SweptSolid',[s])
        ifcopenshell.api.run('geometry.assign_representation',f,product=e,representation=rep)
    def rect(self,e,w,d,h):
        f=self.f
        self.solid(e,f.createIfcRectangleProfileDef('AREA',None,f.createIfcAxis2Placement2D(f.createIfcCartesianPoint((0.,0.))),float(max(w,0.01)),float(max(d,0.01))),h)
    def poly(self,e,points,h):
        f=self.f
        pts=[f.createIfcCartesianPoint((float(x),float(y))) for x,y in points]
        self.solid(e,f.createIfcArbitraryClosedProfileDef('AREA',None,f.createIfcPolyline(pts+[pts[0]])),h)

def build(scan,out_path):
    warnings=[]
    floors=scan.get('floors') or []
    level=min((c[1] for fl in floors for c in fl['corners']),default=None)
    if level is None:
        level=min((np.array(w['transform']).reshape(4,4).T[1,3]-w['size'][1]/2 for w in scan['walls']),default=0.0)
    rooms=[]
    for i,fl in enumerate(floors):
        p=[(c[0],-c[2]) for c in fl['corners']]
        if len(p)<3:continue
        if polygon_area(p)<0:p.reverse()
        rooms.append({'poly':p,'area':polygon_area(p),'centre':np.mean(np.array(p),axis=0),'label':fl.get('label'),'name':(fl.get('name') or '').strip(),'z':min(c[1] for c in fl['corners'])-level,'objects':[]})
    walls=walls_from_scan([box(w,level) for w in scan.get('walls',[])],rooms,warnings)
    objects=[{**box(o,level),'category':o['category']} for o in scan.get('objects',[])]
    for o in objects:
        host=next((r for r in rooms if inside(o['c'],r['poly'])),None)
        o['room']=host
        if host:host['objects'].append(o)
    # Room names: own names are kept, generic RoomPlan names are replaced by the detected type.
    counts={}
    for r in rooms:
        r['type'],r['evidence']=classify(r,r['objects'])
        base=r['name'] if r['name'] and r['name'].rstrip('0123456789 ') not in GENERIC else r['type']
        counts[base]=counts.get(base,0)+1;r['final']=base if counts[base]==1 else f'{base} {counts[base]}'
    for base,n in counts.items():
        if n>1:next(r for r in rooms if r['final']==base)['final']=base+' 1'
    heights=sorted(w['h'] for w in walls) or [2.5]
    room_height=heights[len(heights)//2]

    b=Builder(scan.get('building_name') or 'Gebäude');f=b.f
    storey=b.entity('IfcBuildingStorey',scan.get('storey') or 'Erdgeschoss');storey.Elevation=0.
    ifcopenshell.api.run('aggregate.assign_object',f,products=[storey],relating_object=b.building)
    contained=[]
    wall_types={}
    for i,w in enumerate(walls):
        t=round(w['t'],3)
        if t not in wall_types:
            wt=ifcopenshell.api.run('root.create_entity',f,ifc_class='IfcWallType',name=f'Wand {round(t*100)} cm',predefined_type='STANDARD');wall_types[t]=wt
        e=b.entity('IfcWall',f'Wand {i+1}','STANDARD',((w['c'][0],w['c'][1],w['bottom']),w['dir']))
        b.rect(e,w['w'],w['t'],w['h']);ifcopenshell.api.run('type.assign_type',f,related_objects=[e],relating_type=wall_types[t])
        ps=ifcopenshell.api.run('pset.add_pset',f,product=e,name='Pset_WallCommon')
        ifcopenshell.api.run('pset.edit_pset',f,pset=ps,properties={'IsExternal':not w['shared'] and not any(inside(w['c']+w['n']*(w['t']/2+0.3),r['poly']) for r in rooms),'LoadBearing':False})
        q=ifcopenshell.api.run('pset.add_qto',f,product=e,name='Qto_WallBaseQuantities')
        ifcopenshell.api.run('pset.edit_qto',f,qto=q,properties={'Length':w['w'],'Width':w['t'],'Height':w['h']})
        w['entity']=e;contained.append(e)
    unhosted=0;counters={'door':0,'window':0,'opening':0}
    for kind,items in (('door',scan.get('doors',[])),('window',scan.get('windows',[])),('opening',scan.get('openings',[]))):
        for item in items:
            o=box(item,level);counters[kind]+=1
            host=None;best=1e9
            for w in walls:
                rel=o['c']-w['c'];off=abs(np.dot(rel,w['n']));along=abs(np.dot(rel,w['dir']))
                if abs(np.dot(o['dir'],w['dir']))>0.9 and off<w['t']/2+0.35 and along<w['w']/2+0.1 and off<best:host,best=w,off
            label={'door':'Tür','window':'Fenster','opening':'Öffnung'}[kind]+f' {counters[kind]}'
            if host:
                along=np.dot(o['c']-host['c'],host['dir']);at=host['c']+host['dir']*along
                op=b.entity('IfcOpeningElement',label,'OPENING',((at[0],at[1],o['bottom']),host['dir']))
                b.rect(op,o['w'],host['t']+0.1,o['h'])
                ifcopenshell.api.run('feature.add_feature',f,feature=op,element=host['entity'])
                if kind=='opening':continue
                el=b.entity('IfcDoor' if kind=='door' else 'IfcWindow',label,'DOOR' if kind=='door' else 'WINDOW',((at[0],at[1],o['bottom']),host['dir']))
                b.rect(el,o['w'],min(0.06,host['t']),o['h'])
                ifcopenshell.api.run('feature.add_filling',f,opening=op,element=el)
            else:
                unhosted+=1
                if kind=='opening':continue
                el=b.entity('IfcDoor' if kind=='door' else 'IfcWindow',label,'DOOR' if kind=='door' else 'WINDOW',((o['c'][0],o['c'][1],o['bottom']),o['dir']))
                b.rect(el,o['w'],0.06,o['h'])
            el.OverallWidth=o['w'];el.OverallHeight=o['h'];contained.append(el)
    if unhosted:warnings.append(f'{unhosted} Türen/Fenster/Öffnungen lagen in keiner erkannten Wand und wurden ohne Wandöffnung eingefügt.')
    spaces=[]
    for r in rooms:
        sp=b.entity('IfcSpace',r['final'],'INTERNAL',((0.,0.,r['z']),(1.,0.)));sp.LongName=r['type'];sp.ObjectType=r['type']
        b.poly(sp,r['poly'],room_height)
        perim=sum(math.dist(r['poly'][i],r['poly'][(i+1)%len(r['poly'])]) for i in range(len(r['poly'])))
        q=ifcopenshell.api.run('pset.add_qto',f,product=sp,name='Qto_SpaceBaseQuantities')
        ifcopenshell.api.run('pset.edit_qto',f,qto=q,properties={'NetFloorArea':r['area'],'NetPerimeter':perim,'Height':room_height,'NetVolume':r['area']*room_height})
        ps=ifcopenshell.api.run('pset.add_pset',f,product=sp,name='Pset_SpaceCommon')
        ifcopenshell.api.run('pset.edit_pset',f,pset=ps,properties={'IsExternal':False,'Reference':r['type']})
        spaces.append(sp);r['entity']=sp
        slab=b.entity('IfcSlab','Boden '+r['final'],'FLOOR',((0.,0.,r['z']-SLAB),(1.,0.)));b.poly(slab,r['poly'],SLAB);contained.append(slab)
    if spaces:ifcopenshell.api.run('aggregate.assign_object',f,products=spaces,relating_object=storey)
    names={}
    for o in objects:
        cls,pre,name=FURNITURE.get(o['category'],('IfcFurniture','NOTDEFINED','Objekt'))
        names[name]=names.get(name,0)+1
        e=b.entity(cls,f'{name} {names[name]}',pre,((o['c'][0],o['c'][1],o['bottom']),o['dir']))
        if pre=='USERDEFINED':e.ObjectType=name
        b.rect(e,o['w'],o['d'],o['h'])
        if o['room']:ifcopenshell.api.run('spatial.assign_container',f,products=[e],relating_structure=o['room']['entity'])
        else:contained.append(e)
    if contained:ifcopenshell.api.run('spatial.assign_container',f,products=contained,relating_structure=storey)
    if not rooms:warnings.append('Keine Bodenflächen erkannt: es wurden keine Räume (IfcSpace) erzeugt.')
    f.header.file_description.description=('ViewDefinition [ReferenceView_V1.2]','LiDAR-Raumscan, serverseitig erzeugt, Entwurf')
    f.write(out_path)
    return {'version':1,'storey':storey.Name,'room_height_m':round(room_height,2),
        'rooms':[{'name':r['final'],'type':r['type'],'evidence':r['evidence'],'area_m2':round(r['area'],2),'objects':len(r['objects'])} for r in rooms],
        'counts':{'rooms':len(rooms),'walls':len(walls),'shared_walls':sum(w['shared'] for w in walls),'doors':len(scan.get('doors',[])),'windows':len(scan.get('windows',[])),'openings':len(scan.get('openings',[])),'objects':len(objects)},
        'warnings':warnings+['Vorläufiger Entwurf aus dem LiDAR-Scan: Maße und Wandstärken vor Verwendung prüfen.']}

if __name__=='__main__':
    try:
        with open(sys.argv[1],encoding='utf-8') as source:scan=json.load(source)
        print(json.dumps(build(scan,sys.argv[2]),ensure_ascii=False,allow_nan=False))
    except Exception as e:
        print(json.dumps({'error':type(e).__name__}));sys.exit(1)
