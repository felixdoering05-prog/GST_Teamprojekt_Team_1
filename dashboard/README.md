# D21 · Website, API und Serverbetrieb

[← Projektübersicht](../README.md) · [Neueste Änderungen](../CHANGELOG.md)

**Stand: 16.11.2026.** Die ursprüngliche Starter-Oberfläche wurde durch die aus Base44 übernommene React-/Vite-Oberfläche unter [`base44-frontend/`](base44-frontend/) ergänzt. Produktiver Einstieg und neue Funktionsübersicht stehen in der [Haupt-README](../README.md).

## Aktueller Umfang

- nginx liefert die Weboberfläche aus; Node/Express unter [`backend/`](backend/) stellt die gemeinsame API für Web und iPhone bereit.
- PostgreSQL 16 speichert Konten, Gebäudedaten, Profilbilder und Dokumente einschließlich IFC-Dateien sowie Freigaben und gemeinsame Modellzustände.
- Persönliche Anmeldung, Gebäudefreigaben, Dokumentverwaltung, BIM-Viewer und Gebäudeassistent sind integriert. IFC-Geometrie wird im Browser/iPhone berechnet, nicht auf dem VPS.
- Gemini und ElevenLabs werden mit serverseitigen Schlüsseln und kontobezogenen Freigaben angebunden. Private Lampensteuerung bleibt auf ausdrücklich freigegebene Home-Assistant-Geräte begrenzt.
- Vincents Projektseite unter `/projekt/`, geschützte Administration unter `/verwaltung` und private n8n-Ausführungsprotokolle.

## Produktivbetrieb

GitHub ist die einzige Codequelle: **eigener Branch → Pull Request → Review → main**. Keine Anwendungscode-Änderungen auf dem Server und keine direkten Pushes auf main.

Aktiver Serverpfad: `/opt/gst/dashboard`. Veröffentlichung ausschließlich mit dem eingerichteten Befehl:

```bash
ssh root@185.56.151.249 d21-deploy
```

`/opt/d21` ist veraltet. Compose-Projektname `d21`, bestehendes Datenbank-Volume `d21_dbdata`. Niemals den Datenbank-Container oder das Volume löschen; niemals `docker-compose down -v` ausführen. Das Deployment-Skript berücksichtigt die ältere Compose-Version und ersetzt ausschließlich die App-Container. Port 8088 bleibt an `127.0.0.1` gebunden; Zugriff von außen über `https://titanfs.de` mit dem bestehenden Anmeldeschutz; der separate Cloudflare-Tunnel `d21-tunnel` bleibt als bisheriger App-Zugang erhalten. Die öffentliche Landingpage liegt getrennt auf `https://kitrifftgebäude.de`.

Die aktive `.env` und weitere Geheimnisse liegen ausschließlich geschützt auf dem Server. `.env`, `access-password`, `tunnel-url`, API-Tokens und private Schlüssel niemals committen. Ein iPhone-Update wird separat gebaut und installiert.

## Dashboard-Domain

`dashboard/ops/configure-dashboard-domain.py` richtet ausschließlich `titanfs.de` ein. Es leitet auf das bestehende geschützte Gateway unter `127.0.0.1:8089` weiter, einschließlich dessen API-Regeln; der ungeschützte Webcontainer wird nicht direkt veröffentlicht. Upload-Limit 26 MB, Antwortzeit bis 125 Sekunden. Der bisherige iPhone-Zugang bleibt gültig.

Voraussetzung: A-Eintrag ausschließlich `185.56.151.249`, kein abweichender AAAA-Eintrag. `www` wird nur bei passendem DNS in das Zertifikat aufgenommen und anschließend auf `titanfs.de` umgeleitet. Nach geprüftem PR, Datenbanksicherung und `d21-deploy`:

```bash
python3 /opt/gst/dashboard/ops/configure-dashboard-domain.py
python3 /opt/gst/dashboard/ops/configure-dashboard-domain.py --apply
```

Das Skript prüft nginx vor dem Neuladen, richtet Let’s Encrypt samt Erneuerung ein und stellt die vorherige Domain-Konfiguration bei Fehlern wieder her. `kitrifftgebäude.de` bleibt unabhängig davon die öffentliche Landingpage. Keine automatischen Änderungen an gespeicherten App-Zugängen.

## Lokale Entwicklung

Voraussetzung: Docker Engine und eine geeignete Docker-Compose-Installation. Lokale `.env` aus dem Beispiel erstellen und eigene Entwicklungswerte setzen; keine Produktivschlüssel übernehmen:

```bash
cp .env.example .env
docker compose up --build -d
```

Lokaler Einstieg: `http://localhost:8088`. Die Beispielkonfiguration auf notwendige lokale Zugangsschutz-/Dienst-Einstellungen prüfen. Nicht durch Öffnen der Portbindung den produktiven Zugriffsschutz umgehen. Diese Anleitung ersetzt keine Einrichtung von Anbieter- oder Gerätezugängen.

Backend-Prüfung und Frontend-Build nach Installation der jeweiligen Abhängigkeiten:

```bash
npm --prefix backend test
npm --prefix base44-frontend run build
```

## Weiterführend

[Base44-Übernahme](../docs/base44-serveranbindung.md) · [Konten-API](../docs/konten-api.md) · [Dokumente](../docs/dateien.md) · [Web-BIM](../docs/web-bim-viewer.md) · [Aktueller Lampenassistent](../docs/app-echte-daten-lampenassistent.md) · [Verwaltung](../docs/serververwaltung.md) · [n8n](n8n/README.md)
