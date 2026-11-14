"""Read-only IFC insights for the building assistant, computed in the background worker.
Uses IfcOpenShell tools: ifc5d (quantities), ifcclash (clashes), ifcopenshell.util.selector (element index)
and ifcdiff (version comparison). Never writes to the model, never executes embedded content, no network."""
import collections,contextlib,io,json,logging,sys,time
import ifcopenshell
import ifcopenshell.util.element as ue
import ifcopenshell.util.selector as selector
import ifcopenshell.util.unit as uu
VERSION=1
MAX_ELEMENTS=3000
MAX_CLASHES=50
QTO_CLASSES=['IfcWall','IfcSlab','IfcRoof','IfcWindow','IfcDoor','IfcColumn','IfcBeam','IfcCovering','IfcStair','IfcSpace','IfcCurtainWall','IfcPlate','IfcRailing']
# Physical elements that should not cut through the structure. Doors/windows sit in openings and are excluded on purpose.
CLASH_A='IfcWall, IfcSlab, IfcColumn, IfcBeam, IfcRoof, IfcCurtainWall'
CLASH_B='IfcFurnishingElement, IfcFlowTerminal, IfcFlowSegment, IfcFlowFitting, IfcDistributionElement, IfcBuildingElementProxy, IfcStair, IfcRailing'
def text(v,n=100):return str(v)[:n] if v not in (None,'') else None
def num(v,d=2):return round(float(v),d) if isinstance(v,(int,float)) and v==v and abs(v)<1e9 else None
def storey(e):
    try:
        c=ue.get_container(e)
        while c is not None and not c.is_a('IfcBuildingStorey'):c=ue.get_aggregate(c)
        return text(c.Name) if c is not None else None
    except Exception:return None
def common(e,key):
    try:
        for name,values in ue.get_psets(e,psets_only=True).items():
            if name.endswith('Common') and isinstance(values.get(key),bool):return values[key]
    except Exception:pass
    return None
def material(e):
    try:
        m=ue.get_material(e,should_skip_usage=True)
        if m is None:return None
        if m.is_a('IfcMaterial'):return text(m.Name)
        names=[x.Name for x in ue.get_materials(e) if getattr(x,'Name',None)]
        return text(', '.join(dict.fromkeys(names)),120) if names else text(getattr(m,'Name',None))
    except Exception:return None
def element_index(model):
    # ifcopenshell.util.selector: the same query language ifcclash and Bonsai use.
    elements=sorted(selector.filter_elements(model,'IfcElement, IfcSpace'),key=lambda e:e.id())
    elements=[e for e in elements if not e.is_a('IfcFeatureElement')]
    out=[]
    for e in elements[:MAX_ELEMENTS]:
        t=ue.get_type(e)
        out.append({'id':e.GlobalId,'c':e.is_a(),'n':text(e.Name),'s':storey(e),'t':text(getattr(t,'Name',None)) if t else text(getattr(e,'ObjectType',None)),
                    'm':material(e),'x':common(e,'IsExternal'),'l':common(e,'LoadBearing')})
    return out,len(elements)
def quantities(model,deadline):
    import ifc5d.qto as qto
    scale={'area':uu.calculate_unit_scale(model,'AREAUNIT'),'volume':uu.calculate_unit_scale(model,'VOLUMEUNIT'),'length':uu.calculate_unit_scale(model)}
    elements=set()
    for c in QTO_CLASSES:
        try:elements|=set(model.by_type(c))
        except Exception:pass
    results=qto.quantify(model,elements,qto.rules['IFC4QtoBaseQuantities'])
    kind=lambda k:'area' if 'Area' in k else 'volume' if 'Volume' in k else 'length' if k in ('Length','Width','Height','Depth','Perimeter','Thickness') else None
    by_type=collections.defaultdict(lambda:{'count':0,'sums':collections.Counter()})
    by_storey=collections.defaultdict(lambda:collections.Counter())
    for e,sets in results.items():
        if time.monotonic()>deadline:break
        entry=by_type[e.is_a()];entry['count']+=1
        flat={}
        for values in sets.values():
            for k,v in values.items():
                if isinstance(v,(int,float)) and kind(k) in ('area','volume'):flat[k]=v*scale[kind(k)]
        for k,v in flat.items():entry['sums'][k]+=v
        s=storey(e) or '(ohne Geschoss)'
        if e.is_a('IfcWall'):
            by_storey[s]['wall_net_side_area_m2']+=flat.get('NetSideArea',0)
            if common(e,'IsExternal'):by_storey[s]['external_wall_net_side_area_m2']+=flat.get('NetSideArea',0)
        if e.is_a('IfcWindow'):by_storey[s]['window_area_m2']+=flat.get('Area',0)
        if e.is_a('IfcDoor'):by_storey[s]['door_area_m2']+=flat.get('Area',0)
    types={c:{'count':v['count'],**{k+('_m2' if 'Area' in k else '_m3'):num(x) for k,x in sorted(v['sums'].items())}} for c,v in by_type.items()}
    storeys={s:{k:num(v) for k,v in c.items()} for s,c in by_storey.items()}
    wall=sum(c['external_wall_net_side_area_m2'] for c in by_storey.values());window=sum(c['window_area_m2'] for c in by_storey.values())
    return {'by_type':types,'by_storey':storeys,
            'window_to_external_wall_ratio':num(window/(wall+window),3) if wall>0 else None,
            'tool':'ifc5d (IfcOpenShell QTO, Regelsatz IFC4QtoBaseQuantities)','note':'Aus der Geometrie berechnet, nicht ins Modell geschrieben. Keine Vermessung, keine Abrechnung nach VOB/DIN 277.'}
def clashes(path,deadline):
    from ifcclash.ifcclash import Clasher,ClashSettings
    settings=ClashSettings();settings.logger=logging.getLogger('ifcclash');settings.logger.disabled=True
    clasher=Clasher(settings)
    clasher.clash_sets=[{'name':'Tragwerk gegen Ausstattung/Technik','a':[{'file':path,'mode':'i','selector':CLASH_A}],'b':[{'file':path,'mode':'i','selector':CLASH_B}],'mode':'intersection','tolerance':0.01,'check_all':False}]
    try:clasher.clash()
    except AssertionError:return {'count':0,'items':[],'checked':CLASH_A+' gegen '+CLASH_B,'note':'Keine prüfbaren Bauteile in einer der Gruppen.'}
    found=list(clasher.clash_sets[0].get('clashes',{}).values())
    found.sort(key=lambda c:-(c.get('distance') or 0))
    return {'count':len(found),'checked':CLASH_A+' gegen '+CLASH_B,'mode':'Durchdringung, Toleranz 1 cm',
            'items':[{'a':{'id':c['a_global_id'],'class':c['a_ifc_class'],'name':text(c['a_name'])},'b':{'id':c['b_global_id'],'class':c['b_ifc_class'],'name':text(c['b_name'])},
                      'type':text(c['type'],20),'depth_m':num(c['distance'],3)} for c in found[:MAX_CLASHES]],
            'tool':'ifcclash (IfcOpenShell)','note':'Automatische Geometrieprüfung; Treffer sind Prüfhinweise, keine fachliche Bewertung. Türen/Fenster in Öffnungen sind ausgenommen.'}
def insights(path,budget=200):
    model=ifcopenshell.open(path);deadline=time.monotonic()+budget;out={'version':VERSION,'schema':model.schema}
    steps=[('elements',lambda:dict(zip(('items','total'),element_index(model)))),('quantities',lambda:quantities(model,deadline)),('clashes',lambda:clashes(path,deadline))]
    for key,run in steps:
        if time.monotonic()>deadline:out[key]={'error':'Zeitbudget überschritten.'};continue
        try:out[key]=run()
        except Exception:out[key]={'error':'Konnte nicht berechnet werden.'}
    return out
def diff(old_path,new_path):
    from ifcdiff import IfcDiff
    old=ifcopenshell.open(old_path);new=ifcopenshell.open(new_path)
    d=IfcDiff(old,new,relationships=['attributes','geometry','property','container'])
    logging.getLogger('IfcDiff').disabled=True
    d.diff()
    def describe(model,guid):
        try:e=model.by_guid(guid);return {'id':guid,'class':e.is_a(),'name':text(e.Name),'storey':storey(e)}
        except Exception:return {'id':guid}
    changed=[]
    for guid,changes in list(d.change_register.items())[:50]:
        entry=describe(new,guid);entry['changes']=sorted(k.replace('_changed','') for k in changes.keys())[:6];changed.append(entry)
    old_total=len([e for e in old.by_type('IfcElement') if not e.is_a('IfcFeatureElement')])
    return {'version':VERSION,'common_count':max(old_total-len(d.deleted_elements),0),'added_count':len(d.added_elements),'deleted_count':len(d.deleted_elements),'changed_count':len(d.change_register),
            'added':[describe(new,g) for g in list(d.added_elements)[:50]],'deleted':[describe(old,g) for g in list(d.deleted_elements)[:50]],'changed':changed,
            'tool':'ifcdiff (IfcOpenShell)','note':'Vergleich über GlobalIds. Neu exportierte Modelle mit neuen GlobalIds erscheinen als gelöscht und neu hinzugefügt.'}
if __name__=='__main__':
    try:
        # Libraries print progress to stdout; only our JSON may reach the worker.
        with contextlib.redirect_stdout(io.StringIO()):
            result=diff(sys.argv[2],sys.argv[3]) if sys.argv[1]=='diff' else insights(sys.argv[2])
        print(json.dumps(result,ensure_ascii=False,allow_nan=False,default=str))
    except Exception:
        print(json.dumps({'error':'IFC-Auswertung innerhalb der Grenzen nicht möglich.'}));sys.exit(1)
