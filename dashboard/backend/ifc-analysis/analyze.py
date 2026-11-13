"""Local, read-only IFC inspection. Never execute embedded content or contact AI providers."""
import collections,json,sys
import ifcopenshell
import ifcopenshell.validate
import ifcopenshell.util.unit
from ifctester import ids

def analyze(path):
    model=ifcopenshell.open(path)
    entities=list(model)
    if len(entities)>150000: raise ValueError('model_too_complex')
    counts=collections.Counter(e.is_a() for e in entities)
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
    for room in model.by_type('IfcSpace')[:500]:
        parents=getattr(room,'Decomposes',[]) or []
        storey=next((x.RelatingObject for x in parents if x.RelatingObject.is_a('IfcBuildingStorey')),None)
        rooms.append({'global_id':room.GlobalId,'name':str(room.Name or '')[:160], 'storey':str(storey.Name or '')[:160] if storey else None})
    issues=[]
    if not rooms:issues.append('Keine IfcSpace-Räume vorhanden; Raumgrenzen müssen ermittelt oder ergänzt werden.')
    if any(not r['name'].strip() for r in rooms):issues.append('Mindestens ein Raum hat keinen Namen.')
    if any(not r['storey'] for r in rooms):issues.append('Mindestens ein Raum ist keinem Geschoss zugeordnet.')
    if log.statements:issues.append('IFC-Struktur enthält Prüfhinweise. Modell vor Verwendung prüfen.')
    unit=ifcopenshell.util.unit.calculate_unit_scale(model)
    return {'version':1,'schema':model.schema,'entity_count':len(entities),'counts':dict(counts),'length_unit_to_metre':unit,
            'rooms':rooms,'rooms_truncated':counts.get('IfcSpace',0)>500,'schema_issue_count':len(log.statements),
            'information_rules':[{'name':s.name,'passed':bool(s.status)} for s in rules.specifications],
            'warnings':issues,'limitations':['Keine Vermessung oder fachliche Freigabe.','Raumflächen und geschlossene Raumgrenzen noch nicht geometrisch geprüft.','Keine automatische Reparatur, keine Kollisionsprüfung in diesem Basisbericht.']}
if __name__=='__main__':
    try:
        result=analyze(sys.argv[1]);print(json.dumps(result,ensure_ascii=False,allow_nan=False))
    except Exception:
        print(json.dumps({'error':'IFC konnte innerhalb der Analysegrenzen nicht ausgewertet werden.'}));sys.exit(1)
