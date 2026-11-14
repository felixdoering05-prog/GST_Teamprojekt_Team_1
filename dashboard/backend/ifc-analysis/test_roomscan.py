import json,math,os,subprocess,sys,tempfile,unittest
import ifcopenshell,ifcopenshell.util.element,ifcopenshell.validate
from analyze import analyze
from roomscan import build

def item(x,z,angle,w,h,d=0.0,y=None,**extra):
    """RoomPlan-style box: column-major simd transform, x axis along the element (angle in the x/z plane)."""
    c,s=math.cos(angle),math.sin(angle)
    y=h/2 if y is None else y
    return {'transform':[c,0,s,0, 0,1,0,0, -s,0,c,0, x,y,z,1],'size':[w,h,d],**extra}

def room_walls(x0,x1,z0,z1,h=2.5):
    return [item((x0+x1)/2,z0,0,x1-x0,h),item((x0+x1)/2,z1,0,x1-x0,h),item(x0,(z0+z1)/2,math.pi/2,z1-z0,h),item(x1,(z0+z1)/2,math.pi/2,z1-z0,h)]

def floor(x0,x1,z0,z1,**extra):
    return {'corners':[[x0,0,z0],[x1,0,z0],[x1,0,z1],[x0,0,z1]],**extra}

def fixture():
    # Room A: 4 m x 3 m, room B next to it behind a 12 cm partition.
    return {'version':1,'building_name':'Testhaus','storey':'EG',
        'walls':room_walls(0,4,0,3)+room_walls(4.12,7,0,3),
        'doors':[item(4.0,1.5,math.pi/2,0.9,2.0)],
        'windows':[item(2.0,0.0,0,1.2,1.2,y=1.5)],
        'openings':[],
        'objects':[item(1.5,1.5,0,1.6,0.5,2.0,category='bed'),item(6.5,0.5,0,0.4,0.8,0.6,category='toilet'),item(5,0.4,0,0.6,0.9,0.5,category='sink'),item(9,9,0,1,1,1,category='storage')],
        'floors':[floor(0,4,0,3,name='Raum 1',label=None),floor(4.12,7,0,3,name='Raum 2',label='bedroom')]}

class RoomScanTest(unittest.TestCase):
    def run_build(self,scan):
        with tempfile.TemporaryDirectory() as d:
            path=os.path.join(d,'scan.ifc');summary=build(scan,path)
            return summary,ifcopenshell.open(path),analyze(path)

    def test_rooms_walls_openings_and_furniture(self):
        summary,model,report=self.run_build(fixture())
        self.assertEqual(model.schema,'IFC4')
        log=ifcopenshell.validate.json_logger();ifcopenshell.validate.validate(model,log,express_rules=False)
        self.assertEqual(log.statements,[])
        # Spaces: named, typed, on the storey and with area quantities.
        self.assertEqual([r['name'] for r in report['rooms']],['Schlafzimmer','Bad'])
        self.assertTrue(all(r['storey']=='EG' for r in report['rooms']))
        self.assertTrue(all(x['passed'] for x in report['information_rules']))
        bad=next(s for s in model.by_type('IfcSpace') if s.Name=='Bad')
        self.assertEqual(bad.LongName,'Bad')
        self.assertAlmostEqual(ifcopenshell.util.element.get_pset(bad,'Qto_SpaceBaseQuantities')['NetFloorArea'],2.88*3,places=2)
        # The two faces of the partition become one 12 cm wall: 8 scanned faces -> 7 walls.
        self.assertEqual(summary['counts']['walls'],7);self.assertEqual(summary['counts']['shared_walls'],1)
        shared=[w for w in model.by_type('IfcWall') if abs(ifcopenshell.util.element.get_pset(w,'Qto_WallBaseQuantities')['Width']-0.12)<1e-6]
        self.assertEqual(len(shared),1)
        self.assertFalse(ifcopenshell.util.element.get_pset(shared[0],'Pset_WallCommon')['IsExternal'])
        # Door and window are fillings of real wall openings; the door sits in the shared wall.
        door=model.by_type('IfcDoor')[0];window=model.by_type('IfcWindow')[0]
        self.assertEqual(door.FillsVoids[0].RelatingOpeningElement.VoidsElements[0].RelatingBuildingElement,shared[0])
        self.assertTrue(window.FillsVoids)
        self.assertAlmostEqual(door.OverallWidth,0.9)
        # Furniture is an IfcFurnishingElement inside its room; objects outside rooms stay on the storey.
        bed=next(e for e in model.by_type('IfcFurnishingElement') if e.PredefinedType=='BED')
        self.assertEqual(ifcopenshell.util.element.get_container(bed).Name,'Schlafzimmer')
        storage=next(e for e in model.by_type('IfcFurniture') if e.PredefinedType=='SHELF')
        self.assertEqual(ifcopenshell.util.element.get_container(storage).Name,'EG')
        self.assertEqual(len(model.by_type('IfcSanitaryTerminal')),2)
        self.assertEqual(len(model.by_type('IfcSlab')),2)
        self.assertTrue(any('einseitig' in w for w in summary['warnings']))

    def test_custom_names_are_kept_and_duplicates_numbered(self):
        scan=fixture();scan['floors'][0]['name']='Büro Felix';scan['objects']=[]
        scan['floors'][1]['label']=None
        summary,_,_=self.run_build(scan)
        self.assertEqual([r['name'] for r in summary['rooms']],['Büro Felix','Raum'])
        scan['floors'][0]['name']='Raum 1'
        summary,_,_=self.run_build(scan)
        self.assertEqual([r['name'] for r in summary['rooms']],['Raum 1','Raum 2'])

    def test_unhosted_door_and_no_floors(self):
        scan=fixture();scan['floors']=[];scan['doors']=[item(20,20,0,0.9,2.0)]
        summary,model,report=self.run_build(scan)
        self.assertEqual(report['rooms'],[]);self.assertEqual(len(model.by_type('IfcDoor')),1)
        self.assertTrue(any('keiner erkannten Wand' in w for w in summary['warnings']))

    def test_cli_reports_errors_without_details(self):
        with tempfile.TemporaryDirectory() as d:
            src=os.path.join(d,'scan.json')
            with open(src,'w') as f:json.dump({'walls':'nope'},f)
            r=subprocess.run([sys.executable,os.path.join(os.path.dirname(__file__),'roomscan.py'),src,os.path.join(d,'o.ifc')],capture_output=True,text=True)
            self.assertEqual(r.returncode,1);self.assertIn('error',json.loads(r.stdout))
            with open(src,'w') as f:json.dump(fixture(),f)
            r=subprocess.run([sys.executable,os.path.join(os.path.dirname(__file__),'roomscan.py'),src,os.path.join(d,'o.ifc')],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stdout);self.assertEqual(json.loads(r.stdout)['counts']['rooms'],2)

if __name__=='__main__':unittest.main()
