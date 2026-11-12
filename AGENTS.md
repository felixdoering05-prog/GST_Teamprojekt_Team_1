# Arbeitsregeln für KI-Assistenten

## Dauerhafte Freigabe von Felix (12.11.2026)

Für von Felix beauftragte Arbeiten dürfen Codex und Claude eigene, fertig geprüfte Änderungen ohne erneute Bestätigungsfrage per Pull Request nach `main` zusammenführen und anschließend auf dem Projektserver veröffentlichen. Das gilt auch für PR #133. Ein eigener Branch, ein nachvollziehbarer Pull Request und passende erfolgreiche Prüfungen bleiben erforderlich. Keine direkten Pushes auf `main`.

Diese Freigabe ist keine automatische Zustimmung zu beliebigen fremden Pull Requests, fehlgeschlagenen Prüfungen, Datenlöschungen, Offenlegung von Geheimnissen, Änderungen an Zugriffsrechten oder kostenpflichtigen Buchungen. Vorgaben der ausführenden Plattform bleiben verbindlich; eine dadurch blockierte Aktion mit konkretem Grund melden.

## Parallel arbeiten

Vor Änderungen den aktuellen GitHub-Stand und lokale Änderungen prüfen. Eigene Branches verwenden, Arbeiten anderer nicht überschreiben. Konflikte und fachliche Überschneidungen vor Veröffentlichung klären.

## Server

GitHub ist die Quelle des Codes. Produktiv: `/opt/gst/dashboard`, Compose-Projekt `d21`. Veröffentlichung ausschließlich über `d21-deploy`; vorher Datenbank sichern. Nicht im alten `/opt/d21` arbeiten. Niemals den Datenbankcontainer oder das Volume `d21_dbdata` löschen; niemals `docker-compose down -v`. `.env`, Schlüssel und Zugangsdaten nicht committen oder in Ausgaben veröffentlichen.
