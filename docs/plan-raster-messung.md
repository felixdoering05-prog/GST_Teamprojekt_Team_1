# Messlatte: Grundrisse aus Fotos und Scans

Stand 16.11.2026. Diese Seite misst, wie gut aus Fotos, Scans und Skizzen ein 3D-Modell entsteht, damit „funktioniert zu schlecht“ messbar wird und jeder Fortschritt belegt ist.

**Ziel (Felix, 16.11.):** Die Funktion ist für einfache Leute gedacht. Das Modell muss nicht auf den Zentimeter stimmen, aber stimmig wirken, und es soll auch aus wenigen oder schlechten Plänen immer ein brauchbares Modell entstehen. Deshalb ist die Hauptkennzahl **„brauchbar“**, Maßgenauigkeit kommt danach.

## Testsatz

`dashboard/backend/test/fixtures/plans/raster/` enthält 14 selbst erzeugte Bilder (CC0, keine fremden oder privaten Pläne) von drei Häusern mit exakt bekannter Geometrie (`truth.json`). Erzeugt mit `plan-extract/tests/make_raster_fixtures.py`.

| Haus | Größe | Räume | Türen | Fenster |
|---|---|--:|--:|--:|
| haus-rechteck | 10,00 × 8,00 m, Außenwand 36,5 cm | 4 | 4 | 5 |
| haus-l | L-Form 9,00 × 9,00 m, Außenwand 30 cm | 3 | 3 | 3 |
| haus-gross | 12,00 × 9,00 m mit Flur | 7 | 7 | 7 |

Stile, von leicht bis schwer: **scan** (Vektor-PDF mit 150/100 dpi gerastert, Wände als Doppellinie, Maßketten, Rahmen, Schriftfeld), **gefuellt** (schwarze Wände wie im Exposé), **schraffiert** (Bauantragsstil), **kopie** (75 dpi, grauer Toner, Flecken, 2° schief), **foto** (Handyfoto eines Ausdrucks auf dem Tisch: Perspektive, Schatten, ungleichmäßiges Licht, Unschärfe, JPEG), **skizze** (Freihand-Einzellinien, keine Maße).

Echte Pläne fehlen noch. Sobald Felix freigegebene Beispiele schickt, kommen sie mit von Hand gezeichneten Sollwerten dazu.

## Kennzahlen

`python tests/raster_eval.py --method neu|neu+masse|prototyp` (in `dashboard/backend/plan-extract`):

- **Modell:** Es kommt überhaupt ein Modell heraus (mindestens 3 Wände und 1 Raum).
- **Wände:** Anteil der echten Wandlänge, der gefunden wurde. Gemessen nach Herausrechnen des Gesamtmaßstabs, also die Form.
- **Präzision:** Anteil der erkannten Wandlänge, die auf einer echten Wand liegt (Rest: Maßketten, Möbel und Ähnliches als Wand erkannt).
- **Türen / Fenster:** Anteil der echten Türen/Fenster, die gefunden wurden (Tür: Tür oder Durchgang im Umkreis von 0,6 m).
- **Räume:** Anteil der echten Räume, deren Beschriftungspunkt in einem erkannten Raum liegt; dazu Anzahl ist/soll.
- **Maßfehler:** mittlere Abweichung von Gesamtbreite und -tiefe in %, also der Maßstab.
- **Flächenfehler:** mittlere Abweichung der Raumflächen in %.
- **brauchbar:** Modell, Wände ≥ 80 %, Räume ≥ 60 % und Maßfehler ≤ 20 %. Das Modell „wirkt richtig“.

## Ergebnisse

### Vorher: Prototyp aus PR #170 (`ki/plan-raster`, nicht im Server)

Heute laufen Fotos im Server über Gemini, das Koordinaten schätzt. Dieser Weg lässt sich hier nicht messen (kostenpflichtige API, kein lokaler Schlüssel). Als Vorher-Wert dient der bisherige klassische Prototyp.

| Plan | Stil | Modell | brauchbar | Wände | Präzision | Türen | Fenster | Räume (ist/soll) | Maßfehler | Flächenfehler | Zeit |
|---|---|:-:|:-:|--:|--:|--:|--:|--:|--:|--:|--:|
| rechteck-scan.png | scan | nein | nein | 0 % | 0 % | 0 % | 0 % | 0 % (0/4) | n/a | n/a | 0.3 s |
| l-scan.png | scan | nein | nein | 0 % | 0 % | 0 % | 0 % | 0 % (0/3) | n/a | n/a | 0.1 s |
| rechteck-kopie.png | kopie | nein | nein | 0 % | 0 % | 0 % | 0 % | 0 % (0/4) | n/a | n/a | 0.1 s |
| rechteck-foto.jpg | foto | nein | nein | 11 % | 54 % | 0 % | 0 % | 0 % (0/4) | 97 % | n/a | 3.0 s |
| l-foto.jpg | foto | nein | nein | 1 % | 7 % | 0 % | 0 % | 0 % (0/3) | 96 % | n/a | 3.5 s |
| rechteck-gefuellt.png | gefuellt | ja | nein | 100 % | 100 % | 100 % | 0 % | 100 % (4/4) | 50 % | 77 % | 0.1 s |
| rechteck-skizze.png | skizze | nein | nein | 13 % | 57 % | 0 % | 0 % | 0 % (0/4) | 89 % | n/a | 0.0 s |
| l-gefuellt.png | gefuellt | ja | nein | 98 % | 100 % | 33 % | 0 % | 100 % (1/3) | 50 % | 22 % | 0.1 s |
| gross-gefuellt.png | gefuellt | ja | nein | 100 % | 99 % | 100 % | 0 % | 86 % (8/7) | 50 % | 76 % | 0.1 s |
| gross-gefuellt-foto.jpg | foto | nein | nein | 35 % | 83 % | 29 % | 0 % | 0 % (0/7) | 12 % | n/a | 4.0 s |
| gross-schraffiert.png | schraffiert | nein | nein | 2 % | 9 % | 0 % | 0 % | 0 % (0/7) | 96 % | n/a | 0.1 s |
| gross-schraffiert-kopie.png | kopie | nein | nein | 0 % | 0 % | 0 % | 0 % | 0 % (0/7) | n/a | n/a | 0.1 s |
| gross-skizze.png | skizze | nein | nein | 3 % | 22 % | 0 % | 0 % | 0 % (0/7) | 79 % | n/a | 0.0 s |
| gross-skizze-foto.jpg | foto | nein | nein | 39 % | 100 % | 14 % | 0 % | 0 % (0/7) | 27 % | n/a | 1.7 s |
| **Summe** | | **3/14** | **0/14** | 29 % | 45 % | 20 % | 0 % | 20 % | | | |

### Nachher: neuer Rasterweg im Server, ohne KI (Maßstab nur geschätzt)

| Plan | Stil | Modell | brauchbar | Wände | Präzision | Türen | Fenster | Räume (ist/soll) | Maßfehler | Flächenfehler | Zeit |
|---|---|:-:|:-:|--:|--:|--:|--:|--:|--:|--:|--:|
| rechteck-scan.png | scan | ja | ja | 100 % | 100 % | 100 % | 0 % | 100 % (4/4) | 0 % | 2 % | 1.1 s |
| l-scan.png | scan | ja | ja | 100 % | 92 % | 100 % | 0 % | 100 % (3/3) | 15 % | 31 % | 0.9 s |
| rechteck-kopie.png | kopie | ja | ja | 82 % | 74 % | 25 % | 0 % | 100 % (4/4) | 8 % | 30 % | 0.5 s |
| rechteck-foto.jpg | foto | ja | ja | 83 % | 73 % | 75 % | 0 % | 100 % (5/4) | 8 % | 23 % | 1.4 s |
| l-foto.jpg | foto | ja | ja | 82 % | 65 % | 67 % | 0 % | 100 % (4/3) | 14 % | 15 % | 1.5 s |
| rechteck-gefuellt.png | gefuellt | ja | ja | 100 % | 100 % | 100 % | 100 % | 100 % (4/4) | 6 % | 12 % | 0.2 s |
| rechteck-skizze.png | skizze | ja | nein | 76 % | 73 % | 0 % | 0 % | 75 % (1/4) | 22 % | 320 % | 0.1 s |
| l-gefuellt.png | gefuellt | ja | ja | 98 % | 90 % | 33 % | 100 % | 100 % (1/3) | 6 % | 253 % | 0.3 s |
| gross-gefuellt.png | gefuellt | ja | ja | 100 % | 99 % | 100 % | 100 % | 86 % (8/7) | 6 % | 11 % | 0.5 s |
| gross-gefuellt-foto.jpg | foto | ja | ja | 100 % | 99 % | 100 % | 100 % | 86 % (8/7) | 5 % | 7 % | 1.7 s |
| gross-schraffiert.png | schraffiert | ja | ja | 100 % | 95 % | 43 % | 0 % | 86 % (10/7) | 2 % | 5 % | 0.7 s |
| gross-schraffiert-kopie.png | kopie | ja | nein | 89 % | 84 % | 57 % | 14 % | 57 % (10/7) | 55 % | 109 % | 0.8 s |
| gross-skizze.png | skizze | ja | nein | 71 % | 72 % | 43 % | 14 % | 100 % (4/7) | 21 % | 49 % | 0.3 s |
| gross-skizze-foto.jpg | foto | ja | nein | 61 % | 68 % | 0 % | 0 % | 57 % (4/7) | 40 % | 28 % | 0.6 s |
| **Summe** | | **14/14** | **10/14** | 89 % | 84 % | 60 % | 31 % | 89 % | | | |

### Nachher mit abgelesenen Gesamtmaßen

So läuft es im Server, wenn Gemini die beschrifteten Gesamtmaße liest (nur Zahlen, keine Koordinaten). Hier simuliert mit den Sollmaßen; der echte Lesefehler von Gemini ist nicht gemessen.

| Plan | Stil | Modell | brauchbar | Wände | Präzision | Türen | Fenster | Räume (ist/soll) | Maßfehler | Flächenfehler | Zeit |
|---|---|:-:|:-:|--:|--:|--:|--:|--:|--:|--:|--:|
| rechteck-scan.png | scan | ja | ja | 100 % | 100 % | 100 % | 0 % | 100 % (4/4) | 0 % | 2 % | 1.8 s |
| l-scan.png | scan | ja | ja | 100 % | 92 % | 100 % | 0 % | 100 % (3/3) | 2 % | 0 % | 1.2 s |
| rechteck-kopie.png | kopie | ja | ja | 82 % | 75 % | 25 % | 0 % | 100 % (4/4) | 8 % | 26 % | 0.5 s |
| rechteck-foto.jpg | foto | ja | ja | 83 % | 72 % | 75 % | 0 % | 100 % (5/4) | 4 % | 9 % | 2.0 s |
| l-foto.jpg | foto | ja | ja | 81 % | 66 % | 67 % | 0 % | 100 % (4/3) | 0 % | 10 % | 1.6 s |
| rechteck-gefuellt.png | gefuellt | ja | ja | 100 % | 100 % | 100 % | 100 % | 100 % (4/4) | 0 % | 0 % | 0.2 s |
| rechteck-skizze.png | skizze | ja | nein | 77 % | 73 % | 0 % | 0 % | 75 % (1/4) | 16 % | 203 % | 0.1 s |
| l-gefuellt.png | gefuellt | ja | ja | 98 % | 90 % | 33 % | 100 % | 100 % (1/3) | 0 % | 212 % | 0.2 s |
| gross-gefuellt.png | gefuellt | ja | ja | 100 % | 99 % | 100 % | 100 % | 86 % (8/7) | 0 % | 1 % | 0.5 s |
| gross-gefuellt-foto.jpg | foto | ja | ja | 100 % | 99 % | 100 % | 100 % | 86 % (8/7) | 2 % | 2 % | 1.8 s |
| gross-schraffiert.png | schraffiert | ja | ja | 100 % | 95 % | 43 % | 0 % | 86 % (10/7) | 0 % | 0 % | 0.5 s |
| gross-schraffiert-kopie.png | kopie | ja | nein | 89 % | 84 % | 57 % | 14 % | 57 % (7/7) | 2 % | 26 % | 0.7 s |
| gross-skizze.png | skizze | ja | nein | 71 % | 72 % | 43 % | 14 % | 100 % (4/7) | 26 % | 118 % | 0.3 s |
| gross-skizze-foto.jpg | foto | ja | nein | 60 % | 75 % | 0 % | 0 % | 71 % (4/7) | 5 % | 187 % | 0.7 s |
| **Summe** | | **14/14** | **10/14** | 89 % | 85 % | 60 % | 31 % | 90 % | | | |

## Zusammenfassung

| | Vorher (Prototyp) | Nachher | Nachher + Gesamtmaße |
|---|--:|--:|--:|
| Modell erhalten | 3/14 | **14/14** | 14/14 |
| brauchbar | 0/14 | **10/14** | 10/14 |
| Wände gefunden (Mittel) | 29 % | 89 % | 89 % |
| Räume gefunden (Mittel) | 20 % | 89 % | 90 % |
| Maßfehler, ohne Skizzen | 12–97 % | 0–55 % | **0–8 %** |

Laufzeit lokal (Apple M3, Python 3.12, OpenCV 5.0): 0,1–2,5 s je Bild, Spitze etwa 190 MB Speicher. Auf dem Server (0,5 CPU) ist mit dem Mehrfachen zu rechnen, aber innerhalb des Zeitlimits von 180 s.

## Was noch schwach ist (ehrlich)

- **Skizzen** ergeben ein Modell, aber oft mit fehlenden Innenwänden und ohne Maßstab (keine Maßzahlen). Der Maßstab wird aus Türbreiten oder der üblichen Hausgröße geschätzt und ist als ungefähr markiert.
- **Fenster** in Linienplänen (Doppellinie) werden selten erkannt (31 % im Mittel). In Plänen mit gefüllten Wänden klappt es gut. Fehlende Fenster lassen sich im Korrektur-Editor (nächste Etappe) ergänzen.
- **Schraffierte Pläne als schlechte Kopie**: Wände gut, Räume zum Teil zusammengelegt.
- Nur rechtwinklige Wände. Schräge und runde Wände werden nicht erkannt.
- Der Testsatz ist synthetisch. Echte Handyfotos haben mehr Möbel, Texte und Störungen. Die Zahlen sind daher eine Obergrenze, bis echte Pläne im Testsatz sind.

Die Tests (`tests/test_raster.py`) sichern diesen Stand ab: immer ein Modell, mindestens 9 von 14 brauchbar, saubere Pläne ≥ 95 % Wände, mit Gesamtmaßen ≤ 10 % Maßfehler.
