"""Tests of the deterministic plan measurement against self-made plans with known dimensions.

Run from dashboard/backend/plan-extract:  python -m unittest discover -s tests
"""
import json, os, pathlib, shutil, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
FIX = os.path.normpath(os.path.join(ROOT, '..', 'test', 'fixtures', 'plans'))

import ifcopenshell, ifcopenshell.validate
from planextract.extract import extract
from planextract.build import build
from planextract.scale import parse_dimension
from planextract.primitives import Plan, Seg
from planextract.detect import Detector
from planextract import read_dxf

EXPECTED = json.loads(pathlib.Path(FIX, 'expected.json').read_text(encoding='utf-8'))
CASES = [('haus-rechteck-bloecke.dxf', 'dxf', 'haus-rechteck'), ('haus-l-cm-ohne-einheit.dxf', 'dxf', 'haus-l'),
         ('haus-rechteck-1zu100.pdf', 'pdf', 'haus-rechteck'), ('haus-l-1zu50.pdf', 'pdf', 'haus-l')]


def err(measured, truth):
    return abs(measured - truth) / truth * 100


class FixturePlans(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.work = tempfile.mkdtemp()
        cls.results = {f: extract([(os.path.join(FIX, f), k)], cls.work) for f, k, _ in CASES}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.work, ignore_errors=True)

    def test_counts_and_dimensions(self):
        for f, kind, house in CASES:
            with self.subTest(plan=f):
                exp = EXPECTED[house]
                res = self.results[f]
                self.assertEqual(res['skipped'], [])
                level = res['levels'][0]
                kinds = [o['kind'] for o in level['openings']]
                self.assertEqual(len(level['walls']), exp['walls'])
                self.assertEqual(kinds.count('door'), exp['doors'])
                self.assertEqual(kinds.count('window'), exp['windows'])
                self.assertEqual(kinds.count('opening'), 0)
                self.assertLessEqual(err(level['width'], exp['width']), 2.0)
                self.assertLessEqual(err(level['depth'], exp['depth']), 2.0)
                thick = sorted({round(w['thickness']) for w in level['walls']})
                self.assertEqual(thick, sorted(set(exp['inner_thickness'] + [exp['outer_thickness']])))

    def test_rooms_named_with_areas(self):
        for f, kind, house in CASES:
            with self.subTest(plan=f):
                rooms = {r['name']: r for r in self.results[f]['levels'][0]['rooms']}
                self.assertEqual(set(rooms), set(EXPECTED[house]['rooms']))
                for name, area in EXPECTED[house]['rooms'].items():
                    self.assertLessEqual(err(rooms[name]['area_m2'], area), 2.0, name)
                    self.assertGreaterEqual(rooms[name]['doors'], 1, name)

    def test_scale_from_dimensions(self):
        pdf = self.results['haus-rechteck-1zu100.pdf']['levels'][0]['scale']
        self.assertEqual((pdf['method'], pdf['ratio']), ('dimensions', 100))
        self.assertGreaterEqual(pdf['support'], 5)
        self.assertTrue(all(e['error_pct'] <= 2 for e in pdf['evidence']))
        self.assertEqual(self.results['haus-l-1zu50.pdf']['levels'][0]['scale']['ratio'], 50)
        cm = self.results['haus-l-cm-ohne-einheit.dxf']['levels'][0]['scale']
        self.assertEqual((cm['method'], cm['mm_per_unit']), ('dimensions', 10.0))
        self.assertEqual(self.results['haus-rechteck-bloecke.dxf']['levels'][0]['scale']['method'], 'units')

    def test_layers_and_blocks_are_used(self):
        level = self.results['haus-rechteck-bloecke.dxf']['levels'][0]
        self.assertEqual(level['detection'], 'layer')
        self.assertTrue(all(o['evidence'].startswith('block:') for o in level['openings']))

    def test_text_only_pdf_gives_no_model(self):
        res = extract([(os.path.join(FIX, 'nur-text.pdf'), 'pdf')], self.work)
        self.assertEqual(res['levels'], [])
        self.assertEqual(res['skipped'][0]['reason'], 'no_walls')

    def test_scanned_pdf_with_vector_frame_goes_the_raster_path(self):
        # The page frame is not a building; the scanned image inside (two rooms) is recognised from pixels.
        res = extract([(os.path.join(FIX, 'scan-mit-rahmen.pdf'), 'pdf')], self.work)
        self.assertEqual(len(res['levels']), 1)
        level = res['levels'][0]
        self.assertEqual(level['source']['kind'], 'raster')
        self.assertEqual(len(level['rooms']), 2)
        self.assertTrue(level['scale']['estimated'])

    def test_several_plans_become_storeys(self):
        res = extract([(os.path.join(FIX, 'haus-rechteck-1zu100.pdf'), 'pdf'), (os.path.join(FIX, 'haus-l-cm-ohne-einheit.dxf'), 'dxf')], self.work)
        self.assertEqual([l['name'] for l in res['levels']], ['EG', '1. OG'])
        self.assertEqual(res['levels'][1]['elevation'], 2700.0)


class Conventions(unittest.TestCase):
    def test_dimension_texts(self):
        self.assertEqual(parse_dimension('4,00'), [4000.0])
        self.assertEqual(parse_dimension('1,01⁵'), [1015.0])
        self.assertEqual(parse_dimension('36⁵'), [365])
        self.assertIn(240, parse_dimension('24'))
        self.assertEqual(parse_dimension('7'), [])
        self.assertEqual(parse_dimension('Küche'), [])

    def test_window_with_continuous_face_lines(self):
        T, W, D = 300, 6000, 4000
        segs = [Seg((0, 0), (W, 0)), Seg((W, 0), (W, D)), Seg((W, D), (0, D)), Seg((0, D), (0, 0)),
                Seg((T, T), (W - T, T)), Seg((W - T, T), (W - T, D - T)), Seg((W - T, D - T), (T, D - T)), Seg((T, D - T), (T, T)),
                Seg((2000, 150), (3200, 150)), Seg((2000, 0), (2000, T)), Seg((3200, 0), (3200, T))]
        walls = Detector(Plan('dxf', segs=segs), set()).build()
        self.assertEqual(len(walls), 4)
        openings = [o for w in walls for o in w['openings']]
        self.assertEqual([(o['kind'], round(o['s1'] - o['s0'])) for o in openings], [('window', 1200)])

    def test_dwg_is_converted_in_separate_process(self):
        calls = []

        def fake(cmd, **kw):
            calls.append(cmd)
            shutil.copy(os.path.join(FIX, 'haus-rechteck-bloecke.dxf'), cmd[cmd.index('-o') + 1])
        with tempfile.TemporaryDirectory() as work:
            plan = read_dxf.read_dxf(read_dxf.dwg_to_dxf('/nonexistent/plan.dwg', work, binary='/opt/libredwg/bin/dwg2dxf', runner=fake))
        self.assertEqual(calls[0][0], '/opt/libredwg/bin/dwg2dxf')
        self.assertGreater(len(plan.segs), 20)

    def test_failed_dwg_conversion_is_reported(self):
        with tempfile.TemporaryDirectory() as work:
            dwg = os.path.join(work, 'x.dwg')
            pathlib.Path(dwg).write_bytes(b'AC1032' + b'\0' * 200)
            res = extract([(dwg, 'dwg')], work)
        self.assertEqual(res['levels'], [])
        self.assertEqual(res['skipped'][0]['reason'], 'dwg_conversion_failed')


class BuildIFC(unittest.TestCase):
    def setUp(self):
        self.work = tempfile.mkdtemp()
        self.cand = extract([(os.path.join(FIX, 'haus-rechteck-1zu100.pdf'), 'pdf')], self.work)

    def tearDown(self):
        shutil.rmtree(self.work, ignore_errors=True)

    def run_build(self, review=None):
        ifc, png = os.path.join(self.work, 'm.ifc'), os.path.join(self.work, 'p.png')
        res = build(self.cand, review, ifc, png)
        return res, ifcopenshell.open(ifc), png

    def test_ifc_contents_and_quality_report(self):
        res, f, png = self.run_build()
        log = ifcopenshell.validate.json_logger()
        ifcopenshell.validate.validate(f, log)
        self.assertEqual(log.statements, [])
        self.assertEqual(len(f.by_type('IfcWall')), 7)
        self.assertEqual(len(f.by_type('IfcDoor')), 4)
        self.assertEqual(len(f.by_type('IfcWindow')), 5)
        self.assertEqual(len(f.by_type('IfcOpeningElement')), 9)
        spaces = {s.Name for s in f.by_type('IfcSpace')}
        self.assertEqual(spaces, {'Küche', 'Wohnen', 'Bad', 'Schlafen'})
        widths = sorted({round(q.LengthValue, 3)
                         for w in f.by_type('IfcWall') for rel in w.IsDefinedBy if rel.is_a('IfcRelDefinesByProperties')
                         and rel.RelatingPropertyDefinition.is_a('IfcElementQuantity') for q in rel.RelatingPropertyDefinition.Quantities if q.Name == 'Width'})
        self.assertEqual(widths, [0.115, 0.24, 0.365])
        q = res['quality']['levels'][0]
        self.assertEqual((q['walls'], q['doors'], q['windows'], q['rooms']), (7, 4, 5, 4))
        self.assertEqual(q['rooms_without_door'], [])
        self.assertLessEqual(q['dimension_max_error_pct'], 2.0)
        self.assertEqual(res['quality']['grade'], 'gut')
        self.assertTrue(any('1:100' in s for s in res['summary']))
        self.assertEqual(pathlib.Path(png).read_bytes()[:8], b'\x89PNG\r\n\x1a\n')

    def test_review_uses_ids_only(self):
        level = self.cand['levels'][0]
        win = next(o for o in level['openings'] if o['kind'] == 'window')
        partition = next(w for w in level['walls'] if round(w['thickness']) == 115 and any(o['wall'] == w['id'] for o in level['openings']))
        review = {'levels': [{'walls': [{'id': partition['id'], 'is_wall': False}, {'id': 'W999', 'is_wall': False}],
                              'openings': [{'id': win['id'], 'kind': 'window', 'height': 1500, 'sill': 600}, {'id': 'O77', 'kind': 'door'}],
                              'rooms': [{'id': 'R1', 'name': 'Ignoriert, da Planbeschriftung'}], 'storey_height': 2750}]}
        res, f, png = self.run_build(review)
        q = res['quality']['levels'][0]
        self.assertEqual(q['walls'], 6)
        self.assertEqual(q['rooms'], 3)
        self.assertEqual(len(f.by_type('IfcBuildingStorey')), 1)
        self.assertEqual(len(f.by_type('IfcSpace')), 3)
        self.assertEqual(f.by_type('IfcBuildingStorey')[0].Elevation, 0.0)
        w = next(e for e in f.by_type('IfcWindow') if abs(e.OverallHeight - 1.5) < 1e-6)
        self.assertAlmostEqual(w.OverallWidth, win['width'] / 1000, places=3)
        self.assertTrue(any('verworfen' in s for s in res['warnings']))

    def test_review_cannot_delete_most_walls(self):
        review = {'levels': [{'walls': [{'id': w['id'], 'is_wall': False} for w in self.cand['levels'][0]['walls']]}]}
        res, f, png = self.run_build(review)
        self.assertEqual(len(f.by_type('IfcWall')), 7)
        self.assertTrue(any('ignoriert' in s for s in res['warnings']))


class CommandLine(unittest.TestCase):
    def test_extract_and_build(self):
        with tempfile.TemporaryDirectory() as work:
            cand, labels = os.path.join(work, 'c.json'), os.path.join(work, 'l.png')
            out = subprocess.run([sys.executable, os.path.join(ROOT, 'run.py'), 'extract', '--out', cand, '--labels', labels,
                                  os.path.join(FIX, 'haus-l-1zu50.pdf') + ':pdf'], capture_output=True, text=True, timeout=120)
            self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
            self.assertEqual(json.loads(out.stdout)['levels'], 1)
            self.assertTrue(os.path.getsize(labels) > 1000)
            rep = os.path.join(work, 'r.json')
            out = subprocess.run([sys.executable, os.path.join(ROOT, 'run.py'), 'build', '--candidates', cand, '--ifc', os.path.join(work, 'm.ifc'),
                                  '--preview', os.path.join(work, 'p.png'), '--report', rep], capture_output=True, text=True, timeout=120)
            self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
            self.assertEqual(json.loads(pathlib.Path(rep).read_text(encoding='utf-8'))['quality']['levels'][0]['doors'], 3)

    def test_errors_are_codes_only(self):
        with tempfile.TemporaryDirectory() as work:
            out = subprocess.run([sys.executable, os.path.join(ROOT, 'run.py'), 'build', '--candidates', os.path.join(work, 'missing.json'),
                                  '--ifc', 'x', '--preview', 'y', '--report', 'z'], capture_output=True, text=True, timeout=60)
            self.assertEqual(out.returncode, 1)
            self.assertEqual(json.loads(out.stdout), {'error': 'FileNotFoundError'})


if __name__ == '__main__':
    unittest.main()
