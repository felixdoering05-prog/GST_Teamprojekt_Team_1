import os,tempfile,unittest
import ifcopenshell,ifcopenshell.api
from insights import insights,diff
def model():
    m=ifcopenshell.api.run('project.create_file',version='IFC4')
    ifcopenshell.api.run('root.create_entity',m,ifc_class='IfcProject',name='Synthetic')
    ifcopenshell.api.run('unit.assign_unit',m)
    ctx=ifcopenshell.api.run('context.add_context',m,context_type='Model')
    body=ifcopenshell.api.run('context.add_context',m,context_type='Model',context_identifier='Body',target_view='MODEL_VIEW',parent=ctx)
    site=ifcopenshell.api.run('root.create_entity',m,ifc_class='IfcSite');building=ifcopenshell.api.run('root.create_entity',m,ifc_class='IfcBuilding')
    storey=ifcopenshell.api.run('root.create_entity',m,ifc_class='IfcBuildingStorey',name='EG')
    ifcopenshell.api.run('aggregate.assign_object',m,products=[site],relating_object=m.by_type('IfcProject')[0])
    ifcopenshell.api.run('aggregate.assign_object',m,products=[building],relating_object=site)
    ifcopenshell.api.run('aggregate.assign_object',m,products=[storey],relating_object=building)
    def element(cls,name,length,height,thickness):
        e=ifcopenshell.api.run('root.create_entity',m,ifc_class=cls,name=name)
        rep=ifcopenshell.api.run('geometry.add_wall_representation',m,context=body,length=length,height=height,thickness=thickness)
        ifcopenshell.api.run('geometry.assign_representation',m,product=e,representation=rep)
        ifcopenshell.api.run('geometry.edit_object_placement',m,product=e)
        ifcopenshell.api.run('spatial.assign_container',m,products=[e],relating_structure=storey)
        return e
    wall=element('IfcWall','Außenwand Süd',5,2.5,0.3)
    pset=ifcopenshell.api.run('pset.add_pset',m,product=wall,name='Pset_WallCommon')
    ifcopenshell.api.run('pset.edit_pset',m,pset=pset,properties={'IsExternal':True,'LoadBearing':True})
    mat=ifcopenshell.api.run('material.add_material',m,name='Beton');ifcopenshell.api.run('material.assign_material',m,products=[wall],material=mat)
    element('IfcFurnishingElement','Schrank',1,2,0.6)  # overlaps the wall
    return m
class InsightsTest(unittest.TestCase):
    def setUp(self):
        self.dir=tempfile.TemporaryDirectory();self.path=os.path.join(self.dir.name,'a.ifc');self.m=model();self.m.write(self.path)
    def tearDown(self):self.dir.cleanup()
    def test_index_quantities_clashes(self):
        r=insights(self.path)
        wall=next(e for e in r['elements']['items'] if e['c']=='IfcWall')
        self.assertEqual((wall['n'],wall['s'],wall['m'],wall['x'],wall['l']),('Außenwand Süd','EG','Beton',True,True))
        q=r['quantities']['by_type']['IfcWall'];self.assertEqual(q['count'],1);self.assertAlmostEqual(q['NetSideArea_m2'],12.5,places=1)
        self.assertAlmostEqual(r['quantities']['by_storey']['EG']['external_wall_net_side_area_m2'],12.5,places=1)
        self.assertEqual(r['clashes']['count'],1);self.assertEqual({r['clashes']['items'][0]['a']['class'],r['clashes']['items'][0]['b']['class']},{'IfcWall','IfcFurnishingElement'})
    def test_diff(self):
        new=os.path.join(self.dir.name,'b.ifc');self.m.by_type('IfcWall')[0].Name='Umbenannt'
        ifcopenshell.api.run('root.remove_product',self.m,product=self.m.by_type('IfcFurnishingElement')[0]);self.m.write(new)
        d=diff(self.path,new)
        self.assertEqual((d['deleted_count'],d['changed_count'],d['added_count'],d['common_count']),(1,1,0,1))
        self.assertEqual(d['changed'][0]['name'],'Umbenannt');self.assertEqual(d['deleted'][0]['class'],'IfcFurnishingElement')
if __name__=='__main__':unittest.main()
