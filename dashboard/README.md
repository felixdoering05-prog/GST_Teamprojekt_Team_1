# Nala Solutions · Website, API und Serverbetrieb

[← Projektübersicht](../README.md) · [Neueste Änderungen](../CHANGELOG.md)

**Stand: 16.11.2026.** Die ursprüngliche Starter-Oberfläche wurde durch die aus Base44 übernommene React-/Vite-Oberfläche unter [`base44-frontend/`](base44-frontend/) ergänzt. Produktiver Einstieg und neue Funktionsübersicht stehen in der [Haupt-README](../README.md).

## Aktueller Umfang

- nginx liefert die Weboberfläche aus; Node/Express unter [`backend/`](backend/) stellt die gemeinsame API für Web und iPhone bereit.
- PostgreSQL 16 speichert Konten, Gebäudedaten, Profilbilder und Dokumente einschließlich IFC-Dateien sowie Freigaben und gemeinsame Modellzustände.
- Persönliche Anmeldung, Gebäudefreigaben, Dokumentverwaltung, BIM-Viewer und Gebäudeassistent sind integriert. IFC-Geometrie wird im Browser/iPhone berechnet, nicht auf dem VPS.
- Gemini und ElevenLabs werden mit serverseitigen Schlüsseln und kontobezogenen Freigaben angebunden. Private Lampensteuerung bleibt auf ausdrücklich freigegebene Home-Assistant-Geräte begrenzt.
- Vincents Projektseite unter `/projekt/`, geschützte Administration unter `/verwaltung` und private n8n-Ausführungsprotokolle.

## Gebäude einrichten

Unter **Gebäude → Gebäude anlegen** führt das Dashboard durch **Gebäudedaten → Bilder → Pläne & 3D → Übersicht**. Nur der Name ist erforderlich; Bilder und Unterlagen sind optional. Nach dem ersten Speichern existiert das Gebäude bereits. **Später fortsetzen** behält es und öffnet seine Mappe; **Einrichtung fortsetzen** setzt dort wieder an.

Die Mappe trennt **Übersicht**, **Galerie**, **Pläne & 3D** und **Räume**. Fotos/Scans und Dokumente werden weiterhin über die geschützte Gebäude-API gespeichert und sind auch in der App verfügbar. Mehrfachauswahl und Ablegen unterstützen bis zu 20 Dateien pro Auswahl; 25 MB pro Datei, IFC 20 MB. Fehlgeschlagene Uploads behalten ihre Kennung für einen erneuten Versuch. Nicht bestätigte Dateien werden nicht als gespeichert angezeigt.

Bilder bleiben im geschützten Dokumentenspeicher. Vorschaubilder verwenden kurzlebige lokale Blob-URLs, keine öffentlichen Datei-Links. Die Einrichtung aktiviert keine KI-Verarbeitung; eine bereits freigegebene automatische Plananalyse verarbeitet neue Bilder/PDFs wie bisher. Die Modellgenerierung bleibt beim Eigentümer und erfordert die vorhandene Freigabe.

## Smart Home im Webmodell

Ein eigenes bzw. geteiltes IFC-Modell im **BIM-Viewer** öffnen und **Räume & Geräte** oder **Smart Home** wählen. Ein Raumklick oder die Raumliste öffnet Messwerte und zugeordnete Lampen/Steckdosen. Die Raumliste funktioniert auch bei fehlender Raumgeometrie; ein IFC ohne Raumobjekte benötigt weiterhin ergänzte Raumdaten.

Die Webansicht nutzt die bestehenden kontogeschützten APIs und deren Berechtigungen. Serverseitig verbundene Home-Assistant-Lampen unterstützen bestätigtes Schalten und – je nach vorhandenen Fähigkeiten – Helligkeit/RGB. Simulationen sind gekennzeichnet. Eigentümer ordnen Geräte über **Geräte zuordnen → Diesem Raum zuordnen** zu. Ein Gruppenbefehl schaltet ausschließlich erreichbare, steuerbare Geräte; nicht steuerbare Heimnetz-Lampen bleiben ausdrücklich ausgenommen.

Home-Assistant-Importzugänge übertragen Zustände und Messwerte, aber keinen Steuerzugang zum Heimnetz. Solche Lampen werden im Web angezeigt; ihre Bedienung bleibt vorerst in der iPhone-App. Keine Home-Assistant-Zugangsdaten werden an den Modell-Viewer weitergegeben.

Sensorwerte werden je Raum/Messgröße zusammengeführt (echte Messwerte bevorzugt, dann neuester Zeitpunkt). Einzelmesswerte zeigen Quelle und Zeitpunkt; Werte älter als drei Minuten gelten als veraltet. Das bestehende Overlay bleibt auf maximal 50 Räume begrenzt. Fehlgeschlagene Quellen werden als Fehler angezeigt; Schaltaufträge werden nie automatisch wiederholt. Raum- und Gerätedaten werden bei geöffneter Karte alle 15 Sekunden aktualisiert, der Modell-Lichtzustand weiterhin alle fünf Sekunden.

## Produktivbetrieb

GitHub ist die einzige Codequelle: **eigener Branch → Pull Request → Review → main**. Keine Anwendungscode-Änderungen auf dem Server und keine direkten Pushes auf main.

Aktiver Serverpfad: `/opt/gst/dashboard`. Veröffentlichung ausschließlich mit dem eingerichteten Befehl:

Nach erfolgreich geprüften Merges nach `main` übernimmt **Deploy production** den Aufruf automatisch.
Der Ablauf wartet auf erfolgreiche Backend- und iOS-Push-Prüfungen desselben aktuellen Commits,
prüft die Web-App, sichert die Datenbank und kontrolliert nach dem Start die Erreichbarkeit.
Einzelheiten und die einmalige Einrichtung: [Automatische Veröffentlichung](../docs/automatische-veroeffentlichung.md).
Manueller Aufruf für den Betrieb (derselbe Schutz und dieselbe Datenbanksicherung):

```bash
ssh root@185.56.151.249 d21-deploy
```

`/opt/d21` ist veraltet. Compose-Projektname `d21`, bestehendes Datenbank-Volume `d21_dbdata`. Niemals den Datenbank-Container oder das Volume löschen; niemals `docker-compose down -v` ausführen. Das Deployment-Skript berücksichtigt die ältere Compose-Version und ersetzt ausschließlich die App-Container. Port 8088 bleibt an `127.0.0.1` gebunden; Zugriff von außen über `https://nala-solutions.de` mit persönlicher Account-Anmeldung ohne vorgeschalteten Browser-Passwortdialog; der separate Cloudflare-Tunnel `d21-tunnel` bleibt als bisheriger App-Zugang erhalten. Die öffentliche Landingpage liegt getrennt auf `https://kitrifftgebäude.de`.

Die aktive `.env` und weitere Geheimnisse liegen ausschließlich geschützt auf dem Server. `.env`, `access-password`, `tunnel-url`, API-Tokens und private Schlüssel niemals committen. Ein iPhone-Update wird separat gebaut und installiert.

## Dashboard-Domain

`dashboard/ops/configure-dashboard-domain.py` unterstützt `nala-solutions.de` und den bisherigen Zugang `titanfs.de` mit getrennten Zertifikaten und Konfigurationsdateien. Es liefert die Weboberfläche über `127.0.0.1:8088` ohne vorgeschaltete Basic-Auth-Anmeldung aus. Die gemeinsame `/api/v1/` prüft weiterhin die Account-Sitzung und Gebäuderechte; Administration erfordert zusätzlich die vorhandene Admin-Freigabe. Andere alte `/api/`-Routen werden abgewiesen. `/app-api/v1/` bleibt als Alias zur gleichen Account-API verfügbar. Upload-Limit 26 MB, Antwortzeit bis 125 Sekunden. Der bisherige iPhone-Zugang bleibt gültig.

Voraussetzung: A-Eintrag ausschließlich `185.56.151.249`, kein abweichender AAAA-Eintrag. `www` wird nur bei passendem DNS in das Zertifikat aufgenommen und anschließend auf die gewählte Hauptdomain umgeleitet. Nach geprüftem PR, Datenbanksicherung und `d21-deploy`:

```bash
python3 /opt/gst/dashboard/ops/configure-dashboard-domain.py --domain nala-solutions.de
python3 /opt/gst/dashboard/ops/configure-dashboard-domain.py --domain nala-solutions.de --apply
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
