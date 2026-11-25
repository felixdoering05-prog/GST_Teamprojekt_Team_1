# RuView-Brücke · WLAN-Präsenz für Nala (experimentell)

ESP32-S3-Knoten mit der [RuView](https://github.com/ruvnet/RuView)-Firmware erkennen über Veränderungen im WLAN-Signal (CSI), ob jemand im Raum ist, wie stark sich etwas bewegt und ungefähr die Atemfrequenz – ohne Kamera. Diese Brücke läuft im Heimnetz (Mac oder Raspberry Pi), empfängt die UDP-Pakete der Knoten und meldet alle 10 Sekunden **nur die Ergebnisse** an Nala. CSI-Rohdaten verlassen das Heimnetz nicht.

Die Werte sind Schätzungen: kein Medizinprodukt, kein Ersatz für Rauch-, Sturz- oder Notrufsysteme. Mit einem einzelnen Knoten sind Anwesenheit und Bewegung brauchbar, die Atemfrequenz ist grob.

## Ablauf

1. **Einschalten:** In Nala unter **Daten & Einstellungen → WLAN-Präsenz (RuView)** den Schalter aktivieren. Standardmäßig aus. Ausgeschaltet nimmt der Server keine Präsenzdaten an (HTTP 403) und die Anzeige verschwindet.
2. **Brücke anlegen:** Unter **Sensorik → WLAN-Präsenz** einen Namen eingeben und **Brücke anlegen**. Der Schlüssel erscheint nur einmal.
3. **Schlüssel speichern** (am Mac, Schlüssel vorher kopieren):
   ```bash
   umask 077 && pbpaste > ~/.nala-ruview-bridge
   ```
4. **ESP32 einrichten:** RuView-Firmware flashen und mit `provision.py --target-ip <IP dieses Rechners> --target-port 5005` ins WLAN bringen. Weitere Knoten bekommen eine eigene `--node-id` (2, 3, …).
5. **Brücke starten** (Node ≥ 18, keine Zusatzpakete):
   ```bash
   node sensorik/ruview-bridge/ruview-bridge.js --token-file ~/.nala-ruview-bridge
   ```
   Probelauf ohne Senden: `--dry-run`. Gleichzeitig die RuView-Terminalansicht nutzen: `--forward 5006` und `npx @ruvnet/ruview esp32 --watch` auf Port 5006 lauschen lassen.
6. In **Sensorik** erscheinen die Knoten. Ein Klick auf **Raum festlegen** gibt ihnen einen Raumnamen.

## Was übertragen wird

Je Knoten alle 10 Sekunden: `node_id`, `presence` (Mehrheit der Vitalpakete im Intervall), `motion` (Mittelwert), `persons`, `breathing_bpm` (Median 4–60/min, nur bei Anwesenheit, sonst `null`), `rssi`, `pps` (CSI-Pakete pro Sekunde).

## Server

- `POST /app-api/v1/ruview-input`, Kopfzeile `X-Ruview-Bridge`, höchstens 8 Knoten, höchstens eine Meldung alle 5 Sekunden.
- `GET /api/v1/buildings/:id/ruview` – aktueller Stand; älter als 60 s = veraltet.
- `GET /api/v1/buildings/:id/ruview/:bridge/nodes/:node/history?hours=1..24` – Verlauf.
- `PUT /api/v1/buildings/:id/ruview/:bridge/nodes/:node` – Raumname.
- `POST/DELETE /api/v1/buildings/:id/ruview-bridges[/:bridge]` – anlegen/sperren (Sperren löscht alle Werte der Brücke).
- Höchstens 3 Brücken pro Gebäude. Schlüssel nur gehasht gespeichert. Verlauf wird nach 24 Stunden gelöscht.

## Tests

```bash
node --test sensorik/ruview-bridge/ruview-bridge.test.js
npm --prefix dashboard/backend test
```
