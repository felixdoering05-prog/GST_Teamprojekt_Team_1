# D21 · native iPhone-App

[← Projektübersicht](../README.md) · [Änderungen, neueste zuerst](../CHANGELOG.md)

**Stand: 04.11.2026 · Version 1.0.89 (89), auf Felix’ iPhone installiert.**

## Aktuelle Bedienung

Die App startet bei den persönlichen **Gebäuden**. Hauptbereiche: **Dashboard · Gebäude · Team**. Das Profil ist über das Profilsymbol erreichbar. Geräte werden im jeweiligen Gebäude geöffnet; ein eigener Geräte-Hauptreiter entfällt. Kontakte und Mitteilungen sind unter Team zusammengeführt.

Gebäudekarten zeigen eine Vorschau des tatsächlich hinterlegten IFC-Modells: dunkelblau im hellen, hellblau im dunklen Erscheinungsbild. Ohne Modell erscheint ein Leerzustand. Fiktive Messwerte gibt es ausschließlich unter **Profil → Darstellung → Vorstellungsmodus**. Der Modus ist standardmäßig aus und verwendet lokale Beispieldaten ohne Hardwareänderung oder KI-Anfrage.

## Funktionen

- Projektstart mit Logo, Anmeldung, Profilbild und Begrüßung mit Account-Namen.
- Geführte Gebäudeanlage: Name, optionale Adresse, Fotos, Pläne und Übersicht; lokale Zwischenstände fortsetzen.
- Gemeinsame Serverablage für Fotos, PDF, DWG und IFC; Suche, Vorschau, Umbenennen und bestätigtes Löschen. DWG wird an eine geeignete CAD-App weitergegeben.
- IFC-Bibliothek und 3D-Ansicht mit Drehen, Zoomen, Bauteilauswahl, Farben/Sichtbarkeit und bestätigbaren Modellbefehlen. Der Gebäude-Reiter 3D lädt das gewählte Modell; Ansichtszustände werden mit dem Web abgeglichen, Originaldateien bleiben erhalten.
- Geräte dem eigenen Gebäude und vorhandenen IFC-Räumen zuordnen; freigegebene echte Home-Assistant-Lampen schalten, dimmen und färben. Vereinfachte Raumfarbmarkierung und Schatten; keine physikalische Lichtberechnung.
- Manuelle Standort-/Ausrichtungswahl je IFC und ausdrücklich geladene OSM-Umgebung in BIM-Optik; keine automatische Vermessung.
- Kontakte mit Bestätigung, Gebäudeeinladungen, In-App-Mitteilungen und Gebäudechat. Eigene Nachrichten nach Bestätigung löschen. Noch keine iOS-Push-Mitteilungen.
- Dashboard mit Sensorik, Energie, regelbasierter Auswertung und CSV-Messwertimport mit Vorschau. Keine erfundenen Live-Messwerte.
- Privater Gemini-Gebäudechat und ElevenLabs-Livegespräch mit Unterbrechen und direkter Sprachantwort. Einmalige Kontofreigabe unter Profil → KI-Einstellungen; Mikrofon startet erst mit Gespräch starten.
- Assistent kann ausdrücklich zugeordnete und autorisierte Lampen steuern, einschließlich Raumgruppen, RGB und Helligkeit. Keine zusätzlichen Haken pro Lampenauftrag; Ausführung und Zustandsprüfung bleiben auf dem Server. Gebäudefreigaben erweitern keine privaten Hardwareberechtigungen.

[Neuester App-Stand und Freigaben](../docs/app-echte-daten-lampenassistent.md) · [Geräte/Räume/RGB/Karte](../docs/geraete-raeume-rgb-karten.md) · [Gebäudemappe](../docs/gebaeudemappe-ios.md)

## Mit dem Server verbinden

Unter **Serververbindung einrichten** die aktuelle HTTPS-Projektadresse und den separat erhaltenen Website-Zugang eintragen; anschließend das persönliche Konto verwenden oder erstellen. Keine Zugangsdaten sind im Quellcode hinterlegt. Sitzung und Website-Zugang werden geschützt im iOS-Schlüsselbund gespeichert.

Web und iPhone verwenden dieselben persönlichen oder ausdrücklich freigegebenen Gebäudemappen. Die private GitHub-Modellablage importiert Dateien nicht automatisch in die App. Die App greift über die API auf PostgreSQL zu, niemals direkt auf die Datenbank.

Grenzen: **20 MiB je IFC**, **25 MiB für andere unterstützte Dateien**, **250 MiB pro Konto**. Die IFC-Geometrie wird nach dem Download auf dem iPhone berechnet; große Exporte können Geräte überfordern.

## Xcode und Installation

1. `KI Trifft Gebäude APP/KI Trifft Gebäude APP.xcodeproj` öffnen.
2. Scheme **KI Trifft Gebäude APP** und einen konkreten Simulator oder ein verbundenes iPhone auswählen. „Any iOS Device“ ist nur ein Build-Ziel.
3. Passendes Signierungsteam wählen, bauen und starten. Auf dem echten Gerät gegebenenfalls Vertrauen/Entwicklermodus bestätigen.

Für den Schlüsselbund regulär signierte Builds verwenden; `CODE_SIGNING_ALLOWED=NO` ist kein geeigneter Laufzeit-Build dieser App. GitHub-Merge und Server-Deployment installieren keine neue native App. Aktuell erfolgt die Installation über Xcode; noch keine TestFlight-Verteilung.

## Prüfstand und Grenzen

Für Version 1.0.89: Web-Build, signierter iPhone-Build, fünf Viewer-Tests und insgesamt 107 Backend-Tests erfolgreich. Installation auf Felix’ iPhone bestätigt. Produktive Modellmetadaten, Lampenzuordnung und Kontotrennung lesend geprüft. Automatisierte Schaltprüfungen nutzen Testlampen; echte Sprachbedienung und die genaue Kartenplatzierung vor einer Präsentation gemeinsam testen.

Gemini erhält bewusst angefragte begrenzte Kontexte, keine automatischen vollständigen Plan-/IFC-Dateien oder Teamchats. Live-Audio geht an ElevenLabs. Keine eigene KI trainiert, keine vollständige Plan-/Geometrieprüfung. Native iOS-Mikrofonfreigabe bleibt erforderlich. Passwort-Rücksetzung benötigt weiterhin einen eingerichteten SMTP-Absender; E-Mail-Bestätigung und Kontolöschung sind noch nicht angebunden.

Ältere Dokumente beschreiben teilweise die damalige Simulation oder Navigation. Maßgeblich für die neuesten Änderungen sind [CHANGELOG](../CHANGELOG.md) und [aktueller App-Stand](../docs/app-echte-daten-lampenassistent.md).
