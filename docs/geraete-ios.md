# Geräte und geführter Gebäudestart

Stand: 03.11.2026. Erste Geräteverwaltung in der nativen iPhone-App.

## Bedienung

- Der neue Hauptreiter **Geräte** zeigt die eigenen und angenommenen geteilten Gebäude. Auch innerhalb eines Gebäudes ist der Bereich erreichbar.
- **Gerät hinzufügen** führt durch drei Schritte: Typ, Name/Raum und Betriebsart, anschließend Bestätigung. Unterstützt werden Licht, Steckdose, Temperatursensor und Tür-/Fensterkontakt.
- **Simulation**: Lampen und Steckdosen lassen sich ein-/ausschalten. Der Zustand wird auf dem Projektserver gespeichert. Sensoren zeigen ausdrücklich keine echten Messwerte.
- **Vorgemerkt**: Ein künftiger Anschluss über Home Assistant, MQTT, Matter oder eine noch offene Schnittstelle kann dokumentiert werden. Kein Netzwerkzugriff, keine Kopplung, keine Zugangsdaten und keine echte Gerätesteuerung.
- Räume sind zunächst freie Bezeichnungen; es gibt keine automatische Verknüpfung mit IFC-Räumen. Die bestehende Raumlichtsimulation im IFC-Viewer ist separat über **Raumlicht im 3D-Modell simulieren** erreichbar.
- Filter nach Raum; Aktualisierung beim Öffnen, per Herunterziehen und etwa alle 30 Sekunden im Vordergrund. Bei Fehlern bleibt der letzte Stand mit Fehlermeldung sichtbar. Es gibt noch keine Hintergrundaktualisierung oder Push-Mitteilung für Geräte.
- Der Gebäudeüberblick zeigt den tatsächlichen Dateistand und passende nächste Schritte: Dateien ergänzen, IFC hochladen, danach Geräte vorbereiten. Metadatenbearbeitung ist eingeklappt. Die Bereichsauswahl ist horizontal scrollbar statt einer gedrängten Segmentauswahl.

## Schnittstelle und Daten

Additive Tabelle `app_devices`, Fremdschlüssel auf `app_buildings`. Keine Änderung bestehender Datei-/Kontentabellen. Angemeldete Eigentümer und angenommene Gebäudemitglieder haben dieselben Rechte; eine offene Einladung genügt nicht.

| Route | Zweck |
| --- | --- |
| `GET /api/v1/buildings/:id/devices` | Geräte des zugänglichen Gebäudes |
| `POST /api/v1/buildings/:id/devices` | Anlage mit `name`, `room`, `kind`, `mode`, `integration`, `request_key` (UUID) |
| `PATCH /api/v1/buildings/:id/devices/:deviceID` | Simulationszustand mit `is_on` und aktueller `revision` |

`kind`: `light`, `plug`, `temperature`, `contact`. `mode`: `simulation`, `planned`. `integration`: `none`, `home-assistant`, `mqtt`, `matter`. Simulation erfordert `integration=none`.

Maximal 100 Geräte pro Gebäude, Name 1–100 und Raum 0–100 Zeichen. Geschlossene Feldauswahl; keine beliebigen URLs, Zugangsdaten oder Netzwerkziele. UUID macht dieselbe Anlage wiederholbar; veränderte Angaben unter derselben UUID werden abgewiesen. Die App sperrt nach dem ersten Speicherversuch die Zusammenfassung und wiederholt dieselbe Anlage, bis ein Ergebnis bestätigt ist oder der Ablauf geschlossen wird. Ein noch nicht gespeicherter Geräteentwurf überlebt keinen App-Neustart; die vorhandenen Datei-/Gebäudeentwürfe bleiben unverändert.

Schaltänderungen brauchen die aktuelle Revision; ein Konflikt liefert 409 und die App lädt neu. Vorgemerkte Geräte und Sensoren sind nicht schaltbar. Es erfolgen keine ausgehenden Gerätebefehle. Sperren prüfen bei Schreibzugriff erneut die Gebäudeberechtigung. Keine ungefragte Übertragung an externe Anbieter.

Es gibt noch kein Umbenennen/Löschen von Geräten, keine Automationsregeln und keine Geräte-Benachrichtigungen. Für den nächsten Ausbau mit Benjamin abstimmen: konkretes Gerät, Bridge/Controller, serverseitige Geheimnisablage, Rechte je Entität, zuverlässiger Ist-Zustand statt bloßem Schaltwunsch und bestätigte IFC-Raumzuordnung. Geräte niemals allein anhand eines frei eingegebenen Raumnamens physisch schalten.

## Entwicklung

Code über Branch/PR; Backend ausschließlich mit `d21-deploy` veröffentlichen. Datenbankcontainer und Volume erhalten. Die iPhone-App muss separat aus dem aktuellen Xcode-Projekt neu gebaut/installiert werden; ein Serverdeployment aktualisiert keine bereits installierte App.

Debug-Simulatorvorschau: `-D21WorkflowPreview -D21DevicesPreview`. Lokale Testgeräte sind ausschließlich Vorschau, keine Netzwerkaufrufe. Release enthält diesen Vorschaupfad nicht.
