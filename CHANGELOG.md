# Änderungsverlauf

## 14. November 2026 – LiDAR-Raumscan mit Server-IFC (iPhone 1.0.127)

- Der Raumscan schickt die RoomPlan-Struktur an den Projektserver; der IFC-Worker erzeugt mit ifcopenshell ein IFC4 mit Raumvolumen, Wandstärken, Tür-/Fensteröffnungen und Möbeln.
- Raumnamen und -typen aus RoomPlan-Labels und erkannten Möbeln, ohne KI. Prüfen und Übernehmen in der App.
- Ohne Serververbindung entsteht das IFC wie bisher auf dem iPhone.

[Anleitung](docs/lidar-raumscan-server.md)

## 10. November 2026 – Grundriss zu vorläufigem IFC

- Einmalige Google-Freigabe je Gebäude; nach Aktivierung neue Bilder/PDFs automatisch analysieren. Vorhandene Pläne nur nach Auswahl.
- Dauerhafte PostgreSQL-Aufträge, getrennter BIMCraft-Worker, Limits und Abbruch bei Widerruf.
- Web- und iPhone-Oberfläche für Vorschau, Warnungen, Verwerfen und Übernehmen als zusätzliche IFC.
- Keine automatische Übernahme, kein Ersatz vorhandener Modelle. Lesbare Maße nötig; Dach und Treppen werden nicht rekonstruiert.
- Konfigurierbare Dienste und Umzugsanleitung für einen späteren h_da-Server.

[Anleitung](docs/plan-zu-ifc.md)


## 05.11.2026 – Automatische IFC-Platzierung (iPhone 1.0.98)

- Ein gemeinsamer Schritt „Automatisch platzieren & Karte laden“, Zahlenfelder unter Details.
- IFC MapConversion mit expliziter EPSG-Referenz (UTM / Web Mercator), Modellmittelpunkt, Einheiten und Nordrichtung werden ausgewertet. Alternativ IFC-Site-GPS mit TrueNorth oder passender vorhandener OSM-Grundriss.
- Unklare Angaben bleiben manuell korrigierbar; 180°-Mehrdeutigkeit wird angezeigt. Kein Anschluss an ein amtliches Geoportal, keine vermessungstechnische Freigabe.


[← Projektübersicht](README.md)

**Neueste Änderungen zuerst.** Innerhalb eines Tages stehen die zuletzt zusammengeführten Änderungen oben. Dieser Verlauf dokumentiert Entwicklung; er ersetzt keine Team-Sitzungsprotokolle. Frühere Einträge beschreiben den damaligen Stand und werden durch spätere Änderungen ergänzt.

## 5. November 2026

### Native Heatmap für Gebäude, Wetter und weiße Karte

- Neuer iPhone-Reiter mit Gebäudestandort, aktuellen Open-Meteo-Modellwerten und bis zu 24 stündlichen Prognosewerten. Expliziter Abruf mit gerundetem Punkt und Cache; keine erfundenen Messwerte.
- Private IFC-Auswahl und direkt bedienbarer Stundenregler für illustrative Oberflächenfarben. Wetterdaten samt Quelle und Abrufzeit stehen dem privaten KI-Chat und bewusst gestarteter Live-Sprache zur Verfügung.
- Weiße mobile Modellumgebung mit Schatten, etwa 100 × 100 m neue Kartenausschnitte und Plausibilitätsprüfung von IFC-GPS und Grundriss. Keine blind automatische, vermessungsgerechte Georeferenzierung.
- Signierter App-Build 1.0.96 (96), 117 Backend-Tests und fünf native Viewer-Tests. Sommer-/Winterfarben und weißer Hintergrund mit einem synthetischen IFC sichtbar geprüft; tatsächlicher Wetterabruf für öffentlichen Darmstadt-Punkt erfolgreich.

[Anleitung, Datenschutz und Prüfgrenzen](docs/iphone-heatmap-wetter.md)

## 4. November 2026

### Zuletzt · Lampenassistent und natürliche Raumnamen · PR #90

- Kurze Raumnamen wie „Wintergarten“ trotz IFC-Bezeichnung mit Raumnummer erkennen.
- Verschachtelte Werkzeugparameter für ElevenLabs beschreiben; Konfiguration vom verwalteten D21-Agenten angenommen, Authentifizierung weiterhin aktiv.
- Gezielte Tests für explizite Wünsche, unklare Fragen und kurze Raumnamen bestanden. Keine echten Lampen durch automatische Tests geschaltet.

[Pull Request #90](../../pull/90)

### App 1.0.89 (89) · Echte Daten und vereinfachte Bedienung · PR #89

- Start bei den echten Gebäuden; lokale fiktive Werte nur unter Profil → Darstellung → Vorstellungsmodus. Standard: aus.
- Echte IFC-Vorschauen auf Gebäudekarten: dunkelblau bei hellem, hellblau bei dunklem Erscheinungsbild.
- Eigener Geräte-Tab entfernt; Geräte über das jeweilige Gebäude öffnen. Kontakte und Mitteilungen unter Team zusammengeführt.
- Einmalige kontoweite Freigabe für KI, Sprache und zugeordnete private Lampen. Bestehende KI-Freigaben gewähren standardmäßig keinen neuen Hardwarezugriff.
- Gemini-Chat und ElevenLabs-Livegespräch können autorisierte Lampen schalten, dimmen und färben. Serverseitige Prüfung, dauerhafter Wiederholungsschutz und tatsächliche Zustandsrückmeldung bleiben erhalten.
- Auf Felix’ Wunsch ausdrücklich markierte Demo-Messdaten, alte Mitteilungen und einen modelllosen Platzhalter samt separat bestätigtem KI-Chat bereinigt; echte Modelle erhalten. Geschützte Sicherung vorher erstellt.
- 107 Backend-Tests, fünf Viewer-Tests, Web-Build und signierter iPhone-Build bestanden. App auf Felix’ iPhone installiert; Server veröffentlicht und lesend geprüft. Vollständige reale Sprachvorführung noch gemeinsam erproben.

[Pull Request #89](../../pull/89) · [Dokumentation](docs/app-echte-daten-lampenassistent.md)

### Web-Viewer laden · PR #88

- Leserechte der ausgelieferten statischen nginx-Dateien beim Image-Bau vereinheitlicht; 403-Fehler beim Laden des Viewers behoben.

[Pull Request #88](../../pull/88)

### Geräte, IFC-Räume, RGB und Karten · PR #87

- Echte private Lampen nachträglich Gebäuden und vorhandenen IFC-Räumen zuordnen.
- RGB/Helligkeit prüfen und bestätigte Lampenfarben vereinfacht im Raum anzeigen; keine physikalische Lichtsimulation.
- Schatten im mobilen Viewer; Modellstandort, Ausrichtung und Maßstab manuell wählbar.
- OSM-Straßen, Nachbargebäude und Grünflächen ausdrücklich laden und in BIM-Optik darstellen. Quellenangabe und begrenzte Abfragen; keine automatisch behauptete Georeferenzierung.

[Pull Request #87](../../pull/87) · [Dokumentation](docs/geraete-raeume-rgb-karten.md)

### Erste echte Home-Assistant-Lampe · PR #86

- Private, kontogeschützte Lampenanbindung mit fester Freigabeliste, Zustandsprüfung und begrenzten Aufträgen.
- Später um drei Wintergarten-Deckenleuchten und deren IFC-Raumzuordnung ergänzt. Private Demonstration, keine D21-Gebäudeautomation.

[Pull Request #86](../../pull/86) · [Technischer Erststand](docs/homeassistant-lampen-demo.md)

### Kontoweite KI und Live-Sprache · PR #85

- KI-Freigabe einmal pro Konto auf dem Server speichern.
- ElevenLabs-Livegespräche mit direkter Antwort, Unterbrechen, Wellenanimation und begrenzter Gesprächsdauer.
- Mikrofon beim Verlassen/Hintergrundwechsel beenden. Damals bestätigte Geräte-Simulationen; echte Lampensteuerung später in #89 ergänzt.

[Pull Request #85](../../pull/85) · [Technischer Erststand](docs/iphone-live-sprachassistent.md)

## 3./4. November 2026 · Ausbau von App und Website

- **#83:** Aufnahme-/Wiedergabeabläufe beim Ansichtswechsel abgesichert. [PR](../../pull/83)
- **#82:** Gebäudekarten, eigene Chatnachrichten löschen und erste ElevenLabs-Funktionen. [PR](../../pull/82)
- **#81:** iPhone-Dashboard, Sensorik, Energie, lokale Demo, CSV-Messwertimport und abgegrenzte Gemini-Auswertung. Demo-Zugänge später durch #89 vereinfacht. [PR](../../pull/81)
- **#79:** Web-BIM-Oberfläche mit Geschossen, Beschriftungen und Beispielcampus. Der Beispielcampus ist kein D21-Modell. [PR](../../pull/79)
- **#78/#77:** Ladeabläufe und geführte Geräteanlage; damalige Simulationen und vorgemerkte Anbindungen nicht mit echter Hardware verwechseln. Navigation später durch #89 ersetzt. [PR #78](../../pull/78) · [PR #77](../../pull/77)
- **#76/#75:** geschütztes Server-Verwaltungsportal, Kapazitäts-/Nutzungsübersicht und Zugriffsschutz. [PR #76](../../pull/76) · [PR #75](../../pull/75)
- **#69/#68/#66:** Vincents Projektseite unter `/projekt/`, Teamvorstellung und README-Einstieg. [PR #69](../../pull/69) · [PR #68](../../pull/68) · [PR #66](../../pull/66)
- **#67/#65:** aktualisierter Base44-Export und Portierung des Web-Gebäudeassistenten. Ein Export oder Merge allein belegt keinen vollständigen Produktivtest. [PR #67](../../pull/67) · [PR #65](../../pull/65)

[Arbeitsberichte](docs/protokolle/README.md)

## 2. November 2026

- Gemeinsame Modellzustände und privater KI-Chat; bestätigbare IFC-Modellbefehle und Gemini-Gebäudeassistent. [PR #61](../../pull/61) · [PR #60](../../pull/60) · [PR #59](../../pull/59) · [PR #58](../../pull/58)
- Kontakte, Gebäudefreigaben, Mitteilungen und Gebäudechat. [PR #57](../../pull/57)
- Private Projektdateien mit RVT/IFC und sechs PDF-Plänen im separaten Datei-Repository bereitgestellt; keine automatische App-Übernahme. [Privater Download](https://github.com/felixdoering05-prog/D21-Projektdateien/releases/latest)
- n8n für lesende GitHub-/Erreichbarkeitsprotokolle; WhatsApp-Bot als vorbereiteter Prototyp, nicht als fertiger Nachrichtendienst. [n8n](docs/protokolle/2026-11-02-n8n-automatisierungen.md) · [WhatsApp-Prototyp](docs/protokolle/2026-11-02-whatsapp-bot-prototyp.md)
- Benjamins Gaming-PC entfällt; Uni-/Cloud-Rechner bleibt offen. h_da-Netzzugang und mögliche Claude-Zugänge nicht als produktiv abgeschlossen darstellen.

## 30. Oktober 2026

- Web-BIM-Viewer mit Zugriff auf dieselbe Modellbibliothek wie die iPhone-App. [PR #47](../../pull/47) · [Arbeitsbericht](docs/protokolle/2026-10-30-web-bim-viewer.md)

## 29. Oktober 2026

- Lokaler unvollständiger Revit-EG-Arbeitsstand: 50 Wände, 28 Räume; offene Flächenabweichungen und fehlende Räume dokumentiert. Keine fachliche Modellabnahme. [PR #44](../../pull/44) · [Arbeitsnachweis](docs/revit-planrekonstruktion.md)
- IFC-Bauteilinteraktion und erstes simuliertes Raumlicht. [PR #42](../../pull/42) · [Arbeitsbericht](docs/protokolle/2026-10-29-ifc-interaktion-smart-home.md)
- Rückmeldung zu Claude-Zugängen und möglicher Campus-Heatmap dokumentiert; damalige Planung nicht mit eingerichteten Zugängen verwechseln. [Projektstandsbericht](docs/protokolle/2026-10-29-projektstand-claude-heatmap.md)

## 28. Oktober 2026

- IFC-Viewer und Modellbibliothek mit Suche, Ladezuständen und Wiederholung. [PR #39](../../pull/39) · [Arbeitsbericht](docs/protokolle/2026-10-28-ifc-modellbibliothek.md)
- Geführte Gebäudeanlage, Dokumentverwaltung, Startbildschirm und App-Symbol. [Gebäudemappe](docs/protokolle/2026-10-28-gebaeudemappe.md) · [Startbildschirm](docs/protokolle/2026-10-28-entwicklung-startbildschirm.md) · [App-Symbol](docs/protokolle/2026-10-28-app-symbol.md)
- Passwort-Rücksetzung technisch vorbereitet; Projekt-Absenderkonto fehlt weiterhin. [Arbeitsbericht](docs/protokolle/2026-10-28-passwort-mail.md)

## 27. Oktober 2026

- GitHub als zentrale Codequelle, Server-Klon und Deployment-Weg dokumentiert. [Technischer Arbeitsbericht](docs/protokoll-2026-10-27.md)

## Neue Änderungen dokumentieren

Neue Einträge oben unter dem aktuellen Datum ergänzen: **Was hat sich geändert? Welcher Pull Request gehört dazu? Was wurde tatsächlich geprüft, was bleibt offen?** App-Version nur bei nachgewiesenem Build/Installation nennen. Keine Zugangsdaten oder privaten Kontaktinformationen aufnehmen. Teamtermine separat im [Protokollverzeichnis](docs/protokolle/README.md) erfassen.
