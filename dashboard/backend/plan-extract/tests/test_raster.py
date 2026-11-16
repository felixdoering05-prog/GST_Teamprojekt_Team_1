"""Photos and scans (raster path) against the self-made test set with known geometry.

Run from dashboard/backend/plan-extract:  python -m unittest discover -s tests
The thresholds are the measured state of this version (see docs/plan-raster-messung.md); they guard against
regressions, they are not a promise for real-world plans.
"""
import copy, json, os, shutil, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import ifcopenshell
from raster_eval import evaluate, FIX
from planextract.extract import extract
from planextract.build import build, apply_review
from planextract.raster import extract_raster, rescale

VEC = os.path.normpath(os.path.join(FIX, '..'))


class MeasuringStick(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = evaluate('neu')
        cls.rows_dims = evaluate('neu+masse')

    def test_always_a_model(self):
        self.assertEqual(sum(r['modell'] for r in self.rows), len(self.rows))

    def test_most_plans_usable(self):
        self.assertGreaterEqual(sum(r['brauchbar'] for r in self.rows), 9)
        self.assertGreaterEqual(sum(r['waende'] for r in self.rows) / len(self.rows), 80)
        self.assertGreaterEqual(sum(r['raeume'] for r in self.rows) / len(self.rows), 80)

    def test_clean_plans_are_exact_in_shape(self):
        for r in self.rows:
            if r['style'] in ('gefuellt', 'scan'):
                with self.subTest(plan=r['file']):
                    self.assertGreaterEqual(r['waende'], 95)

    def test_read_overall_dimensions_fix_the_scale(self):
        good = [r for r in self.rows_dims if r['style'] != 'skizze']
        self.assertTrue(all(r['mass'] is not None and r['mass'] <= 10 for r in good), [(r['file'], r['mass']) for r in good])


class RasterPipeline(unittest.TestCase):
    def setUp(self):
        self.work = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.work, ignore_errors=True)

    def test_photo_to_ifc(self):
        plans = os.path.join(self.work, 'plans')
        os.makedirs(plans)
        res = extract([(os.path.join(FIX, 'gross-gefuellt-foto.jpg'), 'image')], self.work, plans)
        level = res['levels'][0]
        self.assertEqual(level['source']['kind'], 'raster')
        self.assertTrue(level['scale']['estimated'])
        self.assertTrue(os.path.exists(os.path.join(plans, level['raster']['image'])))
        review = {'levels': [{'walls': [], 'openings': [], 'rooms': [{'id': 'R1', 'name': 'Wohnen'}], 'storey_height': 0,
                              'overall_width_mm': 12000, 'overall_depth_mm': 9000}]}
        ifc, png = os.path.join(self.work, 'm.ifc'), os.path.join(self.work, 'p.png')
        out = build(res, review, ifc, png)
        rep = out['quality']['levels'][0]
        self.assertEqual(rep['source'], 'raster')
        self.assertFalse(rep['scale']['estimated'])
        self.assertLess(abs(rep['width_mm'] - 12000) / 12000, 0.03)
        self.assertEqual(out['quality']['grade'], 'prüfen')      # photos are never "gut" automatically
        f = ifcopenshell.open(ifc)
        self.assertGreaterEqual(len(f.by_type('IfcWall')), 6)
        self.assertGreaterEqual(len(f.by_type('IfcSpace')), 6)
        self.assertTrue(any('Foto/Scan' in s for s in out['summary']))

    def test_vector_plan_beats_photo_of_it(self):
        res = extract([(os.path.join(VEC, 'haus-rechteck-1zu100.pdf'), 'pdf'), (os.path.join(FIX, 'rechteck-foto.jpg'), 'image')], self.work)
        self.assertEqual([l['source']['kind'] for l in res['levels']], ['pdf'])

    def test_duplicate_photos_become_one_storey(self):
        res = extract([(os.path.join(FIX, 'gross-gefuellt.png'), 'image'), (os.path.join(FIX, 'gross-gefuellt-foto.jpg'), 'image')], self.work)
        self.assertEqual(len(res['levels']), 1)
        self.assertTrue(res['notes'])

    def test_inconsistent_or_absurd_dimensions_are_not_trusted(self):
        level, _ = extract_raster(os.path.join(FIX, 'gross-gefuellt.png'))
        level['name'] = 'EG'
        w = []
        lv = apply_review(level, {'overall_width_mm': 12000, 'overall_depth_mm': 30000}, w)
        self.assertTrue(any('passen nicht' in x for x in w))
        self.assertLess(abs(lv['width'] - 12000) / 12000, 0.05)
        w = []
        lv = apply_review(level, {'overall_width_mm': 99000, 'overall_depth_mm': 0}, w)
        self.assertTrue(lv['scale']['estimated'])

    def test_rescale_keeps_ids_and_scales_areas(self):
        level, _ = extract_raster(os.path.join(FIX, 'rechteck-gefuellt.png'))
        before = copy.deepcopy(level)
        rescale(level, 2.0)
        self.assertEqual([w['id'] for w in level['walls']], [w['id'] for w in before['walls']])
        self.assertAlmostEqual(level['rooms'][0]['area_m2'], before['rooms'][0]['area_m2'] * 4, delta=0.05)

    def test_unreadable_and_empty_images(self):
        bad = os.path.join(self.work, 'x.png')
        with open(bad, 'wb') as f:
            f.write(b'\x89PNG\r\n\x1a\nnot an image')
        blank = os.path.join(self.work, 'blank.png')
        import numpy as np, cv2
        cv2.imwrite(blank, np.full((400, 600), 255, np.uint8))
        res = extract([(bad, 'image'), (blank, 'image')], self.work)
        self.assertEqual(res['levels'], [])
        self.assertEqual({s['reason'] for s in res['skipped']}, {'unreadable', 'no_walls'})


if __name__ == '__main__':
    unittest.main()
