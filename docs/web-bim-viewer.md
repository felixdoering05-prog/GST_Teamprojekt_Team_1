# Gemeinsamer IFC-Viewer für Website und iPhone

Stand: 30. Oktober 2026.

## Bedienung

Im Web unter **BIM-Viewer → IFC-Modell in 3D** ein Modell aus der persönlichen Gebäudemappe auswählen. Alternativ unter **Gebäude & Räume → Bilder & Pläne → In 3D öffnen**. Für Website und iPhone dasselbe persönliche Konto verwenden. Nach einem Upload auf einem anderen Gerät die Modellliste aktualisieren.

Beide Oberflächen verwenden dieselben Gebäude, Dokument-IDs und IFC-Dateien in PostgreSQL (`app_documents`). Die vorhandenen Endpunkte `/api/v1/buildings`, `/buildings/:id/documents` und `/documents/:id` werden unverändert genutzt. Keine neue Datenbank, kein zusätzlicher Benutzerabgleich und keine Änderung an Schnittstellen.

Der Browser authentifiziert den Download mit der bestehenden persönlichen Sitzung. Das eingebettete Viewer-Fenster erhält nur IFC-Bytes per `postMessage` mit Prüfung von Ursprung und Absender. Sitzungstoken werden nicht in URLs oder an den Viewer übertragen. Bibliotheken und WASM liegen auf dem eigenen Server; keine externen Viewer-Dienste.

## Funktionen und Grenzen

Drehen, Zoomen, Bauteilwahl, Farbwahl, Ausblenden, Wiederherstellen und eine Lichtzustandssimulation für explizit exportierte IFCSPACE-Räume. Fehlende Raumobjekte werden nicht aus Wänden erraten. IFC2x3/IFC4, maximal 20 MB, mobile Geometriegrenzen wie in der App. Der bisherige schematische Grundriss bleibt separat verfügbar.

Die Verknüpfung betrifft gespeicherte Modelle und Konten. Farben, ausgeblendete Bauteile und Lichtzustände werden derzeit nicht zwischen Geräten synchronisiert und verändern die IFC-Datei nicht. Keine Steuerung echter Geräte oder physikalische Lichtberechnung.

## Quellcode und Build

`dashboard/base44-frontend/ifc-viewer/` enthält den Viewer-Kern aus `ios/ifc-viewer/`; die Web-Variante ersetzt ausschließlich das Laden der Datei durch den geprüften Nachrichtenkanal zum Elternfenster. Bei weiteren Änderungen beide Varianten gemeinsam pflegen. `interactions.js`, HTML und CSS sollen funktional identisch bleiben.

`npm run build` baut mit `scripts/build-ifc.mjs` zunächst den eigenständigen Viewer und kopiert WASM und Lizenztexte nach `public/ifc-viewer/`, anschließend die Website. Generierte Viewer-Dateien werden nicht committet. Docker führt denselben Build aus.

## Prüfung

Website-Build und ESLint; Browser-Test mit lokal simuliertem Konto, Dokumentliste und eigener IFC-Raum-Testdatei. Modellübertragung und Lichtschalter, fehlende Dateirechte und leere Modellliste werden geprüft. Es werden dabei keine echten Benutzerkonten oder Serverdateien verändert.
