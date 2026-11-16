# Aus Grundrissen einen IFC-Entwurf erstellen

Stand: 15. November 2026. Experimentelle Planerkennung, keine Fachplanung und keine baurechtliche Prüfung. Vektorpläne (PDF mit Linien, DXF, DWG) werden seit iOS 1.0.129 **vermessen** statt geschätzt, siehe [Vektorpläne vermessen](#vektorpläne-vermessen-phase-1).

## Bedienung

1. Gebäude öffnen → Gebäudemappe → „Aus Plänen einen 3D-Entwurf erstellen“. Im Web unter „Gebäude & Räume“ das eigene Gebäude öffnen.
2. KI im Profil aktivieren und einmal pro Gebäude die Übertragung von Bildern und PDFs an **Google Gemini** erlauben. Nur dafür freigegebene Unterlagen verwenden. Die Freigabe wird auf dem Projektserver gespeichert.
3. Danach starten neue JPG-, PNG-, WebP-, PDF-, DXF- und DWG-Uploads automatisch einen Auftrag. Innerhalb von 20 Sekunden hochgeladene Dateien werden zusammengefasst, maximal vier und zusammen 10 MiB. Weitere Uploads können einen separaten Auftrag bilden. HEIC und IFC werden nicht analysiert. DXF/DWG verlassen den Server nicht.
4. Bereits gespeicherte Pläne selbst auswählen und „Ausgewählte Pläne analysieren“ drücken. Einschalten allein überträgt keine historischen Dateien.
5. Vorschau und Annahmen prüfen. Erst „Entwurf in Gebäudemappe übernehmen“ speichert eine **zusätzliche** IFC. Vorhandene Modelle und Quelldateien bleiben erhalten. „Verwerfen“ löscht den Entwurf. Nicht übernommene Ausgaben verfallen nach sieben Tagen.

Zunächst darf nur der Gebäudeeigentümer die Funktion steuern. Uploads anderer Mitglieder starten keine automatische Analyse. Im Hintergrund wird jeweils nur ein Auftrag verarbeitet. Pro Konto drei, im gesamten Projekt zehn Aufträge in 24 Stunden; höchstens drei offene Aufträge je Konto. Abgelehnte Interpretationen zählen mit, weil bereits ein Anbieteraufruf stattgefunden haben kann.

## Was die erste Version kann

- Bemaßte Grundrisse erkennen; doppelte Fotos desselben Geschosses zusammen interpretieren.
- Bis zu vier Geschosse, insgesamt 240 gerade Wände, Öffnungen und Raumpunkte beschreiben; feste Größenlimits prüfen.
- Mindestens zwei ablesbare Gesamtmaße für x/y verlangen. Diese Prüfung sichert das Format und Konsistenz, nicht die Wahrheit der KI-Erkennung.
- Bei fehlender Höhe 2,50 m und 200 mm Deckenstärke **als Annahmen** verwenden. Dach, Dachschrägen und Treppen bleiben aus. Unklare Öffnungen dürfen fehlen. Öffnungen ohne passende Wand werden ausdrücklich mit Hinweis weggelassen; es werden dafür keine Wände erfunden. Bei vorhandener gespeicherter Erkennung kann „Erneut prüfen (ohne Google)“ einen neuen Modellversuch starten, ohne die Dateien erneut zum Anbieter zu senden. Auch dieser Versuch zählt zur Auftragsgrenze.
- Ohne eindeutigen Grundriss/Maßstab einen Hinweis statt eines erfundenen Modells liefern. Fehlinterpretationen können trotzdem vorkommen: Fachliche Prüfung ist erforderlich.

Die Annahmen stehen im Auftrag und der Dateiname enthält TEST. Bei abgelehnter Geometrie wird die begrenzte KI-Antwort für die technische Diagnose nur im privaten Auftrag gespeichert, nicht als Modell freigegeben; diese Diagnose und Vorschauen werden nach sieben Tagen bereinigt. Die IFC allein ist kein vollständiger Herkunftsbericht; Hinweise beim Weitergeben mitgeben. Die Freigabe bestätigt die Übernahme in die Mappe, keine Maßhaltigkeit.

## Vektorpläne vermessen (Phase 1)

`plan-worker → plan-extract/run.py extract → (Gemini prüft nur IDs, nur bei PDF) → run.py build → IFC + Vorschau + Qualitätsbericht`

- **Lesen:** DXF mit ezdxf (MIT); DWG wird vorher mit LibreDWG `dwg2dxf` (GPL-3, eigener Prozess, 90 s Limit) umgewandelt. Vektor-PDF mit pdfplumber (MIT) statt PyMuPDF (AGPL): Linien, Rechtecke, Kurven, gedrehte Texte, hochgestellte halbe Zentimeter (36⁵).
- **Maßstab:** Maßzahlen („4,00“, „1,01⁵“, „24“) werden ihrer Maßlinie bzw. dem Abschnitt zwischen Hilfslinien zugeordnet; der Maßstab ist der Wert, den die meisten Maßzahlen bestätigen. PDF: Einrasten auf übliche Maßstäbe (1:50, 1:100 …) bei ≤ 1,5 % Abweichung; Rückfall auf „M 1:100“-Beschriftung mit Hinweis. DXF: `$INSUNITS`, gegengeprüft mit DIMENSION-Entitäten und Maßtexten; ohne beides Einheit aus der Gebäudegröße geschätzt (mit Hinweis).
- **Wände:** parallele Linienpaare (5–70 cm Abstand, ≥ 10 cm Überdeckung) werden von nah nach fern gepaart → Mittellinie + gemessene Stärke. Bei DXF zuerst Wand-Layer (`Wand`, `Wall`, `Mauer` …), Bemaßungs-, Möbel-, Text- und Rahmen-Layer werden ignoriert. Winkel werden auf die dominante Richtung eingerastet, kollineare Stücke vereinigt, Ecken und T-Stöße bis zur Mittellinie der Nachbarwand geschlossen. Planrahmen/Schriftfeld werden als getrennte, das Gebäude umschließende Linienpaare verworfen.
- **Öffnungen:** Lücken in einer Wand werden klassifiziert: Viertelkreis mit Radius ≈ Lückenbreite → Tür, zwei halbe Bögen → Doppeltür, Linien innerhalb der Wandstärke → Fenster, Türblöcke/Fensterblöcke (INSERT-Namen) → Tür/Fenster, anstoßende Querwand → keine Öffnung, sonst „Durchgang“ (unklar). Symbole ohne Lücke werden in der nächsten Wand verortet statt verworfen. Höhen ohne Angabe: Tür 2,01 m, Fenster Brüstung 0,90 m/Höhe 1,35 m (als Annahme markiert).
- **Räume:** von Wänden umschlossene Flächen (shapely), Name aus der Beschriftung im Raum, beschriftete Fläche („16,15 m²“) wird gegen die gemessene geprüft.
- **IFC:** IfcOpenShell, IFC4: Geschoss, IfcWall mit echter Stärke und Wandtyp, IfcOpeningElement + IfcDoor/IfcWindow mit Breite/Höhe, IfcSpace mit Fläche, Bodenplatte (20 cm Annahme). BIMCraft bleibt Rückfall für den Bildweg.
- **Gemini:** bekommt bei PDF-Quellen Original-PDF, eine Draufsicht mit IDs (W/O/R) und die Kandidatenliste. Antwort nur über IDs: Nicht-Wände markieren (höchstens 30 % der Wände, sonst ignoriert), unklare Öffnungen einordnen, abgelesene Höhen, unbeschriftete Räume benennen, Geschosshöhe. Keine Koordinaten. Fällt die Prüfung aus, bleibt das vermessene Ergebnis mit Hinweis. DXF/DWG werden nie an Google gesendet.
- **Qualitätsbericht** (`app_plan_jobs.quality`, in App unter dem Auftrag): Maßstab und Herkunft, Anzahl Wände/Türen/Fenster/unklare Öffnungen/Räume, jede Planmaßzahl gemessen vs. beschriftet mit Abweichung, Räume ohne Tür, Flächenvergleich. „gut“ nur bei ≤ 2 % Maßabweichung, mindestens drei Maßzahlen und Tür in jedem Raum.
- **Grenzen:** Fotos/Scans bleiben auf dem Gemini-Weg (Phase 3: Rastererkennung). Schräge Wände werden wie gerade gepaart (in den Testplänen nicht abgedeckt), Bögen/runde Wände gar nicht. Ein PDF-Plan mit großem Rasterbild und wenigen Linien gilt als Scan.
- **Tests:** `test/fixtures/plans/` enthält selbst erzeugte Pläne mit bekannten Maßen (`plan-extract/tests/make_fixtures.py`, `expected.json`): DXF mit Layern/Blöcken/DIMENSION, einheitenlose cm-DXF mit aufgelösten Symbolen, Vektor-PDF 1:100 und 1:50, Text-PDF, Scan mit Rahmen. `cd dashboard/backend/plan-extract && python -m unittest discover -s tests` prüft Wand-, Tür-, Fensterzahl, Gesamtmaße, Wandstärken und Raumflächen (≤ 2 %), IFC-Validierung und die ID-basierte KI-Prüfung. `node --test test/plan-vector.test.js` prüft die Worker-Anbindung (mit `PLAN_PYTHON=<venv>/bin/python` auch Ende-zu-Ende).

## Aufbau und Datenhaltung

`App/Web → API → PostgreSQL-Auftrag → plan-worker → Vektorplan? vermessen (IfcOpenShell) : Gemini → geprüfte Geometriedaten → BIMCraft 0.11.0 → Vorschau → manuelle Übernahme`

- `app_plan_settings`: Freigabe, Richtlinienversion und Änderungsstand je Gebäude.
- `app_plan_jobs`: Quelle-IDs, SHA-256, Status, Geometriedaten, Anbieter/Tokenangaben, Vorschau und vorläufige IFC. Bytes bleiben serverseitig und sind nur für den Eigentümer abrufbar. Bei Übernahme wandert die IFC nach `app_documents` und wird aus dem Auftrag entfernt.
- Google erhält die ausgewählten vollständigen Datei-Bytes einschließlich eventuell im Plan enthaltener personenbezogener Daten. Keine Adresse oder Account-E-Mail wird zusätzlich im Prompt mitgesendet. Speicherung/Nutzung beim Anbieter richtet sich nach dessen Vertrag; diese Integration garantiert keine rein lokale Verarbeitung oder DSGVO-Konformität.
- Abschalten im Gebäude oder im KI-Profil bricht offene Aufträge ab und entfernt abgeleitete Ausgaben. Ein bereits bei Google eingegangener Aufruf kann nicht zurückgeholt werden.
- Kein Docker-Socket in der API. BIMCraft erhält ausschließlich fest vorgegebene Befehle aus validierten Zahlen/Textfeldern, nie KI-Code oder KI-Dateipfade. Arbeitsdateien im flüchtigen Worker-`/tmp`, anschließend gelöscht. Container ohne Root, ohne Linux-Capabilities, schreibgeschütztes Dateisystem; 0,5 CPU/768 MiB/64 Prozesse. API-Key nur als geschützte Datei.
- Maximal 90 Sekunden Anbieteraufruf und 120 Sekunden BIMCraft. Abgebrochene laufende Aufträge werden nach spätestens fünf Minuten als fehlgeschlagen markiert, **nicht** automatisch erneut an Google gesendet.
- Auftragsansicht zeigt Tokenangaben soweit vom Anbieter geliefert; kein verbindliches Guthaben- oder Kostenkonto. Planaufrufe sind derzeit eine eigene Statistik in `app_plan_jobs`, nicht Teil der bisherigen Chat-Zähler im Verwaltungsportal.

## Betrieb

Docker Compose startet `plan-worker` neben API/Web/DB. Aktivierung in der privaten Serverkonfiguration: `PLAN_CONVERSION_ENABLED=true`, zusätzlich funktionierender `GEMINI_MODEL` und gemountete Datei `GEMINI_API_KEY_FILE`. Keine Schlüssel in GitHub oder App. Einmal als Administrator `python3 dashboard/ops/configure-plan-worker.py` aus dem Repository aufrufen: Der Schlüssel erhält Leserecht ausschließlich für die zusätzliche Worker-Gruppe 61021, der Ordner nur Durchgangsrecht. Nach einer Schlüssel-Neuanlage mit zurückgesetzten Dateirechten erneut ausführen. Die API bleibt root-eigentümerseitig leseberechtigt.

BIMCraft-Download ist auf v0.11.0 mit SHA-256-Prüfung festgelegt; x86_64 und arm64 werden unterstützt. Quellen/Lizenzen: [BIMCraft](https://github.com/IPedrax/BIMCraft) (MIT/Apache-2.0). Die Originaldistribution mit Lizenzdateien bleibt im Container enthalten. [Gemini GenerateContent](https://ai.google.dev/api/generate-content).

Auf dem bisherigen Server ausschließlich `d21-deploy`. Wegen altem docker-compose 1.29.2 muss das Skript vor `up` **api, web und plan-worker** entfernen (nur diese Dienste), niemals die Datenbank. Der entsprechende versionierte Ablauf steht unter `dashboard/ops/deploy.sh`. Keine Änderung von Anwendungscode auf dem Server. Bei Rollback `PLAN_CONVERSION_ENABLED=false` und Worker stoppen; Tabellen bleiben für Datenbewahrung bestehen.

## Umzug auf einen h_da-Server

Die Verbindung zur Hochschule ist **noch nicht eingerichtet**. Zunächst VM, erlaubte Datenarten/Cloud-KI, Verantwortliche, Backups, Netzfreigabe und feste HTTPS-Adresse klären. Richtwert zum Start: Linux x86_64/arm64, Docker Compose, mindestens 4 vCPU/8 GiB RAM und ausreichend gesicherter SSD-Speicher; tatsächlichen Bedarf messen. Kein GPU-Zwang für diese Gemini/BIMCraft-Stufe.

1. Identischen GitHub-Stand am Ziel auschecken; private Konfiguration und Schlüssel separat geschützt bereitstellen. Ausgehend HTTPS zu Google und beim Imagebau zu den Paket-/GitHub-Quellen erlauben. PostgreSQL bleibt intern; keinen Datenbankport öffentlich freigeben.
2. Uploads/Worker am alten System pausieren, Datenbank konsistent mit `pg_dump -Fc` sichern. Alle Originaldateien, Freigaben und Aufträge liegen in PostgreSQL. Private Zusatzdateien für Sprach-/Home-Assistant-/Campus-Integration separat sichern. Keine Datenbankvolumes löschen.
3. Auf Zielserver Datenbank in **neues** Volume wiederherstellen, Konfiguration anpassen, Services starten. Nur ein System darf aktiv neue Aufträge bearbeiten. Gegebenenfalls alte `running`-Aufträge auslaufen/fehlschlagen lassen und bewusst neu starten.
4. Anmeldung, Dateiprüfsummen, Eigentümerrechte, Planvorschau/Übernahme und Backups prüfen. Erst dann Domain/Tunnel und iPhone-Serveradresse umstellen. Altes System bis zur geprüften Abnahme behalten.

Der Provider ist als Funktion `analyzePlans(docs) → {geometry,model,usage}` vom Generator getrennt. Eine Hochschul-KI benötigt einen zusätzlichen Adapter mit Bild-/PDF-Unterstützung, Authentifizierung, erreichbarem Endpunkt und demselben Geometrievertrag. Das ist vorbereitet, aber **noch nicht implementiert**. Ein reines Textmodell kann die Planerkennung nicht ersetzen.
