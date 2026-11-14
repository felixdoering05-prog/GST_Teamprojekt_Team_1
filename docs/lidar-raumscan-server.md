# LiDAR-Raumscan mit Server-IFC

Stand: 14.11.2026 · iPhone 1.0.127

## Ablauf

1. Neues Gebäude → Pläne → **Räume mit LiDAR scannen** (iPhone mit LiDAR, Apple RoomPlan).
2. Räume nacheinander scannen; RoomPlan führt sie mit `StructureBuilder` zusammen.
3. **IFC erstellen** schickt die erfasste Struktur als JSON an `POST /api/v1/buildings/:id/room-scans` (angemeldet, Gebäudezugriff nötig, `X-Request-ID` für Wiederholungen, max. 4 MB).
4. Der `ifc-worker` baut mit ifcopenshell (`dashboard/backend/ifc-analysis/roomscan.py`) ein IFC4:
   - `IfcSpace` je Bodenfläche als Volumen, Name, Raumtyp (`LongName`), Geschoss und Flächen-/Volumenmengen;
   - `IfcWall` mit Stärke: Wurde eine Innenwand von beiden Seiten gescannt, werden beide Flächen zu einer Wand mit gemessener Stärke zusammengeführt; sonst 24 cm angenommen (Hinweis im Ergebnis);
   - Türen und Fenster als `IfcOpeningElement` in der Wirtswand mit `IfcDoor`/`IfcWindow` als Füllung, Durchgänge als reine Öffnung;
   - Möbel als `IfcFurniture` (Untertyp von `IfcFurnishingElement`), Sanitär- und Küchengeräte als passende IFC-Klassen, jeweils dem Raum zugeordnet;
   - Bodenplatten je Raum.
5. Raumnamen und -typen werden **ohne KI** aus RoomPlan-Labels, erkannten Möbeln (z. B. WC/Badewanne → Bad, Herd → Küche, Bett → Schlafzimmer) und der Raumform abgeleitet. Eigene Namen bleiben erhalten, doppelte werden nummeriert.
6. Die App zeigt Räume, Flächen, Zählungen und Hinweise. **Zum Gebäude hinzufügen** legt das IFC als Datei des Gebäudes ab (danach läuft die normale IFC-Analyse); **Verwerfen** löscht den Entwurf.

## Fallback

Ist der Projektserver nicht erreichbar (keine Verbindung, Serverfehler oder alter Server ohne Endpunkt), erzeugt das iPhone wie bisher selbst ein IFC4 (`RoomScanIFC.swift`) und lädt es wie jede Datei hoch. Bei einem Serverfehler kann man das auch direkt wählen.

## Grenzen und Datenschutz

- Höchstens 3 offene Raumscan-Aufträge und 20 pro Konto in 24 Stunden. Entwürfe werden nach 7 Tagen verworfen.
- Gespeichert werden nur Geometrie, Objektkategorien und Raumnamen, keine Kamerabilder. Keine Übermittlung an Gemini oder andere KI-Dienste.
- Vorläufiger Entwurf, keine Vermessung: Maße und Wandstärken vor Verwendung prüfen.

## Prüfungen

```bash
cd dashboard/backend && npm test
cd dashboard/backend/ifc-analysis && python -m unittest test_roomscan test_analyze
```
