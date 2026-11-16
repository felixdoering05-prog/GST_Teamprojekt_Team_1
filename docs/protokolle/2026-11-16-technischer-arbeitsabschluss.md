# Technischer Arbeitsabschluss · 16. November 2026

Technischer Arbeitsnachweis, kein Teamtermin und keine fachliche Abnahme. Stand der Zusammenführung: [#194](../../pull/194), Anwendungsstand `01b8576`. Spätere Dokumentationsänderungen erfordern keine erneute Veröffentlichung der Anwendung.

## Veröffentlicht und geprüft

| Bereich | Stand / Nachweis |
| :--- | :--- |
| Dashboard | [titanfs.de](https://titanfs.de), gültiges HTTPS für Hauptdomain und www. Nur persönliche Account-Anmeldung; kein vorgeschalteter Basic-Auth-Dialog. [#193](../../pull/193). |
| Landingpage | [kitrifftgebäude.de](https://kitrifftgebäude.de) bleibt getrennt. Der Dashboard-Link führt zu titanfs.de. API-Routen liefern dort weiterhin 404. |
| Anmeldung und Rechte | Browser öffnet `/login`. Anonyme Anfragen auf Account, Gebäude, Dokumente und Administration werden mit 401 ohne Browser-Challenge abgewiesen. Admin-Freigaben und Gebäudemitgliedschaften bleiben erhalten. |
| Sensorik | ESP32-Testwerte und gemeinsame Raumzuordnung sind veröffentlicht ([#180](../../pull/180), [#187](../../pull/187)). Die BME280-/IFC-Raum-Schnittstelle ist gemergt ([#188](../../pull/188)); das ist kein Beleg für einen getesteten realen D21-Sensor. |
| Planentwürfe | Fotos/Scans, Vektorvermessung und Korrektur-Editor ([#185](../../pull/185)); Wiederholung bei vorübergehender Gemini-Überlastung ([#190](../../pull/190)); Planrahmen-Korrektur ([#191](../../pull/191)); Fortschritt und Ebenenwahl ([#194](../../pull/194)). |
| Betrieb | Datenbank vor Veröffentlichung gesichert, Sicherung mit `pg_restore --list` geprüft. Bestehender Datenbankcontainer erhalten. Veröffentlichung ausschließlich über `d21-deploy`. Server-Gesundheitsprüfung erfolgreich. |

Die Domain-Einrichtung wurde mit zwölf Tests und einer isolierten Prüfung der vollständigen Konfiguration durch den produktiven nginx geprüft. Die GitHub-Prüfungen **Backend und iOS** sind sowohl für #193 als auch für den App-Stand #194 erfolgreich. Ein CI-Build ist kein Nachweis für eine Installation oder einen Praxistest auf einem echten iPhone.

## App-Version und Installation

- Aktueller Quellstand: **1.0.139 (139)**. GitHub-Merge und Server-Deployment installieren keine native App.
- Der lokale Simulator-Build von 1.0.138 war erfolgreich. Für 1.0.139 sind die GitHub-Prüfungen Backend und iOS erfolgreich; ein Gerätetest des aktuellen Gesamtstands steht weiterhin aus.
- Die direkte Installation war zuletzt blockiert: Das iPhone ist im Hochschul-Developer-Team nicht registriert, und der verwendete Account darf keine Geräte registrieren. Ein Hochschul-Admin muss die Registrierung bzw. Berechtigung klären. Keine Gerätekennungen oder privaten Signierungsdaten in diesem Dokument.
- Keine erfolgreiche Veröffentlichung von 1.0.139 in TestFlight nachgewiesen. Bestehende ältere Builds davon getrennt betrachten.
- Die App behält ihren bisherigen verwalteten HTTPS-Zugang. Gespeicherte App-Sitzungen und Gerätebrücken wurden durch titanfs.de nicht automatisch migriert.

## Noch offen

| Thema | Nächster Schritt / Zuständigkeit |
| :--- | :--- |
| [#186](../../pull/186), Emirs 3D-Raumansicht | Technischer Review und Zusammenspiel mit aktuellem IFC-/Sensor-Raumbezug. Nicht ungeprüft zusammenführen. |
| [#192](../../pull/192), Ideenradar KW 47 | Dokumentationsreview; Vorschläge priorisieren, nicht als implementierte Funktionen darstellen. |
| iPhone 1.0.139 | Hochschul-Geräteregistrierung klären, aktuellen Gesamtstand bauen und praktisch testen. |
| Planentwürfe | Referenzpläne, Maßstab, Ebenen und Korrekturablauf gegenprüfen. Die Prozentanzeige ist animiert/geschätzt und kein belastbarer Fertigstellungsgrad. |
| ESP32/BME280 | Echte Hardware, WLAN-Wiederverbindung, Stromausfall und 24-Stunden-Betrieb prüfen; Räume und Datenquelle nachvollziehbar dokumentieren. [#189](../../issues/189). |
| Echte D21-Daten | Benjamin/Emir: Freigabe und ersten echten D21-Datenpunkt nachweisen ([#74](../../issues/74), [#102](../../issues/102)). Private Testhardware ersetzt diesen Nachweis nicht. |
| Hochschule und Datenschutz | Josef: Infrastruktur/KI ([#101](../../issues/101)); Lukas: Datenschutz ([#105](../../issues/105)); Felix: Kooperation und Weiternutzung ([#103](../../issues/103), [#104](../../issues/104)). |
| Teamprotokoll | Entwurf vom 10.11. durch tatsächlich Beteiligte gegenprüfen; keine Freigabe aus Entwicklungsarbeiten ableiten. |

## GitHub-Pflege

Die früher in der README als offen genannten PRs #153, #163, #167, #168, #169, #171 und #173 sind inzwischen gemergt. Historische Arbeitsberichte bleiben erhalten. Offene fachliche Aufgaben werden nicht allein wegen vorhandenen Codes geschlossen. Dieser Abschluss ändert keine Zugriffsrechte, Kontolimits oder Zugangsdaten.

[Projektübersicht](../../README.md) · [Änderungsverlauf](../../CHANGELOG.md) · [Serverbetrieb](../../dashboard/README.md) · [iPhone-App](../../ios/README.md)
