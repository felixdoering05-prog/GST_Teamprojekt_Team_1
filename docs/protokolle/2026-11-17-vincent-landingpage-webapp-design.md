# 17.11.2026 · Landingpage „KI trifft Gebäude“ im Webapp-Design

## Änderung

Die öffentliche Projektseite übernimmt die Beige- und Olivtöne des Webapp-Designs und eine dunkle Darstellung passend zur Systemeinstellung. Seitentitel, Seitenkopf, Startbereich und Fußzeile verwenden den Projektnamen „KI trifft Gebäude“. Die Schriften Inter und Space Grotesk werden lokal mit ihren OFL-Lizenzen ausgeliefert.

Das Projektziel, die sechs bestätigten Teammitglieder, der Bildnachweis, die Aufgabenstellung und die als datenfrei gekennzeichnete Demo bleiben auf der Seite auffindbar. Die Schaltfläche „Zum Dashboard“ führt zu `nala-solutions.de`.

## Prüfungen

- `npm run build` und `npm run lint` erfolgreich. Der Build meldet eine Größenwarnung für ein JavaScript-Bündel.
- Lokale Browserprüfung in der Desktop-Ansicht und bei 390 px Breite. Abschnittslinks, Pfeiltasten, Demo-Auswahl und alle sechs Teamkarten geprüft. Gebäudebild und Schriften geladen.
- Der Dashboard-Link erreichte die Anmeldung. Der PDF-Link lieferte HTTP 200. Die ausgelieferte PDF-Datei wurde als vierseitiges Dokument geprüft. Die eingebettete PDF-Vorschau blieb im Browser leer.

## Übergabe

Branch `feat/vincent-landingpage-webapp-design`, Pull Request [#221](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/221). Die Änderung ist zur Prüfung vorbereitet. Nach Freigabe und Zusammenführung kann Felix `d21-deploy` ausführen und die öffentliche Projektseite prüfen.
