# Raum-Popups und Sensoren im Web-BIM-Viewer · 17. November 2026

Technischer Arbeitsnachweis, kein Teamtermin und keine fachliche Abnahme. Beauftragt von Benjamin, umgesetzt mit Claude. Anwendungsstand nach dem letzten Deployment: `04d66cf` ([#212](../../pull/212)).

## Ausgangslage

Im Web-BIM-Viewer sollten die Sensorwerte, insbesondere die bereits vorhandenen Schlafzimmerwerte, als schwebendes Popup in der Mitte des Raums erscheinen. Die Prüfung auf GitHub ergab: [#188](../../pull/188) („ESP32 + BME280 … Popups im Web-3D-Viewer“) war gemergt worden, **bevor** der Web-Teil auf den Branch gepusht war. `main` enthielt den Server-Endpunkt `GET /documents/:id/sensor-overlay` und das iPhone-Popup, aber keine Popups im Web-Viewer.

## Umgesetzt und veröffentlicht

| PR | Inhalt | Gemergt / deployt (MEZ) |
| :--- | :--- | :--- |
| [#205](../../pull/205) | Web-Teil von #188 nachgeliefert: Die Seite lädt die Sensorwerte angemeldet alle 30 s und übergibt sie per ursprungsgeprüftem `postMessage`; der Viewer zeigt ein schwebendes Popup über der Raummitte (Temperatur, Luftfeuchte, Messzeit, „live“/„alt“/„Demo“). Statt der ursprünglichen 3D-Sprites HTML-Popups: Die Sprites hätten beim Geschosswechsel einen Fehler ausgelöst und wären vom Geschossschnitt abgeschnitten worden. Popups folgen Geschossschnitt und abgesetztem Geschoss. Zusätzlich liefert das Overlay Sensoren, die über „Sensor einem Raum zuordnen“ einem Raum mit IFC-GlobalId zugeordnet sind. | 11:02 |
| [#207](../../pull/207) | Benjamin sah die Popups nicht, Felix schon: Safari hielt den alten Viewer im Cache, weil `viewer.js` keinen Hash-Namen und keine Cache-Vorgabe hat. `nginx.conf` liefert `/ifc-viewer/` und `index.html` jetzt mit `Cache-Control: no-cache` (ETag-Prüfung) aus. | 11:11 |
| [#208](../../pull/208) | Raumnamen per Doppelklick im Popup ändern (Enter speichert, Esc bricht ab, Fehler setzen zurück). Neuer Endpunkt `PUT /documents/:id/rooms/:space/name`; gespeichert am Raum-Datensatz mit der IFC-GlobalId, die IFC-Datei bleibt unverändert. | 11:23 |
| [#209](../../pull/209) | Ein Popup für **jeden** Raum, sichtbar erst beim Klick in den Raum (Raumvolumen oder Boden im Geschossschnitt). Klick daneben, erneut oder × schließt. Räume ohne Sensor zeigen „Keine Sensordaten für diesen Raum“. Wände, Fenster usw. bleiben als Bauteil auswählbar. Overlay liefert `room_names` für umbenannte Räume. | 11:35 |
| [#212](../../pull/212) | Neu hinterlegte Sensoren werden beim Öffnen des Modells und danach minütlich automatisch dem IFC-Raum zugeordnet, wenn Raumname oder Raumnummer eindeutig passen. Sonst fragt die Karte „Neue Sensoren zuordnen“ über dem Viewer nach (Sensor ohne Gebäude, ohne Raum, Raum nicht oder mehrfach im Modell); „Nicht in diesem Modell“ wird gemerkt. Neue Endpunkte `POST /documents/:id/sensor-placement/sync` und `PUT /documents/:id/sensor-placement/:sensor`, neue Tabelle `app_sensor_placement_skips` (nur `CREATE TABLE IF NOT EXISTS`). | 15:19 |

Rechte: Lesen und Zuordnen für Eigentümer und angenommene Gebäudemitglieder, wie bei der bestehenden Sensor-Raumzuordnung; Sensoren ohne Gebäude sieht nur der Eigentümer. Der Viewer erhält keinen Sitzungsschlüssel. Die iPhone-App wurde nicht verändert.

## Prüfungen

- Jeder PR: GitHub-Prüfungen Backend (Node, Python), Home Assistant, IFC-Viewer und iOS-Simulator-Build erfolgreich.
- Lokal vor jedem PR: Backend-Tests (zuletzt 232, davon 230 bestanden und 2 übersprungen), Viewer-Tests, ESLint und Website-Build. Neue Tests decken Rechte, Eingabeprüfung, Umbenennen, `room_names`, automatische Zuordnung, Nachfrage, Überspringen und die Anzeige im Overlay ab. Ein einzelner Gesamtlauf bei #212 hatte einen nicht reproduzierbaren Fehlschlag; drei weitere Gesamtläufe und fünf Wiederholungen der neuen Tests waren fehlerfrei.
- Browser: lokal erzeugte Test-IFC mit drei Geschossen und Räumen; bei #212 zusätzlich lokale Account-API mit In-Memory-Datenbank und Testdaten. Geprüft wurden Popup-Lage, Geschossschnitt, abgesetztes Geschoss, Klick in Räume mit und ohne Sensor, Bauteilauswahl an der Fassade, Umbenennen inklusive Fehlerfall und Esc, automatische Zuordnung sowie Nachfrage und Zuordnen mit anschließender Anzeige im Popup.
- Betrieb: vor jedem Deployment Datenbanksicherung auf dem Server, geprüft mit `pg_restore --list`. Veröffentlichung ausschließlich über `d21-deploy`; Datenbankcontainer und Volume unverändert. Nach jedem Deployment: Website erreichbar, neue Endpunkte ohne Anmeldung mit 401 abgewiesen, neuer Viewer ausgeliefert, keine API-Fehler im Log.

## Noch offen

| Thema | Stand |
| :--- | :--- |
| Echtes Modell und echte Sensoren | Nicht mit „Zuhause · Grundriss_Hochparterre.ifc“ und den Produktivdaten im Browser geprüft. Felix hat die Popups aus #205 auf seinem Rechner gesehen. |
| D21-Campusmodell | Keine Raum-Popups. D21 wird separat und schreibgeschützt geladen und ist nicht Teil der Gebäudemappe; eine Anbindung über `D21_CAMPUS_BUILDING_ID` wäre ein eigener PR. |
| Gesamtansicht ohne Schnitt | Das Dach verdeckt die Räume; Räume werden nach Auswahl eines Geschosses angeklickt. |
| Automatische Zuordnung | Nur bei eindeutiger Namens- oder Nummerngleichheit. Zuordnungen lassen sich im Viewer noch nicht wieder lösen; Korrektur derzeit über die bestehende Sensor-Raumzuordnung. |
| iPhone-App | Unverändert; zeigt weiterhin ihr eigenes Popup aus #188. Doppelklick-Umbenennen und Klick-Popups gibt es nur im Web. |
