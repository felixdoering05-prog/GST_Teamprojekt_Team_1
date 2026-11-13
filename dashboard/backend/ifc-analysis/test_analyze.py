import tempfile,unittest
import ifcopenshell,ifcopenshell.api
from analyze import analyze
class AnalysisTest(unittest.TestCase):
    def report(self,name=None):
        m=ifcopenshell.api.run('project.create_file',version='IFC4')
        ifcopenshell.api.run('root.create_entity',m,ifc_class='IfcProject',name='Synthetic')
        if name is not None:
            storey=ifcopenshell.api.run('root.create_entity',m,ifc_class='IfcBuildingStorey',name='EG')
            space=ifcopenshell.api.run('root.create_entity',m,ifc_class='IfcSpace',name=name)
            ifcopenshell.api.run('aggregate.assign_object',m,products=[space],relating_object=storey)
        with tempfile.NamedTemporaryFile(suffix='.ifc') as f:
            m.write(f.name);return analyze(f.name)
    def test_missing_spaces_are_not_invented(self):
        r=self.report();self.assertEqual(r['rooms'],[]);self.assertTrue(r['warnings'])
    def test_named_room_and_floor(self):
        r=self.report('Office');self.assertEqual(r['rooms'][0]['name'],'Office');self.assertEqual(r['rooms'][0]['storey'],'EG');self.assertTrue(all(x['passed'] for x in r['information_rules']))
    def test_empty_room_name_fails_information_rule(self):
        r=self.report('');self.assertFalse(r['information_rules'][0]['passed']);self.assertTrue(r['warnings'])
if __name__=='__main__':unittest.main()
