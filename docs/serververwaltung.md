# Serververwaltung für Felix

Stand: 03.11.2026. Eigener Verwaltungsbereich unter **`/verwaltung`**, im bestehenden Dashboard nur für freigegebene Administratoren im Menü sichtbar. Bestehender Website-Zugang und persönliches Projektkonto bleiben erforderlich.

## Anzeige

- Host-CPU (Differenz seit der vorigen Messung), CPU-Kerne, RAM, Systemlaufzeit und Root-Festplatte; keine Verwechslung mit der Sicht des API-Containers.
- D21-Container: Name, Zustand, CPU und RAM. Keine Steuerbefehle im Browser.
- KI-Anfragen aus `app_ai_requests`: rollierende 24 Stunden, erfolgreich/fehlgeschlagen/laufend, Anbieterfehler 429 und App-Limits. Fehlerhafte angenommene Versuche zählen mit; Cache-Wiederholungen nicht. Alte Anfragen können durch Gebäudelöschung einen leeren Gebäudeverweis haben, bleiben aber für das Kontingent erhalten.
- Aktuell konfigurierte Anbieter-/Modelleinstellungen und ausschließlich das Vorhandensein einer Schlüsseldatei. Keine Schlüsselinhalte. Die Web-Verwaltung aktiviert oder wechselt keinen Anbieter. h_da-Vorbereitung ist ein separater PR; beobachtete zwei Anfragen/zehn Sekunden sind kein Nachweis einer aktiven h_da-Verbindung oder unbegrenzter Nutzung.
- HTTP-Aufrufe ab Einrichtung: stündliche Zähler, 4xx/5xx und mittlere Bearbeitungszeit. Das Fenster enthält die laufende Stunde und ist nicht minutengenau rollierend. Ohne Health- und Verwaltungsabfragen. Keine Pfade mit IDs, Inhalte, E-Mails, IP-Adressen oder Zugangsdaten in dieser Statistik. Aufbewahrung 30 Tage, stündliche Bereinigung.
- Registrierte App-Konten mit Name, E-Mail, Registrierungszeit, aktiven Sitzungen, Gebäude-/Dateispeicher und KI-Kontingent. Seitenweise bis 50; aktive Sitzung bedeutet nicht „gerade online“. Dateien liegen in PostgreSQL; Dokumentgröße und Datenbankgröße nicht addieren.
- Serverzugänge getrennt davon: lokale Benutzer mit hinterlegten öffentlichen SSH-Schlüsseln, Typ des Zugangs, Schlüsselfingerabdruck und Kommentar. Kommentare sind keine verifizierten Personennamen. Keine privaten Schlüssel, Passwörter, Passwort-Hashes oder Sitzungstokens.

Die Oberfläche aktualisiert alle 30 Sekunden, solange sie sichtbar ist. Hostdaten älter als zwei Minuten werden ausdrücklich als veraltet gekennzeichnet. Fehlende Daten werden nicht durch erfundene Werte ersetzt. Die erste CPU-Messung benötigt einen zweiten Sammlerlauf.

## Rechte und Schnittstellen

`D21_ADMIN_USER_IDS` ist eine ausschließlich serverseitige Liste vorhandener Konto-IDs. Leer = niemand freigegeben; weder der erste registrierte Nutzer noch ein passender Name/E-Mail wird automatisch Administrator. Für Felix wurde die bestehende Konto-ID 3 überprüft. Andere Konten bleiben unverändert.

- `GET /api/v1/admin/me`: nur eigene Administratorfreigabe, keine fremden Kontoinformationen.
- `GET /api/v1/admin/overview`: Ressourcen, Dienste, Kontingente und aggregierte Zahlen.
- `GET /api/v1/admin/users?limit=50&offset=0`: berechtigte Kontoliste; Limit maximal 100.

Alle Routen benötigen bestehende Anmeldung, sensible Routen zusätzlich Administratorfreigabe. Die Prüfung erfolgt bei jedem Aufruf auf dem Server. `Cache-Control: private, no-store`. Eine versteckte Menüoption ersetzt keine Rechteprüfung.

## Installation und Betrieb

Quellcode und Änderungen ausschließlich über GitHub/Branch/PR. Anwendung ausschließlich mit `d21-deploy` bereitstellen. Vorher bestehende Datenbank sichern; Datenbank-Container und `d21_dbdata` erhalten.

Nicht geheime Serverkonfiguration in der geschützten `/opt/gst/dashboard/.env`:

```
D21_ADMIN_USER_IDS=3
D21_ADMIN_STATUS_DIR=/var/lib/d21-admin
```

Nach Übernahme des geprüften Codes den Sammler als Serveradministrator installieren:

```
sh /opt/gst/dashboard/ops/admin/install.sh
```

Dieser installiert nur den versionierten Sammler und die systemd-Dateien, keinen abweichenden App-Code. `d21-admin-metrics.timer` startet etwa alle 30 Sekunden den lokalen Sammler. Dieser liest Hostmetriken, Docker-Status und ausschließlich öffentliche Schlüssel-Fingerabdrücke und schreibt atomar `/var/lib/d21-admin/status.json`. Die API sieht dieses Verzeichnis nur lesend unter `/run/d21-admin`. **Kein Docker-Socket, kein Host-/proc-Mount und keine privaten SSH-Dateien im API-Container.** Der Host-Sammler hat lokale Root-Rechte; der Browser erhält nur die begrenzte JSON-Ausgabe.

Prüfung: `systemctl status d21-admin-metrics.timer`, `journalctl -u d21-admin-metrics.service` und Zeitstempel im Portal. Der bestehende n8n-Dienst und Tunnel bleiben eigenständige Dienste. Es werden keine neuen öffentlichen Ports geöffnet.

## Grenzen

Erste Version als Überwachungsportal, keine Lösch-/Neustartfunktionen und keine Erteilung von Serverzugängen. Keine rückwirkende HTTP-Nutzungsstatistik vor der Einrichtung. Anbieter-Vertragslimits, Rechnungen, Tokenverbrauch und Kosten sind ohne passende Anbieter-Messschnittstelle nicht bekannt und werden nicht geschätzt. Konfiguration/Schlüssel vorhanden bedeutet keine garantierte Anbieter-Erreichbarkeit. Gemeinsame Website-Zugangsdaten oder ein Root-Schlüsselkommentar identifizieren keine einzelne Person zuverlässig.
