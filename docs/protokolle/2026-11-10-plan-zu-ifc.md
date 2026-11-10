# Technischer Arbeitsbericht – Plan zu IFC

10. November 2026. Kein freigegebenes Team-Sitzungsprotokoll.

## Umsetzung

Einmaliges Gebäude-Opt-in für Google-Analyse, dauerhafte PostgreSQL-Aufträge, begrenzte Gemini-Aufrufe, strikt validierte Geometriedaten und getrennter BIMCraft-Worker. Neue Uploads automatisch, Altdateien nur nach Auswahl. Eigentümer prüft PNG-Vorschau/Annahmen und übernimmt einen zusätzlichen IFC-Entwurf. Bestehende Dateien unverändert. Web und iPhone-Build 1.0.99.

## Nachweise vor Produktivbetrieb

- 132 Backend-Tests bestanden, darunter acht neue Plan-Konvertierungstests: Eigentümerrechte, Opt-in, Bündelung ohne Datenverlust, Widerruf während Verarbeitung, Quellen-Prüfsummen, getrennte Entwürfe, idempotente Übernahme, Quoten und fehlender Maßstab.
- Web-Build und gezielte ESLint-Prüfung erfolgreich. Neue Oberfläche in Desktop- und 390-px-Handybreite mit künstlichen Daten sichtbar kontrolliert.
- Simulator-Build erfolgreich. Physisches iPhone noch nicht aktualisiert.
- BIMCraft-Generator mit künstlichem 6×5-m-Grundriss im vorhandenen isolierten CLI geprüft: IFC4, vier Wände, ein Raum, eine Decke, PNG-Vorschau.
- Vollständiger realer Gemini-/Container-Durchlauf nach GitHub-Veröffentlichung noch zu prüfen. Kein Anspruch auf Maßhaltigkeit oder produktionsreife Planrekonstruktion.

[Bedienung, Datenfluss, Grenzen und Hochschul-Umzug](../plan-zu-ifc.md).
