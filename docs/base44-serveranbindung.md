# Base44 → eigener Projektserver · Zwischenstand 28.10.2026

Felix übernimmt vorübergehend die Serveranbindung. Die hochgeladene ZIP enthält die
vollständige Oberfläche mit Dashboard, Gebäuden/Räumen, Sensorik, Energie und Analyse.
Die ursprüngliche Oberfläche verwendet Base44-Konten, Entities und Backend-Funktionen.

## Umgesetzter Weg

Browser → nginx → D21-API → PostgreSQL. Parallel nutzt die iPhone-App dieselben Konten,
Gebäude und Dokumente. Die neue Oberfläche liegt unter `dashboard/base44-frontend/`.
Felix hat die Umstellung zur neuen Standardoberfläche beauftragt; der Web-Build im
Standard-Compose zeigt deshalb auf diese Serverausgabe.

1. Anmeldung/Registrierung an vorhandene Serverkonten angeschlossen.
2. Gebäude an bestehende Tabelle angeschlossen, Zusatzfelder additiv gespeichert.
3. Konto-getrennte Ablage und validierte CRUD-/Import-Endpunkte für weitere Datentypen.
4. Bild-, PDF- und DWG-Upload sowie Download im Gebäudebereich ergänzt.
5. Demo-Daten und regelbasierte Grenzwertprüfung aus dem Export auf Node übertragen.
6. Standard-Compose auf die neue Oberfläche umgestellt; alte Oberfläche im Repository erhalten.

## Prüfstand

- Alle 24 Backend-Tests bestanden (einschließlich fünf neuer Integrationstests).
- Gemeinsame Gebäude und Dokumente zwischen bisheriger/iOS-API und neuer Oberfläche geprüft.
- Fremde Konten können weder Datensätze noch Dokumente lesen/ändern oder als Referenz verknüpfen.
- Ungültige Importe werden zurückgerollt; Sortierung, Pagination und Wiederinitialisierung geprüft.
- Demo-Erzeugung und Grenzwertprüfung konto-getrennt und wiederholbar geprüft.
- Frontend-Produktionsbuild und ESLint bestanden.
- Registrierung und Gebäudeanlage in einer lokalen Browser-Vorschau mit separater Testdatenbank geprüft.
- Die zusätzliche Typprüfung meldet noch Fehler in der JavaScript-/React-Typisierung des übernommenen UI-Codes.
- Noch kein produktiver Ende-zu-Ende-Test auf dem Server, keine Produktivumschaltung.

## Veröffentlichung

Nach Review dieses Pull Requests ausschließlich `d21-deploy` verwenden. Zuvor eine
Datenbanksicherung auf dem Server erstellen; danach API, gemeinsame Gebäude/Dateien
und den öffentlichen Zugriff prüfen. Ein bestehender Base44-Datenbestand ist nicht
Teil der ZIP und wurde nicht migriert. Die Serverausgabe nutzt die vorhandenen
Projektkonten; Base44-Konten werden nicht importiert.

Details, Einschränkungen, Entwicklung und Übergabe weiterer Exporte:
[`dashboard/base44-frontend/README.md`](../dashboard/base44-frontend/README.md).
