# Protokoll – GST-Teamprojekt Team 1

| | |
|---|---|
| **Datum** | 27.10.2026 |
| **Thema** | Einrichtung der gemeinsamen Code-Verwaltung für das D21-Gebäude-Dashboard |
| **Bearbeitet von** | Benni (mit Unterstützung durch Claude Code) |

## 1. Ausgangslage

Der Code des D21-Gebäude-Dashboards (React-Frontend, Node/Express-Backend, PostgreSQL, Docker) lag ohne Versionsverwaltung auf Felix' Server unter `/opt/d21`. Ein gemeinsames Arbeiten und eine Einsicht durch den Betreuer waren nicht möglich.

## 2. Durchgeführte Schritte

- Claude Code auf Bennis Rechner installiert, SSH-Schlüssel erstellt und Server-Zugang eingerichtet.
- Auf dem Server ein Git-Repository angelegt; Zugangsdaten (`.env`, Passwortdatei, Tunnel-URL) per `.gitignore` ausgeschlossen.
- Dashboard-Code über Branch und Pull Request (#14) in das GitHub-Repository `GST_Teamprojekt_Team_1` übernommen, Ordner `dashboard/`. Bestehende Projektdateien blieben unverändert.
- GitHub-Repository auf dem Server nach `/opt/gst` geklont und die App auf diesen Stand umgestellt. Datenbank und vorhandene Daten blieben erhalten.
- Ein Fehler der auf dem Server installierten docker-compose-Version (`KeyError: 'ContainerConfig'`) wurde umgangen.
- Funktion der App im Browser und über die API geprüft.

## 3. Ergebnis

GitHub ist die zentrale Ablage für den Code. Der Server bezieht den Stand ausschließlich von GitHub.

### Zuständigkeiten

- **GitHub-Zugang (Code-Änderungen):** Felix, Emir, Benni, Vincent, Lucas, Jossef
- **Server-Zugang (Aktualisierung der laufenden App):** Felix, Emir, Benni

### Arbeitsablauf

Änderung lokal → eigener Branch → Pull Request → Review im Team → Merge in `main` → Aktualisierung auf dem Server mit `d21-deploy`

## 4. Offene Punkte

- [ ] Update-Skript `d21-deploy` auf dem Server anlegen (falls noch nicht erfolgt)
- [ ] SSH-Schlüssel von Emir auf dem Server hinterlegen
- [ ] SSH-Schlüssel aller Teammitglieder bei GitHub hinterlegen
- [ ] Altes Server-Repository `/opt/d21` nach Umstellung aller Beteiligten entfernen
- [ ] Prüfen, ob die docker-compose-Version auf dem Server aktualisiert werden soll
