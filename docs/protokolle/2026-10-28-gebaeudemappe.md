# Entwicklungsprotokoll · 28. Oktober 2026

## Auftrag

Felix hat die Umsetzung des geführten iPhone-Ablaufs bis zur nutzbaren Gebäudemappe
beauftragt: Name, Adresse, Fotos, Pläne und Übersicht; Wiederaufnahme und Dateiaktionen.

## Umsetzung

- Bestehenden Drei-Schritt-Assistenten auf fünf Schritte erweitert.
- Geschützte lokale Zwischenstände und wiederholbare Upload-Warteschlangen ergänzt.
- Gebäudemappe mit getrennten Dateiarten, Suche, Vorschau, Umbenennen und Löschbestätigung.
- Bestehende Server-API um idempotente Gebäude-/Dateianfragen und Dateiaktionen erweitert.
- Website-Dateibereich um Fortschritt, Wiederholung, Vorschau und dieselben Dateiaktionen ergänzt.
- Änderungen isoliert im Branch `feat/ios-building-pass`; keine Codeänderungen auf dem Server.

## Prüfung und Grenzen

27 Backendtests bestanden, Swift-Persistenzprüfung bestanden, Simulator-Build und
Website-Build/ESLint bestanden. Wiederaufnahme nach App-Neustart sowie Foto-/Planablauf,
Umbenennen und PDF-Vorschau mit lokalen Simulator-Beispieldaten geprüft. Website-Dateivorschau,
Umbenennen und Löschbestätigung in separater lokaler Testdatenbank geprüft.

Keine Hintergrundübertragung, keine geräteübergreifende Entwurfssynchronisierung und
kein DWG-Viewer. Serverdaten bleiben die gemeinsame Quelle für bestätigte Uploads.
Detailbeschreibung und Prüfanleitung: [Gebäudemappe](../gebaeudemappe-ios.md).

## KI-Unterstützung

Felix hat den Funktionsumfang im Chat vorgegeben. Codex unterstützte bei Implementierung,
Tests und Dokumentation. Testergebnisse stammen aus den ausgeführten Prüfungen; eine
Prüfung auf einem echten iPhone steht zusätzlich zur Simulatorprüfung noch aus.
