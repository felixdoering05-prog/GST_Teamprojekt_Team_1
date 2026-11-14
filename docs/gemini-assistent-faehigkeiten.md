# Gemini-Gebäudeassistent – was er kann (Stand 14.11.2026)

Diese Übersicht ergänzt [gemini-gebaeudeassistent.md](gemini-gebaeudeassistent.md) und [ki-gebaeudekontext.md](ki-gebaeudekontext.md).

## Voraussetzungen

- KI im Profil eingeschaltet (Zustimmung, `app_ai_preferences`). Ohne diese Zustimmung geht keine Anfrage an Google.
- Zugriff auf das Gebäude als Eigentümer oder angenommenes Mitglied. Der Zugriff wird vor dem Senden, vor jedem Werkzeugaufruf und vor dem Speichern erneut geprüft.
- Kontingent: 20 Anfragen je Konto und 100 je Projekt in 24 Stunden, höchstens 3 pro Minute. Eine Frage zählt als eine Anfrage, auch wenn Gemini dafür Werkzeuge aufruft.
- Modell: `gemini-3.5-flash-lite`. Der Schlüssel liegt nur auf dem Server.

## Modi

| Modus | Was Gemini bekommt | Was dabei herauskommt |
|---|---|---|
| **Chat** (Standard, iPhone-KI-Reiter) | Gebäudename und Adresse, die letzten 20 Dateinamen samt Größe, IFC-Typzahlen (Räume, Geschosse, Türen, Fenster) von bis zu 3 Modellen, das zwischengespeicherte Wetter und die letzten 6 Chatrunden | Antwort als Text. **Neu:** Gemini kann bei Bedarf lesende Werkzeuge aufrufen (siehe unten). |
| **Lampen im Chat** | dazu die für dieses Konto freigegebenen Home-Assistant-Lampen im Gebäude. Voraussetzung: Gerätesteuerung im Profil eingeschaltet. | `light_actions`. Der Server schaltet nur, wenn die Frage ein Schaltverb und den Lampen- oder Raumnamen enthält; Home Assistant bestätigt den neuen Zustand. |
| **Modellbefehl** | nur die erlaubten Aktionen und Ziele, keine Gebäudedaten | ein Vorschlag (ausblenden, einfärben oder zurücksetzen) für Wände, Türen, Fenster usw. Er wird erst nach Vorschau und Bestätigung im Modell gespeichert. |
| **Messwertanalyse** | zusammengefasste Messwerte (min, max, Mittel) einer Quelle (echt oder Demo) und die Grenzwerte | Antwort in den Abschnitten Beobachtung, Unsicherheit und nächster Schritt |
| **Live-Sprache** (ElevenLabs, nicht Gemini) | IFC-Zahlen, Wetter, freigegebene Lampen, Dateinamen | Gespräch; Lampen nur über das Werkzeug `control_lights` |

## Neu: lesende Werkzeuge im Chat

Gemini entscheidet selbst, ob es nachschlägt. Pro Frage sind höchstens 3 Werkzeugrunden mit je bis zu 4 Aufrufen möglich. In der letzten Runde muss Gemini antworten. Unter der Antwort steht dann zum Beispiel „Abgefragt: IFC-Raumliste, Messwerte.“

| Werkzeug | Liefert | Beispielfragen |
|---|---|---|
| `ifc_rooms` | IfcSpace-Räume mit Name, Langname und Geschoss, Fläche in m² (wenn im IFC hinterlegt), Summen je Geschoss und insgesamt; höchstens 150 Räume | „Welche Räume hat das OG?“ · „Wie groß ist das EG?“ |
| `ifc_elements` | Anzahl je Bauteiltyp (Wände, Türen, Fenster, Decken, Treppen, Stützen …), IFC-Schema, Prüfhinweise, Informationsregeln | „Wie viele Fenster und Türen hat das Modell?“ · „Hat das Modell Strukturprobleme?“ |
| `measurements` | je Messgröße (Temperatur, CO₂, Luftfeuchte): Anzahl, Min/Max/Mittel, letzter Wert, Trend pro Stunde, Grenzwertüberschreitungen, letzter Wert je Sensor; dazu Energiezeiträume. Echt- und Demodaten bleiben getrennt. | „Wie entwickelt sich die Temperatur?“ · „Gab es CO₂-Überschreitungen?“ |
| `weather_heat` | Wettermodell für die nächsten 24 Stunden mit Alter der Daten, Temperaturspanne und Sonnenspitze; grobe Wärmeabschätzung mit Heizgradstunden (Basis 15 °C), Stunden über 26 °C und Stunden mit starker Sonne | „Muss heute geheizt werden?“ · „Wann wird es am wärmsten?“ |
| `devices` | Geräte des Gebäudes (simuliert oder geplant) mit Raum und Schaltzustand; für dieses Konto freigegebene Home-Assistant-Lampen mit aktuellem Zustand | „Welche Lampen sind gerade an?“ |

Vorschläge (zum Beispiel lüften oder Sonnenschutz) beginnt Gemini mit „Vorschlag:“. Sie sind unverbindlich.

### Raumflächen, Höhen, Volumen

Die IFC-Analyse auf dem Server (`ifc-analysis/analyze.py`, Bericht-Version 3) nutzt für die Fläche vorrangig hinterlegte Mengen (`NetFloorArea`/`GrossFloorArea`). Fehlen diese, berechnet sie die Fläche aus der Raumgeometrie mit IfcOpenShell (`ifcopenshell.util.shape`: Grundriss-Projektion, Volumen, lichte Höhe). Das ist keine Wohnflächenberechnung nach WoFlV oder DIN 277, Dachschrägen werden nicht reduziert. Bei mehr als 60 Sekunden Rechenzeit bleiben die Werte der übrigen Räume `null`.

Ältere Berichte werden **automatisch im Hintergrund** neu analysiert (`worker.py → reanalyze`). Das passiert nur, wenn keine neuen Uploads oder Scans warten. Der alte Bericht bleibt sichtbar, bis der neue fertig ist. Schlägt ein Versuch fehl, wird er markiert und für diese Version nicht wiederholt.

### Weitere passende Werkzeuge (IfcOpenShell auf GitHub)

- **ifc5d** (PyPI 0.9.0): Mengenermittlung nach den Standard-`Qto_*`-Regeln für Wände, Decken und Räume. Sinnvoll für Wand- und Fensterflächen.
- **ifcdiff** (bereits installiert): vergleicht zwei Modellversionen und zeigt, was sich geändert hat.
- **ifcclash** (bereits installiert): Kollisionsprüfung zwischen Bauteilen.
- **ifcopenshell.util.selector**: Abfragesprache wie `IfcWall, Name=/Außen/`. Darauf ließe sich ein späteres Werkzeug „Bauteile suchen“ aufbauen.
- **ifctester** (bereits installiert): IDS-Prüfungen, erweiterbar um weitere Informationsanforderungen.

## Grenzen (bewusst)

- Die Werkzeuge lesen nur. Schalten bleibt beim bestehenden Lampenablauf, Modelländerungen beim Modellbefehl mit Bestätigung.
- Es gelangen keine Dateiinhalte (PDF, Fotos, IFC-Geometrie), keine Personen, E-Mail-Adressen, Teamchats, Zugangsdaten oder Daten anderer Gebäude zu Gemini.
- Messwerte: Der Ausschnitt umfasst höchstens 500 zuletzt gespeicherte Werte. Der Trend ist eine lineare Steigung, keine Prognose. „Echt“ heißt importiert, nicht geprüft.
- Wetter: Es handelt sich um regionale Modellwerte von Open-Meteo, keine Messung im Gebäude. Die Wärmeabschätzung ist keine Gebäudesimulation und keine Energie- oder Kostenprognose.
- Offene Mängel sind noch nicht angebunden. Ein Werkzeug dafür folgt, sobald der Mängelmelder auf `main` ist.
- Die Live-Sprache (ElevenLabs) nutzt diese Werkzeuge noch nicht.

## Technik

- Werkzeuge: `dashboard/backend/src/assistant-tools.js`. Die Schleife steht in `src/assistant.js`: Funktionsaufrufe von Gemini werden auf dem Server ausgeführt, der Modellbeitrag wird unverändert zurückgegeben (wegen der Thought-Signaturen).
- Tests: `test/assistant-tools.test.js`, `ifc-analysis/test_analyze.py`.
