import tempfile,unittest
import ifcopenshell,ifcopenshell.api
from analyze import analyze,room_storey
class AnalysisTest(unittest.TestCase):
    def report(self,name=None,area=None,box=False):
        m=ifcopenshell.api.run('project.create_file',version='IFC4')
        ifcopenshell.api.run('root.create_entity',m,ifc_class='IfcProject',name='Synthetic')
        if name is not None:
            storey=ifcopenshell.api.run('root.create_entity',m,ifc_class='IfcBuildingStorey',name='EG')
            space=ifcopenshell.api.run('root.create_entity',m,ifc_class='IfcSpace',name=name)
            ifcopenshell.api.run('aggregate.assign_object',m,products=[space],relating_object=storey)
            if box:
                ifcopenshell.api.run('unit.assign_unit',m)
                model=ifcopenshell.api.run('context.add_context',m,context_type='Model')
                body=ifcopenshell.api.run('context.add_context',m,context_type='Model',context_identifier='Body',target_view='MODEL_VIEW',parent=model)
                rep=ifcopenshell.api.run('geometry.add_wall_representation',m,context=body,length=4,height=2.5,thickness=3)
                ifcopenshell.api.run('geometry.assign_representation',m,product=space,representation=rep)
            if area is not None:
                ifcopenshell.api.run('unit.assign_unit',m)
                qto=ifcopenshell.api.run('pset.add_qto',m,product=space,name='Qto_SpaceBaseQuantities')
                ifcopenshell.api.run('pset.edit_qto',m,qto=qto,properties={'NetFloorArea':area})
        with tempfile.NamedTemporaryFile(suffix='.ifc') as f:
            m.write(f.name);return analyze(f.name)
    def test_missing_spaces_are_not_invented(self):
        r=self.report();self.assertEqual(r['rooms'],[]);self.assertTrue(r['warnings'])
    def test_named_room_and_floor(self):
        r=self.report('Office');self.assertEqual(r['rooms'][0]['name'],'Office');self.assertEqual(r['rooms'][0]['storey'],'EG');self.assertTrue(all(x['passed'] for x in r['information_rules']))
    def test_empty_room_name_fails_information_rule(self):
        r=self.report('');self.assertFalse(r['information_rules'][0]['passed']);self.assertTrue(r['warnings'])
    def test_declared_floor_area(self):
        r=self.report('Office',area=23.456);self.assertEqual(r['rooms'][0]['area_m2'],23.46);self.assertEqual(r['version'],4);self.assertEqual(r['rooms'][0]['area_source'],'ifc_mengen')
    def test_missing_area_stays_unknown(self):
        self.assertIsNone(self.report('Office')['rooms'][0]['area_m2'])
    def test_geometric_floor_area_volume_height(self):
        room=self.report('Office',box=True)['rooms'][0]
        self.assertEqual((room['area_m2'],room['area_source'],room['volume_m3'],room['height_m']),(12.0,'geometrie',30.0,2.5))
    def test_declared_area_wins_over_geometry(self):
        room=self.report('Office',area=11.5,box=True)['rooms'][0]
        self.assertEqual((room['area_m2'],room['area_source'],room['floor_area_m2']),(11.5,'ifc_mengen',12.0))
    def test_nested_space_inherits_storey(self):
        m=ifcopenshell.api.run('project.create_file',version='IFC4')
        storey=m.create_entity('IfcBuildingStorey',GlobalId=ifcopenshell.guid.new(),Name='2. OG')
        parent=m.create_entity('IfcSpace',GlobalId=ifcopenshell.guid.new(),Name='Bereich')
        room=m.create_entity('IfcSpace',GlobalId=ifcopenshell.guid.new(),Name='Büro 2.03')
        m.create_entity('IfcRelAggregates',GlobalId=ifcopenshell.guid.new(),RelatingObject=storey,RelatedObjects=[parent])
        m.create_entity('IfcRelAggregates',GlobalId=ifcopenshell.guid.new(),RelatingObject=parent,RelatedObjects=[room])
        self.assertEqual(room_storey(room),storey)
        with tempfile.NamedTemporaryFile(suffix='.ifc') as f:
            m.write(f.name)
            self.assertTrue(all(r['storey']=='2. OG' for r in analyze(f.name)['rooms']))

    def test_unknown_and_cyclic_storey_stay_unknown(self):
        m=ifcopenshell.api.run('project.create_file',version='IFC4')
        room=m.create_entity('IfcSpace',GlobalId=ifcopenshell.guid.new(),Name='Raum')
        parent=m.create_entity('IfcSpace',GlobalId=ifcopenshell.guid.new(),Name='Bereich')
        self.assertIsNone(room_storey(room))
        m.create_entity('IfcRelAggregates',GlobalId=ifcopenshell.guid.new(),RelatingObject=parent,RelatedObjects=[room])
        m.create_entity('IfcRelAggregates',GlobalId=ifcopenshell.guid.new(),RelatingObject=room,RelatedObjects=[parent])
        self.assertIsNone(room_storey(room))

    def test_conflicting_storeys_stay_unknown(self):
        m=ifcopenshell.api.run('project.create_file',version='IFC4')
        room=m.create_entity('IfcSpace',GlobalId=ifcopenshell.guid.new(),Name='Raum')
        for name in ['EG','OG']:
            storey=m.create_entity('IfcBuildingStorey',GlobalId=ifcopenshell.guid.new(),Name=name)
            m.create_entity('IfcRelAggregates',GlobalId=ifcopenshell.guid.new(),RelatingObject=storey,RelatedObjects=[room])
        self.assertIsNone(room_storey(room))

if __name__=='__main__':unittest.main()
