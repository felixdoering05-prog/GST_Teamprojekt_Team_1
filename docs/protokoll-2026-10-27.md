# Protokoll – GST-Teamprojekt Team 1

Datum: 27.10.2026
Thema: Einrichtung der gemeinsamen Code-Verwaltung für das D21-Gebäude-Dashboard
Bearbeitet von: Benni (mit Unterstützung durch Claude Code)

## 1. Ausgangslage
Der Code des D21-Gebäude-Dashboards (React-Frontend, Node/Express-Backend, PostgreSQL, Docker) lag ohne Versionsverwaltung auf Felix' Server unter /opt/d21. Gemeinsames Arbeiten im Team und eine Einsicht durch den Betreuer waren nicht möglich.

## 2. Durchgeführte Schritte
1. Claude Code (KI-Programmierassistent) auf Bennis Rechner installiert.
2. SSH-Schlüssel erstellt und damit einen gesicherten Zugang zum Server eingerichtet.
3. Auf dem Server ein Git-Repository angelegt. Zugangsdaten (.env, Passwortdatei, Tunnel-URL) wurden per .gitignore ausgeschlossen, damit sie nie veröffentlicht werden.
4. Erste Änderung mit Claude Code: Im README des Dashboards war ein falscher Port angegeben (8080 statt 8088). Dieser wurde korrigiert.
5. Dashboard-Code über einen eigenen Branch und Pull Request (#14) in das GitHub-Repository GST_Teamprojekt_Team_1 übernommen, Ordner dashboard/. Bestehende Projektdateien blieben unverändert. Vorher wurde der Code auf Passwörter und Schlüssel geprüft, da das Repository öffentlich ist.
6. Für das Hochladen auf GitHub wurde der SSH-Schlüssel auch bei GitHub hinterlegt, da GitHub keine Anmeldung per Passwort mehr zulässt.
7. Das GitHub-Repository auf dem Server nach /opt/gst geklont. Die geheime .env-Datei wurde von Hand dorthin kopiert.
8. Die laufende App auf den GitHub-Stand umgestellt. Durch Beibehaltung des Docker-Projektnamens d21 blieb die bestehende Datenbank mit ihren Daten erhalten.
9. Ein Fehler der auf dem Server installierten docker-compose-Version (KeyError 'ContainerConfig') wurde umgangen, indem die betroffenen Container vor dem Neustart entfernt wurden.
10. Funktion der App im Browser und über die API geprüft: App erreichbar, vorhandene Daten vollständig.

## 3. Ergebnis
GitHub ist die zentrale Ablage für den Code. Der Server bezieht den Stand ausschließlich von GitHub.

Zuständigkeiten:
- GitHub-Zugang (Code-Änderungen): Felix, Emir, Benni, Vincent, Lucas, Jossef
- Server-Zugang (Aktualisierung der laufenden App): Felix, Emir, Benni

Arbeitsablauf:
Änderung lokal → eigener Branch → Pull Request → Review im Team → Merge in main → Aktualisierung auf dem Server

## 4. Offene Punkte
- [ ] Update-Skript d21-deploy auf dem Server anlegen, damit die App mit einem Befehl aktualisiert werden kann
- [ ] SSH-Schlüssel von Emir auf dem Server hinterlegen
- [ ] SSH-Schlüssel aller Teammitglieder bei GitHub hinterlegen
- [ ] Codex CLI (KI-Programmierassistent von OpenAI) bei Vincent fertig einrichten
- [ ] Altes Server-Repository /opt/d21 nach Umstellung aller Beteiligten entfernen
- [ ] Prüfen, ob die docker-compose-Version auf dem Server aktualisiert werden soll
