# D21 Digital Twin – serverfähiges MVP

## Start
Voraussetzung: Docker Engine und Docker Compose Plugin.

```bash
cp .env.example .env
docker compose up --build -d
```

Im Browser `http://localhost:8088` öffnen. Der Port ist nur lokal (`127.0.0.1`) freigegeben; für Zugriff von einem anderen Rechner im selben Netz (`http://SERVER-IP:8088`) muss in `docker-compose.yml` die Bindung angepasst und die Firewall freigegeben werden.

## Enthalten
- React/TypeScript Dashboard
- Gebäude anlegen und persistent in PostgreSQL speichern
- Express API (`GET /api/health`, `GET/POST /api/buildings`)
- Docker Compose für Frontend, Backend, Datenbank

## Noch nicht enthalten
- Revit/IFC Import und 3D-Viewer
- Anlagen, Wartungen, Dokumentenverwaltung
- Authentifizierung, Berechtigungen, HTTPS, Backups, Monitoring

**Sicherheit:** Entwicklungs-MVP ohne Login. Nicht öffentlich ins Internet stellen. Vor produktiver Bereitstellung Zugangsschutz, HTTPS, starke Datenbankpasswörter, Backupkonzept und IT-Freigabe einrichten. Hochschulserver-Zugriff und Docker-Berechtigungen zuerst mit dem Teamkollegen klären.
