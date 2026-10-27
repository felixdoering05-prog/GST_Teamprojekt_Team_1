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

E-Mail-Bestätigung, Passwort-Wiederherstellung, Kontolöschung, Gebäudefreigaben sind noch nicht angebunden. [API-Vertrag und Grenzen](../docs/konten-api.md).

Validierung: Xcode-27.1-Debug-Build für den iPhone-18-Pro-Simulator; Backendtests mit isolierter PostgreSQL-Laufzeit.

## Bilder, PDF- und DWG-Dateien

In den Gebäudedetails lassen sich Fotos aus der Mediathek und Dateien aus der Dateien-App hochladen. Die Dateiablage ist dieselbe wie im Web-Dashboard. Bilder und PDFs haben eine Vorschau; DWG kann in eine CAD-App geteilt oder gesichert werden. Grenzen: 25 MB je Datei, 250 MB je Konto. [Dateiablage und API](../docs/dateien.md).

Den Simulator mit regulärer Xcode-Signierung bauen. `CODE_SIGNING_ALLOWED=NO` verhindert die nötige App-Kennung für den Schlüsselbund und ist für diese App kein geeigneter Laufzeit-Build.
