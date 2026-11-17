# Echter ESP32-S3 mit simulierten Raumklimadaten

## Anzeige auf dem iPhone

Ab Version 1.0.136 erscheinen bereits eingerichtete ESP32 automatisch im normalen Dashboard des zugeordneten Gebäudes sowie unter **Sensorik**. Die Karte zeigt Werte und Verlauf, aktualisiert sich im Vordergrund alle 30 Sekunden und kennzeichnet fehlende Aktualität nach drei Minuten. **CSV-Sensor anlegen** ist dafür nicht nötig.

Die Übertragung kommt vom echten Board; die Zahlen bleiben als simulierte Testwerte gekennzeichnet. Dafür liest die App `/api/v1/buildings/:id/telemetry/esp32` (verwalteter Zugang: `/app-api/v1/...`). Diese lesende, kontogeschützte Schnittstelle liefert nur Sensoren registrierter, nicht gesperrter Geräte des Gebäudes. Normale Demo-Daten werden nicht eingeblendet, echte Messwerte nicht umklassifiziert, Widgets und KI-Auswertungen nicht automatisch mit Testwerten versorgt.

### USB-Upload am Mac

Der lokale Installer verwendet esptool 5.6.0 (Pfad mit `--esptool` anpassbar) und die Partitionierungsdatei des Arduino-ESP32-Core 3.3.12 (`--boot-app0`). Nach einer USB-Unterbrechung beim automatischen Reset verbindet er erneut ohne Reset. Er meldet eine erfolgreiche Installation erst, nachdem die vollständige Anwendung auf dem Board mit der gerade gebauten Binärdatei verglichen wurde. Die Bestätigung auf dem Board ersetzt nicht die anschließende Prüfung, ob tatsächlich Werte am Server eintreffen.

Die Wiederverbindung und Fehlerfälle lassen sich ohne angeschlossenes Gerät prüfen: `python3 -m unittest discover -s sensorik/esp32-simulation -p 'test_*.py' -v`.

Bleibt das Board trotz verifizierter Firmware im Programmiermodus, RESET/EN kurz drücken oder USB ohne gedrückte BOOT-Taste neu verbinden. Ein angeforderter automatischer Neustart ist noch kein Nachweis, dass die Anwendung gestartet ist.

Historische Referenz: https://github.com/felixdoering05-prog/team1 , Juni/Juli 2026. Dort ESP32-S3 mit ST7789, GNSS und BMP280. Am Mac ausgelesenes Board: ESP32-S3, 4 MB Flash, 2 MB PSRAM. Diese Simulation benötigt keine Sensorhardware und verändert keine Display-Pins.

Alle 60 Sekunden werden synthetische Temperatur, relative Feuchte und CO₂ über WLAN/HTTPS gesendet. Diese sind **keine echten Messungen**. Der Server erzwingt `source=demo`; Ab iOS 1.0.136 erscheinen aktive ESP32 automatisch im normalen Gebäude-Dashboard und unter Sensorik, ausdrücklich als simulierte Testwerte gekennzeichnet. Der Vorstellungsmodus ist dafür nicht nötig. Kein Raumtemperatur-Nachweis und keine realen Warnungen ableiten.

## Gerätezugang

- Eigentümer: POST `/api/v1/buildings/:id/sensor-devices`, Kontositzung, `{room:"Arbeitszimmer"}`. Erzeugt einen ausdrücklich als Demo gekennzeichneten Raum und drei Sensoren im eigenen Gebäude sowie einen nur einmal angezeigten Geräteschlüssel. Keine bestehende echte Raumstruktur wird überschrieben.
- ESP32: POST `/app-api/v1/sensor-input` am verwalteten öffentlichen Server, `X-D21-Device`. Nur `request_key`, `temperature`, `humidity`, `co2` erlaubt. Gebäudewahl und Datenquelle sind nicht im Gerät änderbar. Serverzeit dient als Zeitstempel.
- Widerruf: DELETE `/api/v1/sensor-devices/:id`, Eigentümersitzung.
- Höchstens ein Paket pro 55 Sekunden; Wiederholung desselben letzten Pakets idempotent. Wertebereiche: −40…85 °C, 0…100 %, 250…10000 ppm. Schlüssel nur gehasht gespeichert. Maximal 20 Geräte pro Konto. Bestehendes Konto-Speicherlimit gilt weiterhin. Keine automatische Datenlöschung.

## Lokale Einrichtung

Vor dem Überschreiben die Originalfirmware sichern. Bestehende Flash-Sicherung kann WLAN-/Anmeldedaten enthalten: nur privat, niemals GitHub.

Eine geschützte JSON-Datei außerhalb des Repositories benötigt `token` und `input_url`. Dann interaktiv am Mac ausführen:

```
python3 sensorik/esp32-simulation/setup-local.py --device-file /privater/pfad/esp32.json
```

Das Skript fragt WLAN-Name und Passwort nur lokal ab. Es verwendet eine erfolgreich per Hostname und Vertrauenskette geprüfte TLS-Root-CA. Fehlende Zertifikatsprüfung wird nicht durch `setInsecure()` umgangen. Python benötigt `get_verified_chain` über die interne SSL-Schnittstelle; falls nicht verfügbar, Einrichtung abbrechen und anpassen. Keine Passwörter/Keys ins Chatfenster oder öffentliche Online-Simulatoren eintragen.

Offizielle Arduino-CLI und Espressif-Arduino-Core werden vorab benötigt. Test-FQBN: `esp32:esp32:esp32s3:FlashSize=4M,PSRAM=disabled,USBMode=hwcdc,CDCOnBoot=cdc`. Der lokale Helfer nutzt standardmäßig die temporär installierte CLI unter `/tmp/d21-arduino`. Skript und Firmware sind getrennt von der alten GNSS-Firmware. Nach Wechsel der temporären Serveradresse muss die lokale Konfiguration neu erzeugt werden.

`secrets.example.h` ist nur eine Vorlage, keine funktionierende Konfiguration. WLAN/Token bleiben in privaten temporären Builddateien, die anschließend entfernt werden. Bei hartem Rechnerabbruch diese Verzeichnisse ebenfalls privat löschen.

## Verifizierter Stand

Firmware-Testbuild mit Arduino-CLI 1.6.0 und Arduino-ESP32 3.3.12 erfolgreich: rund 1,01 MB Programm, 46,8 KB statische Variablen. Testbuild verwendet ausschließlich Platzhalterdaten und wurde nicht aufgespielt. Backend: 183 Tests erfolgreich, ein optionaler Test übersprungen. Echter WLAN-Endtest steht bis zur lokalen Eingabe der WLAN-Daten aus.

## Echter BME280 und Zuordnung zu einem IFC-Raum

Ein bereits angemeldetes Gerät wird vom Eigentümer mit `PUT /api/v1/sensor-devices/:id` und `{hardware:"bme280", document_id, space_id, revision}` auf echte Messwerte umgestellt und einem IfcSpace (Express-ID aus `GET /documents/:id/model-rooms`) zugeordnet. Danach erwartet `/sensor-input` genau `request_key`, `temperature` und `humidity` und speichert sie als `source=real` im zugehörigen Raum. Die aktuelle Revision liefert `GET /api/v1/buildings/:id/sensor-devices`. Für den klassischen ESP32 (nicht S3) gilt FQBN `esp32:esp32:esp32`, Bootloader an `0x1000`; BME280 per I²C an SDA 21/SCL 22, Adresse `0x76`.

Der Web-3D-Viewer (Dashboard-Widget „BIM-Modell“, BIM-Viewer) holt `GET /api/v1/documents/:id/sensor-overlay` alle 30 Sekunden und zeigt die Werte als Popup über dem Raum.
