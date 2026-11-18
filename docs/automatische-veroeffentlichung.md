# Automatische Veröffentlichung auf dem Projektserver

Nach einem Merge nach `main` laufen die bestehenden Workflows **Backend** und **iOS**.
Der neue Workflow **Deploy production** reagiert auf ihren Abschluss und veröffentlicht erst,
wenn beide **Push-Läufe desselben aktuellen main-Commits erfolgreich** sind. PR-Tests,
fremde Repositories, alte Commits und abgebrochene Prüfungen reichen nicht aus.
Zusätzlich laufen Web-Lint, Viewer-Tests und Web-Produktionsbuild vor der Veröffentlichung.

GitHub verbindet sich mit einem eigenen SSH-Schlüssel. Dieser ist serverseitig mit
`restrict,command="/usr/local/bin/d21-auto-deploy"` auf genau `deploy <40-stellige SHA>`
begrenzt: kein Terminal, kein beliebiger Befehl und keine Portweiterleitung. Der Server-Hostschlüssel
wird fest geprüft. Die Geheimnisse `D21_DEPLOY_SSH_KEY` und `D21_DEPLOY_KNOWN_HOSTS`
liegen ausschließlich in GitHub Actions Secrets, niemals im Repository.

Der Aufruf verwendet ausschließlich **d21-deploy**, Pfad `/opt/gst/dashboard`, Compose-Projekt `d21`.
Manuelle und automatische Veröffentlichungen teilen dieselbe Sperre. Vor jedem neuen Stand:

1. Prüfen, dass der erwartete Commit weiterhin der aktuelle main-Stand ist.
2. Datenbank nach `/var/backups/d21/` sichern und das Archiv mit `pg_restore --list` prüfen.
3. Images bauen, während die bisherige App weiterläuft. Bei Fehlern hier bleibt sie bestehen.
4. Ausschließlich `api`, `web`, `plan-worker`, `ifc-worker` ersetzen; mit `--no-deps` bleibt der
   Datenbankcontainer unangetastet. Kein Löschen von Volumes oder `docker-compose down`.
5. Datenbankcontainer-ID, lokale API-Gesundheit, öffentliche API und Website prüfen.
6. Erfolgreichen Commit unter `/var/lib/d21-deploy/last-successful-commit` festhalten.

Ein Fehler nach dem Ersetzen der App-Container wird als fehlgeschlagener Workflow sichtbar;
es gibt keinen automatischen Datenbank-Rollback. Die geprüfte Sicherung bleibt erhalten.
Der Workflow kann unter **Actions → Deploy production → Run workflow → main** erneut gestartet
werden; die gleichen Prüfungen gelten. Doppelte Aufrufe desselben gesunden Stands werden übersprungen.
Kein manuelles Bestätigen jedes Deployments erforderlich. Bei Fehlern nicht Prüfungen umgehen,
sondern den Fehler per Branch und Pull Request beheben und erneut veröffentlichen.

## Einmalige Einrichtung / Schlüsselwechsel

Nach geprüftem Merge beide Shellskripte aus dem freigegebenen GitHub-Commit als
`/usr/local/bin/d21-deploy` und `/usr/local/bin/d21-auto-deploy` installieren (root, Modus 0755).
Den öffentlichen Deployment-Schlüssel in `/root/.ssh/authorized_keys` mit obiger Beschränkung
ergänzen. Den privaten Schlüssel ausschließlich als GitHub Secret hinterlegen. Den Hostschlüssel
über den bereits vertrauenswürdigen administrativen SSH-Zugang lesen und fest hinterlegen.
Beim Schlüsselwechsel zunächst den neuen eingeschränkten Zugang prüfen und anschließend nur
den alten Deployment-Schlüssel entfernen; bestehende administrative Zugänge unverändert lassen.

Änderungen an diesen rootseitig installierten Skripten werden bei einer späteren Anpassung bewusst
erneut aus dem geprüften GitHub-Stand installiert. Normale App-Änderungen veröffentlichen sich automatisch.
Neue Containerdienste oder Datenbankkonfigurationsänderungen benötigen eine gesonderte Betriebsanpassung.
Die native iPhone-App wird weiterhin separat über Xcode/TestFlight gebaut und verteilt.

Grundlage: [GitHub workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
und [Workflow-Run-API](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-workflow).
