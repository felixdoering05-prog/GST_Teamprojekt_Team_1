# Private Home-Assistant-Lampendemo

Stand: 04.11.2026. Erste echte Geräteanbindung für die iPhone-App.

Im Reiter **Geräte** erscheint eine Home-Assistant-Sektion. Sichtbar sind ausschließlich serverseitig explizit freigegebene Lampen des angemeldeten Kontos. Ein-/Ausschalten fragt den Zustand bei Home Assistant ab und zeigt ihn erst nach Rückmeldung als bestätigt an. Bei `unknown`, `unavailable` oder Netzwerkfehler wird kein ausgeschalteter Zustand erfunden; die Schaltfläche ist gesperrt beziehungsweise die unklare Ausführung wird erklärt.

Die private Demo ist unabhängig von Projektgebäuden, Teamfreigaben und IFC-Räumen. Gebäude-Mitglieder und andere Projektadministratoren erhalten dadurch keinen Zugriff. Der Sprachassistent bleibt auf seine bisherigen Simulationen begrenzt; private Lampennamen und Zustände werden nicht an KI-Anbieter übermittelt. Helligkeit, Farben und Szenen sind noch nicht enthalten.

## Schnittstelle und Ausführung

- `GET /api/v1/integrations/home-assistant/lights`: eigene freigegebene Anzeigenamen, Raumbezeichnung, Verfügbarkeit und bestätigter Ein-/Aus-Zustand. Andere Konten erhalten `configured:false` ohne Lampenmetadaten. Keine Entity-IDs, Token oder anderen HA-Attribute im Ergebnis.
- `POST /api/v1/integrations/home-assistant/lights/:key/command`: gewünschter Boolwert `on` und neue UUID in `X-Request-ID`. Kein frei wählbarer Dienst, Entity oder URL.
- Ausschließlich `light.turn_on` und `light.turn_off` für die konfigurierte Entity; feste HTTPS-Basisadresse, keine Redirects, begrenzte Antworten und Zeitlimits. Ein Schreibaufruf, keine automatische Wiederholung.
- Status vor dem Schalten lesen; gleicher Sollzustand wird ohne Schreibaufruf bestätigt. Sonst einmal senden und bis zu dreimal lesend nachprüfen. Unveränderter Zustand ergibt `202 confirmed:false`, keinen Erfolg.
- Additive Tabelle `app_ha_commands`: Konto, freigegebener Lampenschlüssel, UUID, gewünschter Zustand und technischer Status/Zeit. Keine Tokens oder HA-Rohdaten. Reservierung vor Anbieteraufruf; gleiche UUID wird nie erneut ausgeführt, auch nach Timeout nicht. Höchstens 20 angenommene Aufträge pro Konto/Minute und ein laufender Auftrag. Nach unklarer Ausführung zuerst Status neu laden.

## Geschützte Einrichtung

Serververzeichnis `/etc/d21/homeassistant` (root, 0700), darin `access-token` und `config.json` (je 0600). Den Token in Home Assistant unter Profil → Sicherheit → Langlebige Zugriffstoken erstellen und über das lokale private Eingabeskript unsichtbar an den Server übertragen. Weder Token noch private Konfiguration ins Repository schreiben. Die Allowlist begrenzt **unsere API**, nicht die gegebenenfalls weitergehenden Rechte des Tokens in Home Assistant. Für Regelbetrieb einen eigenen geeigneten HA-Benutzer vorsehen.

Konfigurationsbeispiel ohne echte Zugangsdaten oder private Zuordnung:

```json
{"base_url":"https://homeassistant.example.invalid","account_id":123,"lights":[{"key":"demo-light","entity_id":"light.demo","name":"Demolampe","room":"Demoraum"}]}
```

`D21_HOMEASSISTANT_CONFIG_DIR=/etc/d21/homeassistant` in der nur auf dem Server liegenden `.env` setzen. Compose mountet das Verzeichnis schreibgeschützt nach `/run/d21-homeassistant`. Feste Pfade für Konfiguration und Token; `light`-Domain, höchstens fünf Einträge, eindeutige Schlüssel und authentifiziertes Konto werden validiert. Keine Netzwerksuche.

Änderungen über Branch und Pull Request; produktiv nur `d21-deploy`. Datenbank und Volumes bleiben bestehen. Die vorhandene Geräte-Simulationstabelle wird nicht umgedeutet.

## Verifikation

Sieben neue Backendtests prüfen Kontotrennung, feste Ziele/Dienste, Statusbestätigung, UUID-Sperre, Offlinezustand, Timeout ohne Wiederholung, unbestätigte Ausführung und Kontingente. Erreichbarkeit, Anmeldung und Zustand der von Felix benannten Lampe wurden lesend geprüft. Der erste vollständige physische Ein-/Aus-Test erfolgt bewusst über die App; ein erfolgreicher Build ersetzt diesen Test nicht.

Quellen: [REST API](https://contributors.home-assistant.io/core/internals/rest-api/), [Authentifizierung](https://www.home-assistant.io/docs/authentication/), [Tuya-Integration](https://www.home-assistant.io/integrations/tuya/). Smart Life wird in Home Assistant angebunden; die Projekt-App spricht nur mit Home Assistant.
