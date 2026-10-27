# D21 · iOS-App

In Xcode `KI Trifft Gebäude APP/KI Trifft Gebäude APP.xcodeproj` öffnen, das gleichnamige Scheme und einen konkreten iPhone-Simulator auswählen und starten.

## Enthalten

- Startseite mit Konto erstellen und Anmelden
- Persönliches Konto mit Name, E-Mail und Passwort
- HTTPS-Serververbindung mit getrenntem Website-Zugang
- Geschützte Speicherung der Sitzung im iOS-Schlüsselbund
- Gebäude anlegen, vom Server laden, suchen und öffnen
- Profil und Abmelden; Meldungen bleiben ein Platzhalter

Die zugehörige Konten-API muss auf dem Projektserver veröffentlicht sein. Unter **Serververbindung einrichten** werden aktuelle HTTPS-Adresse und bestehende Website-Zugangsdaten eingegeben; keine Passwörter sind im Quellcode hinterlegt. Anschließend ein persönliches Konto erstellen.

Gebäudedaten liegen in PostgreSQL und sind dem jeweiligen Konto zugeordnet. Demo-Gebäude aus dem Browser-Dashboard sowie frühere lokale iOS-Testdaten werden nicht automatisch übernommen. Alte lokale Daten werden durch diese Änderung nicht gelöscht.

E-Mail-Bestätigung, Passwort-Wiederherstellung, Kontolöschung, Gebäudefreigaben und Datei-Uploads sind noch nicht angebunden. [API-Vertrag und Grenzen](../docs/konten-api.md).

Validierung: Xcode-27.1-Debug-Build für den iPhone-18-Pro-Simulator; Backendtests mit isolierter PostgreSQL-Laufzeit.
