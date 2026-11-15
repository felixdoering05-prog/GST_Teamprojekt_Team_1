# Raster-Grundrisse: Phase 3, eigenständiger Prototyp

Lokale CPU-Pipeline für PNG/JPG-Scans und Fotos. Keine Gemini-/Cloud-Aufrufe, kein Projektserver-Zugriff, keine automatischen Modell-Downloads. Nur dieser Ordner wird geändert. Die Einbindung in App/Produktivpipeline ist **noch nicht vorgenommen**.

## Installation und Nutzung

Python 3.12, feste direkte Paketversionen in `requirements.txt`:

```sh
cd ki/plan-raster
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m plan_raster testdata/door.png --out /tmp/result.json --scale '100,100,600,100,10000' --debug-dir /tmp/plan-debug
pytest -q
python evaluate.py
```

`--scale` besteht aus **x1,y1,x2,y2,Länge_in_mm**. Die Punkte liegen im ursprünglichen Eingabebild, Ursprung links oben, y nach unten. Alternativ Semikolon als Trenner. Die Kalibrierpunkte werden mit derselben Homographie wie das Bild transformiert. Damit bleibt die Referenz nach Entzerrung/Drehung verwendbar. Nur eine bekannte Strecke reicht nicht, um verbleibende perspektivische Fehler unabhängig zu überprüfen.

Ohne Referenz nutzt der Prototyp **10 mm/Pixel als ausdrücklich geschätzten Platzhalter**, nicht als Vermessung. Flächen sind dann `area_estimated=true`. Diese Ergebnisse nicht ungeprüft in IFC übernehmen. PDF-Dateien sind kein direkter Eingang: die gewünschte Seite vorher extern rasterisieren; der Prototyp erhält deren PNG/JPG. `--no-perspective` schaltet die automatische Blatterkennung ab, z.B. bei Plan-Crops ohne Blattkante.

Optional `--ocr`: `pytesseract` benötigt separat installiertes **Tesseract**. OCR liefert nur `ocr_hints` und einen Prüfhinweis. Keine beliebige Maßzahl automatisch einer Wand zuordnen; abgelesene Bemaßung muss per Referenzstrecke bestätigt werden. Einheiten-/Maßketten-OCR mit sicherer räumlicher Zuordnung ist nicht implementiert.

## Verfahren und Grenzen

1. Bildgröße begrenzt (20 MP nach Decode), Verarbeitung auf maximal 1800 px Kantenlänge. CLAHE, Otsu, helle Blattvierecke und Perspektivkorrektur, Hough-Hauptrichtung und Deskew bis etwa ±20°. Homographie bleibt in der Ausgabe. Die Papiererkennung ist eine Heuristik, keine Zusage für jedes Handyfoto.
2. Isolierte kleine Schriftkomponenten maskieren. Lange dünne Bemaßungslinien durch die Wand-Dickenschwelle ausfiltern. Keine perfekte Trennung von Möbeln/Schraffuren/Text. Mit Wänden verbundene Texte bleiben problematisch.
3. Horizontale/vertikale Morphologie, zusammenhängende dicke Striche → Mittellinien und Strichbreite. Skelett als Debugansicht, Hough für Ausrichtung; die finalen Segmente stammen aus den Morphologie-Komponenten, nicht aus einem trainierten Netz.
4. Kollineare Segmente zusammenführen, kurze Lücken merken, nahe Ecken/T-Anschlüsse schließen. Lücken mit dünnen Parallellinien sind Fensterkandidaten; Kreisfragmente nahe Lücken sind Türkandidaten. Reine Lücken bleiben `opening`, keine erfundene Tür. Bögen werden heuristisch über Hough-Kreise angenähert, nicht als exakte Viertelkreisgeometrie bewiesen.
5. Shapely polygonisiert die Wandmittellinien. Räume werden um eine halbe mediane Wanddicke verkleinert; Flächen sind geometrische Näherungen. Mehrschalige Wände, gekrümmte/schräge Wände, variable Wanddicken und unvollständige Umrisse sind nicht zuverlässig unterstützt. Generische Raumnamen statt ungeprüftem OCR-Namen.

Debugbilder: normalisiertes Bild, Binärbild, Wandmaske, Skelett, Ergebnisüberlagerung (rot Wände, grün Räume, blau Öffnungen), Textmaske. Konfidenzen sind **feste heuristische Indikatoren**, keine gelernten oder kalibrierten Wahrscheinlichkeiten.

## Übergabeformat und Phase 1

Geprüfte Referenz: PR #169 `feature/plan-vektor-extraktion`, Commit `650dff596ba8cf6e6c3af1392337544c20c68aab`, insbesondere `planextract/extract.py`. Keine Dateien aus dem Branch übernommen oder verändert.

- Hülle `version`, `levels`, `skipped`; zusätzlich `source=raster`, `scale_mm_per_px`, `scale_source`, Homographie und Diagnostik.
- Wände besitzen wie Phase 1 `id=W1`, `a/b`, `thickness`, `length`. **Öffnungen verweisen auf die Wand-ID als String**, keinen nullbasierten Index. Dazu `height`, `sill`, `height_assumed`, `evidence` und heuristische Konfidenz.
- Räume haben Polygon, generischen Namen und `area_m2`. Alle Ausgabe-Koordinaten in mm, y nach oben, Ursprung unten links im normalisierten Bild; nicht in Original-Fotopixeln.
- Das Level enthält Quelle, Maßstabsmetadaten, erkannte Außenkontur (bei geschlossenem Polygon), Bildausdehnung, angenommene Höhe 2500 mm, `height_assumed=true`, `elevation=0`. `scale.ratio=null`, da Pixelmaßstab kein Papier-Druckmaßstab ist.

Das ist ein **Phase-1-nahes Zwischenformat**, kein bereits getesteter direkter Aufruf des Phase-1-Builders: Quelldiskriminator `raster`, Pixelmaßstab und Rasterbild-Ursprung müssen beim Anschluss explizit behandelt werden. Ein späterer Adapter sollte auf Gebäudegrenzen umbasieren, Maße/Geschoss/Höhe bestätigen lassen, fehlende Außenkonturen zurückfragen und erst danach denselben IFC-Bau aufrufen. Kein automatisches Übernehmen geschätzter Maße.

## Lernbasierter Weg und Lizenzprüfung

Originalprojekt: https://github.com/CubiCasa/CubiCasa5k

- Die dortige LICENSE nennt **CC BY-NC 4.0**, Copyright 2019. Primärquelle: https://raw.githubusercontent.com/CubiCasa/CubiCasa5k/master/LICENSE . Für kommerzielle Weiternutzung nicht ungeprüft verwenden.
- Upstream beschreibt Python 3.6.5, PyTorch 1.0.0/CUDA und einen separaten Gewichtsdownload über Google Drive. Ein Checkpoint wurde hier weder heruntergeladen noch geladen oder ausgeführt. Deshalb keine belastbare Aussage zu CPU-Kompatibilität, Gewichtslizenz, Laufzeit oder Erkennungsqualität.
- `--method learned` gibt einen klaren Fehler. Kein heimlicher Fallback und kein als gelernt ausgegebener klassischer Lauf. Die Evaluation zeigt **n/a** für jeden Lernmodell-Test. Dies ist der explizite Fallback des Auftrags auf den klassischen Weg, kein fertiger Netz-Adapter.
- Kein YOLO/Roboflow-Datensatz verwendet. Keine fremden Grundrisse oder Modellausgaben im Messsatz.

## Lizenzübersicht

| Bestandteil | Projektlizenz / Herkunft |
|---|---|
| OpenCV-Python | Apache-2.0, enthaltene Drittkomponenten separat beachten; https://github.com/opencv/opencv-python |
| NumPy | BSD-3-Clause; https://github.com/numpy/numpy |
| Shapely | BSD-3-Clause; GEOS-Abhängigkeit LGPL-2.1; https://github.com/shapely/shapely |
| pytesseract | Apache-2.0; https://github.com/madmaze/pytesseract |
| Tesseract (optional, separat) | Apache-2.0; Sprachdaten separat prüfen; https://github.com/tesseract-ocr/tesseract |
| pytest | MIT; https://github.com/pytest-dev/pytest |
| CubiCasa5K (nicht eingebunden) | CC BY-NC 4.0 laut Upstream; kein Gewichts-Lizenznachweis dieses Prototyps |
| `testdata/generate.py` und synthetische Testbilder/Referenzen | Eigenproduktion für diesen Prototyp, CC0-1.0; keine Hochschul- oder Privatpläne |

## Test- und Serverempfehlung

Siehe `EVALUATION.md` und maschinenlesbar `testdata/evaluation.json`: sieben selbst erzeugte Pläne, bekannte Referenzmaße, Rauschen/Drehung/Perspektive und ein Negativfall. `evaluate.py` misst Wandabdeckung, Wand-Recall/Präzision, Tür-/Fenstertreffer, Maßfehler, Raumanzahl und reale Laufzeit. Die sehr einfachen Varianten desselben Testhauses sind **keine repräsentative Benchmark**. Keine Parameter aus Sollwerten nachträglich anpassen.

Für einen späteren isolierten Server-Probelauf: CPU-only, ein Bild pro Prozess, zunächst 512 MiB RAM und Zeitlimit 30 s, schreibgeschützter Container und begrenztes `/tmp`. Diese Limits sind eine Empfehlung, **noch nicht auf dem Projektserver gemessen**. Lokale Messwerte stehen in der Evaluation; Peak-RSS umfasst den seriellen Gesamtprozess, nicht ein einzelnes Bild. Ohne Sandbox bietet die CLI keine harte Speicher-/Zeitgrenze für native Decoder; nur vertrauenswürdige Testdateien lokal verwenden. Keine Netzwerkzugriffe im Extraktor.

Vor Produktion: freigegebene echte Scans mit manuell annotierten Wänden/Türen ergänzen, Linienbreitenschwellen an Auflösung koppeln, echte Raumtopologie und ungewöhnliche Treppen/Möbel testen, perspektivische Fehler mit zweiter Referenzstrecke prüfen. Eigene Kontrollpunkte sollten später in einer Overlay-Oberfläche korrigierbar sein.
