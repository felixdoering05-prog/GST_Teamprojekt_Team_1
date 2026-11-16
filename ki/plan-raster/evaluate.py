import json,math,platform,resource,sys
from pathlib import Path
import cv2,numpy as np
from shapely.geometry import LineString
from shapely.ops import unary_union
from plan_raster import extract
from plan_raster.pipeline import transform
ROOT=Path(__file__).parent

def evaluate(case):
    image_transform=np.array(case['image_transform'])
    ref=transform(case['reference'],image_transform)
    scale=','.join(str(float(x)) for x in [*ref[0],*ref[1],case['reference_mm']])
    result=extract(ROOT/'testdata'/case['image'],scale,debug_dir=ROOT/'testdata'/'debug'/case['name'])
    mm=result['scale_mm_per_px'];matrix=np.linalg.inv(image_transform)@np.linalg.inv(np.array(result['original_to_normalized']))
    # Convert output mm back to normalized pixels, then into the original synthetic reference plane.
    h=result['levels'][0]['depth']/mm
    def back(points):return transform([[p[0]/mm,h-1-p[1]/mm] for p in points],matrix)
    found=[LineString(back([w['a'],w['b']])) for w in result['levels'][0]['walls']]
    expected=[LineString(w) for w in case['walls']]
    union=unary_union([l.buffer(8,cap_style=2) for l in found])
    coverage=[e.intersection(union).length/e.length for e in expected]
    precision=sum(f.intersection(unary_union([e.buffer(8,cap_style=2) for e in expected])).length for f in found)/max(1,sum(f.length for f in found))
    doors=[back([o['at']])[0] for o in result['levels'][0]['openings'] if o['kind']=='door']
    windows=[back([o['at']])[0] for o in result['levels'][0]['openings'] if o['kind']=='window']
    # Geometric scale check: recovered overall span of wall centres versus known 10 m.
    pixelwalls=[p for w in result['levels'][0]['walls'] for p in [w['a'],w['b']]]
    span=max(p[0] for p in pixelwalls)-min(p[0] for p in pixelwalls) if pixelwalls else None
    error=abs(span-case['reference_mm'])/case['reference_mm']*100 if span is not None else None
    hits=lambda gt,pred:sum(any(np.linalg.norm(np.array(g)-p)<18 for p in pred) for g in gt)
    return dict(name=case['name'],wall_coverage=sum(coverage)/len(coverage),wall_recall=sum(c>=.8 for c in coverage)/len(coverage),wall_precision=precision,doors_found=hits(case['doors'],doors),doors_present=len(case['doors']),door_predictions=len(doors),windows_found=hits(case['windows'],windows),windows_present=len(case['windows']),scale_error_percent=error,rooms_found=len(result['levels'][0]['rooms']),rooms_expected=case['rooms'],runtime_seconds=result['diagnostics']['runtime_seconds'])

def main():
    cases=json.loads((ROOT/'testdata'/'expected.json').read_text());rows=[evaluate(c) for c in cases]
    lines=['# Evaluation: Raster-Grundrissprototyp','', 'Reale Ausführung auf synthetischem, selbst erzeugtem Messsatz. Kein Genauigkeitsnachweis für Hochschulpläne oder echte Handyfotos.','',f'Umgebung: {platform.system()} {platform.machine()}, Python {platform.python_version()}, OpenCV {cv2.__version__}.', '', 'Wand-Recall: Anteil Referenzsegmente mit mindestens 80 % Längenabdeckung bei 8 px Toleranz. Präzision: vorhergesagte Segmentlänge nahe Referenzwänden. Maßfehler: Breite der erkannten Wandmittellinien gegen bekannte 10 m; bei leeren Ergebnissen n/a.','', '| Plan | Weg | Wand-Recall | Wandabdeckung | Präzision | Türen Treffer/Soll (Vorhersagen) | Fenster Treffer/Soll | Maßfehler | Räume Ist/Soll | Laufzeit |','|---|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for r in rows:
        err='n/a' if r['scale_error_percent'] is None else f"{r['scale_error_percent']:.2f}%"
        lines.append(f"| {r['name']} | klassisch | {r['wall_recall']:.0%} | {r['wall_coverage']:.0%} | {r['wall_precision']:.0%} | {r['doors_found']}/{r['doors_present']} ({r['door_predictions']}) | {r['windows_found']}/{r['windows_present']} | {err} | {r['rooms_found']}/{r['rooms_expected']} | {r['runtime_seconds']:.3f}s |")
    for c in cases:lines.append(f"| {c['name']} | gelernt | n/a | n/a | n/a | n/a | n/a | n/a | n/a | nicht ausgeführt |")
    peak=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/(1024**2 if sys.platform=='darwin' else 1024)
    lines+=['', f'Peak-RSS des gesamten seriellen Evaluationsprozesses einschließlich Imports: {peak:.1f} MiB. Keine Servermessung, keine Messung je Bild.', '', '## Lernbasierter Vergleich', '', 'Nicht ausgeführt: kein lokal geprüftes CubiCasa5K-Checkpoint vorhanden. Der Upstream verweist auf externen Gewichtsdownload und einen alten CUDA-/PyTorch-Stack. Keine Gewichte automatisch geladen und keine Zahlen erfunden. `--method learned` meldet einen Fehler, fällt nicht stillschweigend auf klassisch zurück.', '', '## Bekannte Grenzen', '', 'Dünn gezeichnete Wände sind ein bewusster Negativfall. Kreisfragment-Heuristik kann Möbel als Türen missverstehen; nicht erkannte Symbole und Raumgrenzen bleiben möglich. Raumzahl wird nicht auf Sollwerte angepasst. Ein kleiner synthetischer Testsatz hat einen starken Stil-Bias.']
    (ROOT/'EVALUATION.md').write_text('\n'.join(lines)+'\n')
    (ROOT/'testdata'/'evaluation.json').write_text(json.dumps(rows,indent=2)+'\n')
if __name__=='__main__':main()
