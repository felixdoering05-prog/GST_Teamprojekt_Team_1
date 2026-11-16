# Evaluation: Raster-Grundrissprototyp

Reale Ausführung auf synthetischem, selbst erzeugtem Messsatz. Kein Genauigkeitsnachweis für Hochschulpläne oder echte Handyfotos.

Umgebung: Darwin arm64, Python 3.12.4, OpenCV 5.0.0.

Wand-Recall: Anteil Referenzsegmente mit mindestens 80 % Längenabdeckung bei 8 px Toleranz. Präzision: vorhergesagte Segmentlänge nahe Referenzwänden. Maßfehler: Breite der erkannten Wandmittellinien gegen bekannte 10 m; bei leeren Ergebnissen n/a.

| Plan | Weg | Wand-Recall | Wandabdeckung | Präzision | Türen Treffer/Soll (Vorhersagen) | Fenster Treffer/Soll | Maßfehler | Räume Ist/Soll | Laufzeit |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| clean | klassisch | 100% | 100% | 100% | 0/0 (0) | 0/0 | 0.06% | 2/2 | 0.139s |
| door | klassisch | 100% | 100% | 100% | 1/1 (1) | 0/0 | 0.06% | 2/2 | 0.100s |
| window | klassisch | 100% | 100% | 100% | 0/0 (0) | 1/1 | 0.06% | 2/2 | 0.088s |
| noise | klassisch | 100% | 100% | 100% | 0/0 (0) | 0/0 | 0.06% | 2/2 | 0.101s |
| rotation | klassisch | 100% | 100% | 100% | 0/0 (0) | 0/0 | 0.06% | 2/2 | 0.086s |
| perspective | klassisch | 100% | 100% | 100% | 0/0 (0) | 0/0 | 0.11% | 2/2 | 0.072s |
| thin-lines | klassisch | 0% | 0% | 0% | 0/0 (0) | 0/0 | n/a | 0/2 | 0.016s |
| clean | gelernt | n/a | n/a | n/a | n/a | n/a | n/a | n/a | nicht ausgeführt |
| door | gelernt | n/a | n/a | n/a | n/a | n/a | n/a | n/a | nicht ausgeführt |
| window | gelernt | n/a | n/a | n/a | n/a | n/a | n/a | n/a | nicht ausgeführt |
| noise | gelernt | n/a | n/a | n/a | n/a | n/a | n/a | n/a | nicht ausgeführt |
| rotation | gelernt | n/a | n/a | n/a | n/a | n/a | n/a | n/a | nicht ausgeführt |
| perspective | gelernt | n/a | n/a | n/a | n/a | n/a | n/a | n/a | nicht ausgeführt |
| thin-lines | gelernt | n/a | n/a | n/a | n/a | n/a | n/a | n/a | nicht ausgeführt |

Peak-RSS des gesamten seriellen Evaluationsprozesses einschließlich Imports: 98.0 MiB. Keine Servermessung, keine Messung je Bild.

## Lernbasierter Vergleich

Nicht ausgeführt: kein lokal geprüftes CubiCasa5K-Checkpoint vorhanden. Der Upstream verweist auf externen Gewichtsdownload und einen alten CUDA-/PyTorch-Stack. Keine Gewichte automatisch geladen und keine Zahlen erfunden. `--method learned` meldet einen Fehler, fällt nicht stillschweigend auf klassisch zurück.

## Bekannte Grenzen

Dünn gezeichnete Wände sind ein bewusster Negativfall. Kreisfragment-Heuristik kann Möbel als Türen missverstehen; nicht erkannte Symbole und Raumgrenzen bleiben möglich. Raumzahl wird nicht auf Sollwerte angepasst. Ein kleiner synthetischer Testsatz hat einen starken Stil-Bias.
