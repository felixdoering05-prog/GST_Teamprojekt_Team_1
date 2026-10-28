# Entwicklungsprotokoll · iOS-Startbildschirm

**Datum:** 28. Oktober 2026  
**Art:** Entwicklungsstand aus der Zusammenarbeit von Felix mit KI-Unterstützung; kein Team-Sitzungsprotokoll.  
**Status:** Umsetzung veröffentlicht; visuelle Abnahme durch Felix offen.

## Anlass und Ziel

Felix wünschte beim Öffnen der vollständig geschlossenen App einen kurzen Bildschirm mit dem bereitgestellten Logo, „GST TEAMPROJEKT“ und einem Hinweis auf die Hochschule Darmstadt.

## Umgesetzt

- Das bereitgestellte transparente PNG wurde unverändert als Projektlogo in den iOS-Asset-Katalog aufgenommen.
- Heller Startbildschirm mit türkisen Akzenten und folgenden Texten:
  - **GST TEAMPROJEKT**
  - **KI trifft Gebäude**
  - **Ein Projekt der Hochschule Darmstadt**
- Anzeigedauer rund **1,8 Sekunden**, danach Übergang in die bestehende App.
- Die normale Anmeldung beziehungsweise Prüfung einer vorhandenen Sitzung beginnt anschließend.
- Der Zustand liegt auf App-Ebene und gilt für den laufenden Prozess. Ein normaler Wechsel aus dem Hintergrund setzt ihn nicht zurück.
- Der Übergang berücksichtigt die Systemeinstellung für reduzierte Bewegung.
- Eine ausschließlich im Debug-Build verfügbare Vorschauoption ermöglicht einen länger sichtbaren Startbildschirm für Layoutprüfungen.

## Betroffene Dateien

- [App-Einstieg und Startansicht](../../ios/KI%20Trifft%20Geb%C3%A4ude%20APP/KI%20Trifft%20Geb%C3%A4ude%20APP/MyApp.swift)
- [Projektlogo im Asset-Katalog](../../ios/KI%20Trifft%20Geb%C3%A4ude%20APP/KI%20Trifft%20Geb%C3%A4ude%20APP/Assets.xcassets/ProjectLogo.imageset/)
- [iOS-Dokumentation](../../ios/README.md)

## Prüfung und Grenzen

| Prüfung | Ergebnis |
| --- | --- |
| Regulär signierter Build mit Xcode 27.1 für den iPhone-18-Pro-Simulator | Erfolgreich |
| Prüfung auf fehlerhafte Leerzeichen im Diff | Ohne Befund |
| Übernahme ins vorhandene lokale Xcode-Projekt | Erfolgt; vorherige App-Startdatei gesichert und persönliche Signierung erhalten |
| Start der normalen Simulator-App nach Beenden des Vorschau-Modus | Startbefehl erfolgreich |
| Visuelle Prüfung im Simulator | Nicht vollständig bestätigt: Das Device-Hub-Fenster blieb zeitweise bei „Connecting display…“ |
| Prüfung auf einem echten iPhone und Abnahme der Gestaltung | Offen |

Das Verhalten „einmal pro App-Prozess“ ist im Code umgesetzt; ein vollständiger visueller Kaltstart-/Hintergrundtest wurde in dieser Sitzung nicht abgeschlossen. Es wurden für diese Änderung keine neuen automatisierten Tests angelegt.

## Veröffentlichung

- Branch: `feat/ios-launch-intro`
- [Pull Request #28](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/28)
- Nach Prüfung nach `main` zusammengeführt.
- Keine Änderungen an Backend, Schnittstellen, Datenbank oder Serverbetrieb.

## Nächste Schritte

- [ ] Felix prüft den Startbildschirm auf seinem iPhone: vollständig schließen, neu öffnen und den automatischen Übergang beobachten.
- [ ] Wechsel in den Hintergrund und zurück prüfen: Der Bildschirm soll nicht erneut erscheinen.
- [ ] Logo, Lesbarkeit, Abstände und Anzeigedauer gemeinsam mit Emir abnehmen.
- [ ] Rückmeldungen gegebenenfalls als kleine Folgeänderung über einen eigenen Branch und Pull Request umsetzen.

## KI-Nachweis

Felix gab Inhalt, Logo und gewünschtes Verhalten vor. Die Implementierung, Build-Prüfung und GitHub-Dokumentation wurden mit Codex erstellt. Die fachliche und gestalterische Abnahme bleibt beim Projektteam.
