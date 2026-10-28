# Arbeitsprotokoll: erster IFC-Viewer in der iOS-App

Datum: 28. Oktober 2026. Umsetzung durch Felix mit Codex auf Branch `feat/ios-ifc-viewer`.

Anlass: IFC-Modelle sollen erstmals direkt in der App betrachtet werden können.

Ergebnis: eigener IFC-Tab und Einstieg aus der Gebäudemappe, lokale Datei-Auswahl, Offline-IFC-Parser, dreh- und zoombares 3D-Modell, Gesamtansicht/Draufsicht und anklickbare Bauteile mit Name/Typ/IDs. Dateigröße und Geometrieanzahl sind begrenzt; ungültige Dateien erhalten eine Fehlermeldung. Kein Server- oder Datenbankeingriff.

Validierung und bekannte Grenzen stehen in [IFC-Viewer für iOS](../ifc-viewer-ios.md). Nächster Integrationsschritt mit Benjamin und Emir: IFC-Upload-/Download-Vertrag und Zuordnung zum Gebäude abstimmen, echte Revit-Exporte auf dem iPhone testen.
