# Nala Solutions · native iPhone-App

[← Projektübersicht](../README.md) · [Änderungen, neueste zuerst](../CHANGELOG.md)

**Stand: 16.11.2026 · Quellstand 1.0.141 (141).** Eine Installation dieses Gesamtstands ist noch nicht nachgewiesen. Quellstand, Server-Veröffentlichung, iPhone-Installation und TestFlight sind getrennte Schritte.

## Aktuelle Bedienung

Die App startet bei den persönlichen **Gebäuden**. Hauptbereiche: **Dashboard · Gebäude · Team**. Das Profil ist über das Profilsymbol erreichbar. Geräte werden im jeweiligen Gebäude geöffnet; ein eigener Geräte-Hauptreiter entfällt. Kontakte und Mitteilungen sind unter Team zusammengeführt.

Gebäudekarten zeigen eine Vorschau des tatsächlich hinterlegten IFC-Modells: dunkelblau im hellen, hellblau im dunklen Erscheinungsbild. Ohne Modell erscheint ein Leerzustand. Allgemeine fiktive Beispieldaten gibt es unter **Profil → Darstellung → Vorstellungsmodus**. Aktiv verbundene ESP32 mit simulierten Testwerten erscheinen zusätzlich im normalen Gebäude-Dashboard, ausdrücklich als Simulation gekennzeichnet. Der Modus ist standardmäßig aus und verwendet lokale Beispieldaten ohne Hardwareänderung oder KI-Anfrage.

## Funktionen

- Projektstart mit Logo, Anmeldung, Profilbild und Begrüßung mit Account-Namen.
- Geführte Gebäudeanlage: Name, optionale Adresse, Fotos, Pläne und Übersicht; lokale Zwischenstände fortsetzen.
- Gemeinsame Serverablage für Fotos, PDF, DWG und IFC; Suche, Vorschau, Umbenennen und bestätigtes Löschen. DWG wird an eine geeignete CAD-App weitergegeben.
- IFC-Bibliothek und 3D-Ansicht mit Drehen, Zoomen, Bauteilauswahl, Farben/Sichtbarkeit und bestätigbaren Modellbefehlen. Der Gebäude-Reiter 3D lädt das gewählte Modell; Ansichtszustände werden mit dem Web abgeglichen, Originaldateien bleiben erhalten.
- Geräte dem eigenen Gebäude und vorhandenen IFC-Räumen zuordnen; freigegebene echte Home-Assistant-Lampen schalten, dimmen und färben. Vereinfachte Raumfarbmarkierung und Schatten; keine physikalische Lichtberechnung.
- Manuelle Standort-/Ausrichtungswahl je IFC und ausdrücklich geladene OSM-Umgebung in BIM-Optik; keine automatische Vermessung.
- Kontakte mit Bestätigung, Gebäudeeinladungen, In-App-Mitteilungen und Gebäudechat. Eigene Nachrichten nach Bestätigung löschen. Noch keine iOS-Push-Mitteilungen.
- Dashboard mit Sensorik, Energie, regelbasierter Auswertung und CSV-Messwertimport mit Vorschau. ESP32-Werte mit Verlauf, gemeinsamer Raumzuordnung sowie Schnittstelle für BME280-Temperatur/Luftfeuchte im IFC-Raum. Simulierte Werte bleiben getrennt gekennzeichnet.
- Grundrisse aus Vektorplänen, Fotos und Scans als prüfbaren IFC-Entwurf erzeugen; Korrektur-Editor, Fortschrittsanzeige und Ebenenwahl. Siehe [Plan → IFC](../docs/plan-zu-ifc.md).
- Privater Gemini-Gebäudechat und ElevenLabs-Livegespräch mit Unterbrechen und direkter Sprachantwort. Einmalige Kontofreigabe unter Profil → KI-Einstellungen; Mikrofon startet erst mit Gespräch starten.
- Assistent kann ausdrücklich zugeordnete und autorisierte Lampen steuern, einschließlich Raumgruppen, RGB und Helligkeit. Keine zusätzlichen Haken pro Lampenauftrag; Ausführung und Zustandsprüfung bleiben auf dem Server. Gebäudefreigaben erweitern keine privaten Hardwareberechtigungen.

[Neuester App-Stand und Freigaben](../docs/app-echte-daten-lampenassistent.md) · [Geräte/Räume/RGB/Karte](../docs/geraete-raeume-rgb-karten.md) · [Gebäudemappe](../docs/gebaeudemappe-ios.md)

## Mit dem Server verbinden

Der normale Einstieg verwendet das persönliche Projektkonto. Die App behält bislang ihren verwalteten HTTPS-Zugang; die neue Dashboard-Domain `https://nala-solutions.de` führt nicht automatisch zu einer Migration gespeicherter iPhone-Sitzungen. Im Browser ist nur die persönliche Account-Anmeldung nötig. Zugangsdaten sind nicht im Quellcode hinterlegt; die App hält ihre Sitzung im Schlüsselbund.

Für eine spätere Änderung des App-Serverziels gespeicherte Entwürfe, Sitzungen, Gerätebrücken und Home-Assistant-Rückleitungen gesondert prüfen. Eine Domain-Änderung nicht mit einer bereits installierten nativen Version gleichsetzen.

Web und iPhone verwenden dieselben persönlichen oder ausdrücklich freigegebenen Gebäudemappen. Die private GitHub-Modellablage importiert Dateien nicht automatisch in die App. Die App greift über die API auf PostgreSQL zu, niemals direkt auf die Datenbank.

Standardgrenzen (kontobezogene Freigaben können abweichen): **20 MiB je IFC**, **25 MiB für andere unterstützte Dateien**, **250 MiB pro Konto**. Die IFC-Geometrie wird nach dem Download auf dem iPhone berechnet; große Exporte können Geräte überfordern.

## Xcode und Installation

1. `KI Trifft Gebäude APP/KI Trifft Gebäude APP.xcodeproj` öffnen.
2. Scheme **KI Trifft Gebäude APP** und einen konkreten Simulator oder ein verbundenes iPhone auswählen. „Any iOS Device“ ist nur ein Build-Ziel.
3. Passendes Signierungsteam wählen, bauen und starten. Auf dem echten Gerät gegebenenfalls Vertrauen/Entwicklermodus bestätigen.

Für den Schlüsselbund regulär signierte Builds verwenden; `CODE_SIGNING_ALLOWED=NO` ist kein geeigneter Laufzeit-Build dieser App. GitHub-Merge und Server-Deployment installieren keine neue native App. Für den aktuellen Stand ist die direkte Installation zuletzt an der fehlenden Registrierung des iPhones im Hochschul-Developer-Team gescheitert. Ein Hochschul-Admin muss das Gerät registrieren bzw. diese Berechtigung freigeben. Daraus folgt keine Aussage über ältere TestFlight-Builds; eine Veröffentlichung von 1.0.139 ist nicht nachgewiesen.

## Prüfstand und Grenzen

Die früheren Prüfungen von 1.0.89 sind historische Nachweise, keine Abnahme von 1.0.139. Der lokale Simulator-Build von 1.0.138 war erfolgreich; für 1.0.139 sind die GitHub-Prüfungen Backend und iOS erfolgreich. Der aktuelle Geräte-Gesamtstand benötigt weiterhin einen Praxistest. Aktuelle offene Schritte stehen im [Arbeitsabschluss vom 16.11.](../docs/protokolle/2026-11-16-technischer-arbeitsabschluss.md).

Gemini erhält bewusst angefragte begrenzte Kontexte, keine automatischen vollständigen Plan-/IFC-Dateien oder Teamchats. Live-Audio geht an ElevenLabs. Keine eigene KI trainiert, keine vollständige Plan-/Geometrieprüfung. Native iOS-Mikrofonfreigabe bleibt erforderlich. Passwort-Rücksetzung ist implementiert und benötigt einen funktionierenden SMTP-Absender. Kontolöschung und Datenschutzhinweise sind integriert ([#119](../../pull/119)); eine E-Mail-Bestätigung ist dadurch nicht automatisch nachgewiesen.

Ältere Dokumente beschreiben teilweise die damalige Simulation oder Navigation. Maßgeblich für die neuesten Änderungen sind [CHANGELOG](../CHANGELOG.md) und [aktueller App-Stand](../docs/app-echte-daten-lampenassistent.md).
