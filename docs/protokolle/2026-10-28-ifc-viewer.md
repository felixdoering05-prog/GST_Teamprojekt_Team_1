# Arbeitsprotokoll: erster IFC-Viewer in der iOS-App

Datum: 28. Oktober 2026. Umsetzung durch Felix mit Codex auf Branch `feat/ios-ifc-viewer`.

Anlass: IFC-Modelle sollen erstmals direkt in der App betrachtet werden können.

Ergebnis: eigener IFC-Tab und Einstieg aus der Gebäudemappe, lokale Datei-Auswahl, zentraler IFC-Upload in PostgreSQL pro Gebäude, geschützter Download, Offline-IFC-Parser, dreh- und zoombares 3D-Modell, Gesamtansicht/Draufsicht und anklickbare Bauteile mit Name/Typ/IDs. Dateigröße und Geometrieanzahl sind begrenzt; ungültige Dateien erhalten eine Fehlermeldung. Die bestehende Dokument-API akzeptiert jetzt IFC2x3/IFC4 bis 20 MiB; Tabellen und gespeicherte Bestandsdaten bleiben erhalten. Website und App verwenden dieselbe Dateiablage. 3D-Berechnung auf dem iPhone, Dateispeicherung auf Felix’ Server.

Validierung und bekannte Grenzen stehen in [IFC-Viewer für iOS](../ifc-viewer-ios.md). Nächster Integrationsschritt mit Benjamin und Emir: echte Revit-Exporte auf dem iPhone testen, Gebäude-/Modellfreigaben und größere Modelle bei Bedarf gemeinsam planen.
