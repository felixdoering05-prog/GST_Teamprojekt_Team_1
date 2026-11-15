import json,subprocess,sys
from pathlib import Path
import numpy as np,pytest
from plan_raster import extract
from plan_raster.pipeline import transform
ROOT=Path(__file__).resolve().parents[1]

def test_measured_rectangle_and_rooms():
    r=extract(ROOT/'testdata/clean.png','100,100,600,100,10000',perspective=False)
    assert r['scale_source']=='user';assert abs(r['scale_mm_per_px']-20)<.05
    assert len(r['levels'][0]['walls'])>=5;assert len(r['levels'][0]['rooms'])==2
    assert r['levels'][0]['walls'][0]['id'].startswith('W')
    assert all(o['wall'] in {w['id'] for w in r['levels'][0]['walls']} for o in r['levels'][0]['openings'])

def test_unscaled_is_explicitly_estimated():
    r=extract(ROOT/'testdata/clean.png');assert r['scale_source']=='estimated'
    assert all(room['area_estimated'] for room in r['levels'][0]['rooms']);assert 'KEIN' in ' '.join(r['warnings'])

@pytest.mark.parametrize('scale',['1,1,1,1,1000','1,1,5,5,-1','nan,1,5,5,1000'])
def test_invalid_scale(scale):
    with pytest.raises(ValueError):extract(ROOT/'testdata/clean.png',scale)

def test_learned_not_silently_faked():
    with pytest.raises(ValueError,match='Lernmodell'):extract(ROOT/'testdata/clean.png',method='learned')

def test_debug_and_cli(tmp_path):
    result=subprocess.run([sys.executable,'-m','plan_raster',str(ROOT/'testdata/clean.png'),'--out',str(tmp_path/'result.json'),'--debug-dir',str(tmp_path/'debug')],capture_output=True)
    assert result.returncode==0,result.stderr
    assert len(list((tmp_path/'debug').glob('*.png')))==6
    assert json.loads((tmp_path/'result.json').read_text())['source']=='raster'

def test_measurement_corpus_is_real_and_finite():
    from evaluate import evaluate
    cases=json.loads((ROOT/'testdata/expected.json').read_text())
    assert len(cases)==7
    for case in cases:
        r=evaluate(case)
        assert 0<=r['wall_recall']<=1 and 0<=r['wall_precision']<=1.001
        assert r['runtime_seconds']>0
        if case['name']=='clean':assert r['wall_recall']>=.8 and r['rooms_found']==2
        if case['name']=='thin-lines':assert r['wall_recall']<1

@pytest.mark.parametrize('name,metric',[('door','doors_found'),('window','windows_found')])
def test_known_opening_symbols(name,metric):
    from evaluate import evaluate
    cases=json.loads((ROOT/'testdata/expected.json').read_text())
    case=next(c for c in cases if c['name']==name)
    r=evaluate(case);assert r[metric]==1

def test_y_up_and_phase_one_wall_references():
    r=extract(ROOT/'testdata/window.png','100,100,600,100,10000',perspective=False)
    level=r['levels'][0];assert len(level['boundary'])>=4
    assert all(w['length']>0 and w['thickness']>0 for w in level['walls'])
    assert all(o['wall'] in {w['id'] for w in level['walls']} for o in level['openings'])
    assert level['scale']['mm_per_unit']==r['scale_mm_per_px']
    # Top edge in the image has greater y than bottom edge in output millimetres.
    horizontal=[w for w in level['walls'] if abs(w['a'][1]-w['b'][1])<1]
    assert max(w['a'][1] for w in horizontal)-min(w['a'][1] for w in horizontal)>5900
