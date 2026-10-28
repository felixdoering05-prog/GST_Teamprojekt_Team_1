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

E-Mail-Bestätigung, Kontolöschung und Gebäudefreigaben sind noch nicht angebunden. Die Passwort-Wiederherstellung ist vorbereitet und benötigt ein eingerichtetes Absenderkonto. [API-Vertrag und Grenzen](../docs/konten-api.md).

Validierung: Xcode-27.1-Debug-Build für den iPhone-18-Pro-Simulator; Backendtests mit isolierter PostgreSQL-Laufzeit.

## Bilder, PDF- und DWG-Dateien

In den Gebäudedetails lassen sich Fotos aus der Mediathek und Dateien aus der Dateien-App hochladen. Die Dateiablage ist dieselbe wie im Web-Dashboard. Bilder und PDFs haben eine Vorschau; DWG kann in eine CAD-App geteilt oder gesichert werden. Grenzen: 25 MB je Datei, 250 MB je Konto. [Dateiablage und API](../docs/dateien.md).

Den Simulator mit regulärer Xcode-Signierung bauen. `CODE_SIGNING_ALLOWED=NO` verhindert die nötige App-Kennung für den Schlüsselbund und ist für diese App kein geeigneter Laufzeit-Build.

## Startbildschirm

Bei einem vollständigen App-Neustart erscheint das bereitgestellte Projektlogo mit „GST TEAMPROJEKT“, „KI trifft Gebäude“ und „Ein Projekt der Hochschule Darmstadt“. Nach rund 1,8 Sekunden folgt die vorhandene Anmeldung bzw. Sitzungswiederherstellung. Beim Wechsel aus dem Hintergrund erscheint der Bildschirm nicht erneut; sein Zustand gilt nur für den laufenden App-Prozess. Reduzierte Bewegung wird beim Übergang berücksichtigt.

Die originale transparente PNG-Datei liegt in `Assets.xcassets/ProjectLogo.imageset`. Für eine stabile Simulator-Vorschau kann ein Debug-Build einmal mit `-D21SplashPreview` gestartet werden. Diese Vorschau-Option ist in Release-Builds nicht enthalten.

## Persönlicher Start und geführte Anlage

Die Startseite begrüßt den angemeldeten Account mit seinem Namen. Das Profilsymbol oben rechts öffnet Kontodaten und die servergespeicherte Profilbild-Auswahl. „Neues Gebäude“ führt durch Name, optionale Adresse, Fotos, PDF-/DWG-Pläne und Abschlussübersicht. Ein lokaler Zwischenstand lässt sich nach einem App-Neustart fortsetzen. Die Gebäudemappe bietet Dateisuche, Vorschau, Umbenennen, bestätigtes Löschen und wiederholbare Uploads. [Gebäudemappe, lokale Entwürfe und API](../docs/gebaeudemappe-ios.md).

## Passwort vergessen

Die Anmeldung bietet eine Rücksetzung per einmaligem E-Mail-Code an. Ohne eingerichteten SMTP-Absender zeigt die Ansicht den ausstehenden Mailversand an und verschickt keine Mail. [Einrichtung und Grenzen](../docs/passwort-mail.md).

## IFC-Viewer (erste Version)

Der Tab **IFC-Viewer** zeigt die auf dem Projektserver gespeicherten Modelle pro Gebäude. IFC-Dateien können beim Anlegen, in der Gebäudemappe oder auf der Website hochgeladen und in der App als interaktives 3D-Modell mit Bauteilauswahl geöffnet werden. Maximal 20 MiB je IFC-Datei, 250 MiB pro Konto; die Anzeige wird auf dem iPhone berechnet. Eine lokale Vorschau ohne Upload bleibt verfügbar. [Bedienung, Build und Grenzen](../docs/ifc-viewer-ios.md).
