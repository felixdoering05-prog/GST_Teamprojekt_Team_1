"""Local, read-only IFC inspection. Never execute embedded content or contact AI providers."""
import collections,json,sys,time
import ifcopenshell
import ifcopenshell.validate
import ifcopenshell.util.unit
import ifcopenshell.util.element
import ifcopenshell.geom
import ifcopenshell.util.shape
from ifctester import ids

AREA_KEYS=('NetFloorArea','GrossFloorArea')
def floor_area(room,scale):
    # Declared IFC quantities only (Qto_SpaceBaseQuantities or similar); no geometric calculation.
    if not scale:return None
    try:sets=ifcopenshell.util.element.get_psets(room,qtos_only=True)
    except Exception:return None
    for key in AREA_KEYS:
        for values in sets.values():
            value=values.get(key)
            if isinstance(value,(int,float)) and 0<value*scale<1000000:return round(value*scale,2)
    return None
GEOMETRY_BUDGET_SECONDS=60
def room_geometry(room,settings):
    # Triangulated IfcSpace body in metres: footprint (projected floor) area, volume and clear height.
    try:
        shape=ifcopenshell.geom.create_shape(settings,room).geometry
        z=ifcopenshell.util.shape.get_vertices(shape)[:,2]
        area=float(ifcopenshell.util.shape.get_footprint_area(shape))
        volume=float(ifcopenshell.util.shape.get_volume(shape))
        height=float(z.max()-z.min())
    except Exception:return {}
    out={}
    if 0<area<1000000:out['floor_area_m2']=round(area,2)
    if 0<volume<10000000:out['volume_m3']=round(volume,2)
    if 0<height<1000:out['height_m']=round(height,2)
    return out
def analyze(path):
    model=ifcopenshell.open(path)
    counts=collections.Counter()
    entity_count=0
    for entity in model:
        entity_count+=1
        if entity_count>500000: raise ValueError('model_too_complex')
        counts[entity.is_a()]+=1
    log=ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(model,log,express_rules=False)
    # Information requirements; this does not prove that rooms are geometrically closed.
    rules=ids.Ids(title='D21 minimal information requirements')
    for entity in ['IFCSPACE','IFCBUILDINGSTOREY']:
        spec=ids.Specification(name=entity+' names',minOccurs=0)
        spec.applicability.append(ids.Entity(name=entity))
        spec.requirements.append(ids.Attribute(name='Name',value=ids.Restriction({'minLength':1},base='string')))
        rules.specifications.append(spec)
    rules.validate(model)
    rooms=[]
    try:area_scale=ifcopenshell.util.unit.calculate_unit_scale(model,'AREAUNIT')
    except Exception:area_scale=None
    settings=ifcopenshell.geom.settings();started=time.monotonic();geometry_skipped=0
    for room in model.by_type('IfcSpace')[:500]:
        parents=getattr(room,'Decomposes',[]) or []
        storey=next((x.RelatingObject for x in parents if x.RelatingObject.is_a('IfcBuildingStorey')),None)
        rooms.append({'global_id':room.GlobalId,'name':str(room.Name or '')[:160], 'storey':str(storey.Name or '')[:160] if storey else None,'long_name':str(getattr(room,'LongName',None) or '')[:160],'area_m2':None,'area_source':None})
        declared=floor_area(room,area_scale)
        geometry=room_geometry(room,settings) if time.monotonic()-started<GEOMETRY_BUDGET_SECONDS else {}
        if not geometry and time.monotonic()-started>=GEOMETRY_BUDGET_SECONDS:geometry_skipped+=1
        rooms[-1].update(geometry)
        if declared is not None:rooms[-1].update(area_m2=declared,area_source='ifc_mengen')
        elif 'floor_area_m2' in geometry:rooms[-1].update(area_m2=geometry['floor_area_m2'],area_source='geometrie')
    issues=[]
    if not rooms:issues.append('Keine IfcSpace-Räume vorhanden; Raumgrenzen müssen ermittelt oder ergänzt werden.')
    if any(not r['name'].strip() for r in rooms):issues.append('Mindestens ein Raum hat keinen Namen.')
    if any(not r['storey'] for r in rooms):issues.append('Mindestens ein Raum ist keinem Geschoss zugeordnet.')
    if log.statements:issues.append('IFC-Struktur enthält Prüfhinweise. Modell vor Verwendung prüfen.')
    unit=ifcopenshell.util.unit.calculate_unit_scale(model)
    return {'version':3,'geometry_skipped':geometry_skipped,'schema':model.schema,'entity_count':entity_count,'counts':dict(counts),'length_unit_to_metre':unit,
            'rooms':rooms,'rooms_truncated':counts.get('IfcSpace',0)>500,'schema_issue_count':len(log.statements),
            'information_rules':[{'name':s.name,'passed':bool(s.status)} for s in rules.specifications],
            'warnings':issues,'limitations':['Keine Vermessung oder fachliche Freigabe.','Raumflächen aus hinterlegten IFC-Mengen oder aus der Raumgeometrie (Grundriss-Projektion), keine Wohnflächenberechnung nach WoFlV/DIN 277.','Keine automatische Reparatur, keine Kollisionsprüfung in diesem Basisbericht.']}
if __name__=='__main__':
    try:
        result=analyze(sys.argv[1]);print(json.dumps(result,ensure_ascii=False,allow_nan=False))
    except Exception:
        print(json.dumps({'error':'IFC konnte innerhalb der Analysegrenzen nicht ausgewertet werden.'}));sys.exit(1)
