# Echter ESP32-S3 mit simulierten Raumklimadaten

Historische Referenz: https://github.com/felixdoering05-prog/team1 , Juni/Juli 2026. Dort ESP32-S3 mit ST7789, GNSS und BMP280. Am Mac ausgelesenes Board: ESP32-S3, 4 MB Flash, 2 MB PSRAM. Diese Simulation benötigt keine Sensorhardware und verändert keine Display-Pins.

Alle 60 Sekunden werden synthetische Temperatur, relative Feuchte und CO₂ über WLAN/HTTPS gesendet. Diese sind **keine echten Messungen**. Der Server erzwingt `source=demo`; die Demo-/Simulationsansicht der App verwenden. Kein Raumtemperatur-Nachweis und keine realen Warnungen ableiten.

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
