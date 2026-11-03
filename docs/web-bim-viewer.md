# Gemeinsamer IFC-Viewer für Website und iPhone

Stand: 3. November 2026.

## Bedienung

Im Web unter **BIM-Viewer** ein Modell aus der persönlichen Gebäudemappe auswählen. Alternativ unter **Gebäude & Räume → Bilder & Pläne → In 3D öffnen**. Für Website und iPhone dasselbe persönliche Konto verwenden. Nach einem Upload auf einem anderen Gerät die Modellliste aktualisieren.

Die Webansicht orientiert sich an den vier bereitgestellten Referenzbildern: orthografische Architekturansicht, helle Umgebung, schwebende Beschriftung und seitliche Geschossauswahl. Es gibt keine Bauphasen, Vergaben oder Terminanzeigen. Die anfängliche **Beispielcampus-Stilvorschau** ist selbst erzeugte IFC4-Geometrie mit einer erfundenen Umgebung, ausdrücklich kein D21-Modell und keine geografische Campuskarte. Straßen, Nachbarhäuser und Bäume dieser Vorschau werden bei eigenen IFC-Modellen nicht ergänzt; dort bleibt die tatsächliche exportierte Geometrie maßgeblich.

**Geschosse:** Ein Geschoss auswählen, um das Gebäude bis zu dieser Etage freizulegen; **Gesamtes Gebäude** hebt den Schnitt auf. **Geschosse trennen** versetzt die exportierten Geschosse vertikal. Die Zuordnung stammt aus `IFCBUILDINGSTOREY`, räumlicher Enthaltung und Aggregationen; fehlen zugeordnete Geometrien, werden keine Etagen erfunden. Schnitthöhen werden aus der bereits transformierten Geometrie ermittelt, damit IFC-Längeneinheiten nicht mit Viewer-Koordinaten vermischt werden. Mehrgeschossige Elemente werden nicht in neue Bauteile zerlegt. Originalmaterialien eigener IFC-Dateien bleiben erhalten.

Beide Oberflächen verwenden dieselben Gebäude, Dokument-IDs und IFC-Dateien in PostgreSQL (`app_documents`). Die vorhandenen Endpunkte `/api/v1/buildings`, `/buildings/:id/documents` und `/documents/:id` werden unverändert genutzt. Keine neue Datenbank, kein zusätzlicher Benutzerabgleich und keine Änderung an Schnittstellen.

Der Browser authentifiziert den Download mit der bestehenden persönlichen Sitzung. Das eingebettete Viewer-Fenster erhält nur IFC-Bytes per `postMessage` mit Prüfung von Ursprung und Absender. Sitzungstoken werden nicht in URLs oder an den Viewer übertragen. Bibliotheken und WASM liegen auf dem eigenen Server; keine externen Viewer-Dienste.

## Funktionen und Grenzen

Drehen, Verschieben, Zoomen, Draufsicht, Bauteilwahl, Farbwahl, Ausblenden, Wiederherstellen und eine Lichtzustandssimulation für explizit exportierte IFCSPACE-Räume. Fehlende Raumobjekte werden nicht aus Wänden erraten. IFC2x3/IFC4, maximal 20 MB, mobile Geometriegrenzen wie in der App. Die BIM-Seite konzentriert sich auf das dreidimensionale Modell; der alte schematische Grundriss ist dort nicht mehr eingeblendet.

Die Verknüpfung betrifft gespeicherte Modelle und Konten. Bestätigte Farben, ausgeblendete Bauteile und Lichtzustände werden über den bestehenden Modellstand synchronisiert. Kamera, Beschriftung, Geschossschnitt und vertikale Geschossabstände sind dagegen lokale Ansichten. Sie schreiben keine Modellzustände und verändern weder die IFC-Datei noch gespeicherte Sichtbarkeiten. Die Stilvorschau stellt keine Serveranfragen zur Speicherung. Keine Steuerung echter Geräte oder physikalische Lichtberechnung.

## Quellcode und Build

`dashboard/base44-frontend/ifc-viewer/` enthält den aus `ios/ifc-viewer/` abgeleiteten Viewer-Kern. Die Web-Variante lädt Dateien über den geprüften Nachrichtenkanal zum Elternfenster und besitzt die hier beschriebene eigenständige Architektur- und Geschossdarstellung. Änderungen an gemeinsamen Interaktionen, Befehlen und dem Modellzustandsvertrag weiterhin mit iOS abgleichen. `storeys.js`, `example.js` und `surroundings.js` ergänzen die Webdarstellung.

`npm run build` baut mit `scripts/build-ifc.mjs` zunächst den eigenständigen Viewer und kopiert WASM und Lizenztexte nach `public/ifc-viewer/`, anschließend die Website. Generierte Viewer-Dateien werden nicht committet. Docker führt denselben Build aus.

## Prüfung

`npm run test:viewer` prüft das Parsen der selbst erzeugten IFC4-Vorschau, die Zuordnung aller dargestellten Bauteile, verschachtelte/zyklische räumliche Beziehungen und Schnitthöhen mit getrennten Geschossen. Zusätzlich Website-Build und ESLint sowie Browserprüfung mit lokal simuliertem Konto und eigener IFC-Raum-Testdatei. Keine Produktivdaten für diese Tests.

Lokaler Prüflauf vom 3. November 2026: drei IFC-/Geschosstests, Build und ESLint bestanden. Im Browser wurden die Stilvorschau, das Öffnen der obersten Etage ohne Dachplatte, vertikale Geschossabstände, Zoom und die Übertragung der vorhandenen `ios/tests/fixtures/light-room.ifc` geprüft. Die Testdatei besitzt keine Geschosszuordnung; der Viewer zeigt entsprechend null Geschosse und deaktiviert die Trennung. Bei 390 px Breite funktionieren Modellauswahl und einklappbare Geschossliste ohne horizontalen Seitenüberlauf; der Wechsel zur Desktopbreite passt die orthografische Ansicht an. Keine Browserfehler im Prüflauf. Produktivserver und ein echtes D21-Modell waren nicht Teil dieses Tests.
