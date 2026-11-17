"""Regressions for room labels seen in CAD text and combined PDF/OCR items."""
import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from planextract.primitives import Text
from planextract.rooms import find_rooms

class RoomLabels(unittest.TestCase):
    def rooms(self, *labels):
        points=[(0,0),(5000,0),(5000,4000),(0,4000)]
        walls=[{'id':f'W{i}','a':a,'b':points[(i+1)%4],'thickness':200} for i,a in enumerate(points)]
        return find_rooms(walls,[Text(label,(2000,2000),height=100) for label in labels])[0]

    def test_numbered_names(self):
        for name in ['Büro 1','01 Büro','Zimmer 2.03','WC 01','Wohn-/Esszimmer']:
            with self.subTest(name=name):
                self.assertEqual(self.rooms(name)[0]['name'],name)

    def test_combined_name_and_area(self):
        room=self.rooms('Küche\n12,50 m²')[0]
        self.assertEqual((room['name'],room['labelled_area_m2']),('Küche',12.5))

    def test_integer_area_and_separate_name(self):
        room=self.rooms('Büro 2','12 m2')[0]
        self.assertEqual((room['name'],room['labelled_area_m2']),('Büro 2',12))

    def test_measurements_are_not_names(self):
        room=self.rooms('1200','m²','BRH','BRH 90','2,50 m','0 m²')[0]
        self.assertEqual((room['name_source'],room['labelled_area_m2']),('default',None))

    def test_does_not_invent_missing_rooms(self):
        rooms,outline=find_rooms([{'id':'W1','a':[0,0],'b':[5000,0],'thickness':200}],[])
        self.assertEqual(rooms,[])

    def test_small_partition_gap_recovers_two_rooms_but_keeps_walls(self):
        import copy
        points=[(0,0),(6000,0),(6000,4000),(0,4000)]
        walls=[{'id':f'W{i}','a':a,'b':points[(i+1)%4],'thickness':200} for i,a in enumerate(points)]
        # Wall starts 20 mm outside contact with the outer wall's inner face.
        walls.append({'id':'partition','a':(3000,220),'b':(3000,4000),'thickness':200})
        before=copy.deepcopy(walls)
        rooms,_=find_rooms(walls,[])
        self.assertEqual(len(rooms),2)
        self.assertTrue(all(r.get('boundary_repaired') for r in rooms))
        self.assertEqual(walls,before)
        # A real 900 mm passage remains open, joining the two areas.
        walls[-1]['a']=(3000,1100)
        rooms,_=find_rooms(walls,[])
        self.assertEqual(len(rooms),1)
        self.assertFalse(rooms[0].get('boundary_repaired',False))

if __name__=='__main__':unittest.main()
