# kitrifftgebäude.de: öffentliche Landingpage

Die Domain **https://kitrifftgebäude.de** dient ausschließlich der öffentlichen Projekt-Landingpage. Der Hostname lautet technisch `xn--kitrifftgebude-gib.de`. Sie zeigt dieselben Projektinhalte, die bereits unter dem bisherigen Zugang mit `/projekt/` erreichbar sind.

Die iPhone-App, die Home-Assistant-Brücke und der geschützte Web-Dashboard-Zugang behalten ihre bisherige Serveradresse. Es werden keine Sitzungen, Schlüssel oder lokalen Entwürfe auf die Landingpage-Domain umgezogen. Der Link „Zum Dashboard“ führt zum bestehenden geschützten Zugang.

## DNS und Einrichtung

1. Bei STRATO für die Hauptdomain den **A-Eintrag auf `185.56.151.249`** setzen. MX und TXT für E-Mail bleiben unberührt. Ein abweichender AAAA-Eintrag muss vor Aktivierung mit der zuständigen DNS-Verwaltung geklärt werden, da diese Konfiguration nur den IPv4-Projektserver verwendet.
2. Optional `www` ebenfalls auf diesen Server zeigen lassen. Das Skript nimmt `www` nur bei passendem DNS in das Zertifikat auf.
3. Änderungen über GitHub-PR und `d21-deploy` nach Datenbanksicherung veröffentlichen.
4. Auf dem Server zuerst `python3 /opt/gst/dashboard/ops/configure-domain.py` ausführen; erst bei passendem DNS mit `--apply` aktivieren.

Das Skript benötigt nginx und certbot. Es bezieht ein Let's-Encrypt-Zertifikat mit Webroot-Challenge und richtet einen nginx-Neulade-Hook für die Verlängerung ein. Der bestehende `certbot.timer` muss aktiv sein. Bei einem Konfigurations- oder Zertifikatsfehler wird die vorherige nginx-Konfiguration wiederhergestellt. Andere Host-Konfigurationen werden nicht verändert.

## Routing und Abnahme

- `/` und relative Assets wie `/style.css`, `/script.js` und `/bilder/...` kommen aus dem bestehenden `/projekt/`-Verzeichnis des Web-Containers.
- `/projekt/...` bleibt als kompatibler Projektpfad erreichbar.
- `/datenschutz.html` liefert die vorhandene öffentliche Datenschutzseite.
- `/api/` und `/app-api/` sind auf der Landingpage-Domain gesperrt. Die Domain ist kein neuer App-Einstieg.
- Root, Stylesheet, Skript, Projektbilder und PDF müssen per HTTPS erfolgreich geladen werden. Das Dashboard-Ziel bleibt geschützt.
- DNS-Abfragen müssen nur den Projektserver ergeben; anschließend nginx-Konfiguration, HTTPS und Weiterleitung von `www` (falls eingerichtet) prüfen.

Solange DNS noch auf STRATO-Parking oder einen anderen Server zeigt, bleibt die Aktivierung aus. Die übrige Projektanwendung funktioniert unabhängig davon weiter.
