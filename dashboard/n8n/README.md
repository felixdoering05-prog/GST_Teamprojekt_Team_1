# D21-Automatisierungen mit n8n

Stand: 02.11.2026. Zwei eigenständige, nur lesende Abläufe. Kein WhatsApp-Versand, keine GitHub-Schreibrechte, keine Änderung an App-API oder App-Datenbank.

## Zugang

n8n ist **nicht öffentlich** erreichbar. Auf dem eigenen Mac ein Terminal offen lassen:

```sh
ssh -N -L 5678:127.0.0.1:5678 root@185.56.151.249
```

Danach **http://localhost:5678** öffnen. Beim ersten Besuch legt Felix seinen n8n-Administrator selbst mit einem eigenen Passwort an. Das ist ein eigener Zugang, kein D21-App-Konto. Ein Mailkonto oder eine kostenpflichtige n8n-Lizenz wird für diese beiden Abläufe nicht benötigt. Eine externe Lizenzregistrierung ist optional. Falls Port 5678 lokal belegt ist, stattdessen `-L 5679:127.0.0.1:5678` und `http://localhost:5679` verwenden.

Der HTTP-Editor bleibt auf beiden Seiten an Loopback gebunden; der Transport zum Server läuft verschlüsselt über SSH. Deshalb ist nur hier `N8N_SECURE_COOKIE=false` gesetzt. Bei späterem öffentlichem Zugang zuerst HTTPS, Domain und Cookie-Konfiguration umstellen. Keine Portfreigabe für 5678 einrichten und n8n nicht an den öffentlichen App-Tunnel hängen.

## Wo stehen die Meldungen?

Unter **Workflows** gibt es:

- **D21 · GitHub-Meldungen**: alle fünf Minuten neue Aufgaben/PRs, Änderungen der Zuständigkeiten, geschlossen/wieder geöffnet und zusammengeführt. Unter **Executions** eine Ausführung öffnen und den letzten Knoten **GitHub-Meldungen speichern → Output** wählen. Der erste Lauf speichert nur den Ausgangsstand. Jeder Folgelauf zeigt Änderungen oder „keine Änderungen“.
- **D21 · Website-Erreichbarkeit**: alle zwei Minuten interner nginx/API-Gesundheitscheck und öffentlicher HTTPS-Eingang. Letzter Knoten **Prüfergebnis speichern → Output** zeigt „erreichbar“, „Störung“, Übergang und HTTP-Status. Der öffentliche Passwortschutz antwortet erwartungsgemäß mit **401**. Das ist kein Ausfall. Eine Störung ist ein gespeichertes Ergebnis; die Ausführung kann dabei technisch erfolgreich/grün sein.

Ergebnisse werden höchstens **72 Stunden / 5.000 Ausführungen** aufbewahrt und automatisch bereinigt. Das ist ein einfacher Ausführungsverlauf, kein dauerhaftes Teamarchiv und noch kein eigenes Nachrichten-Postfach. Es werden keine Nachrichten an Personen verschickt.

## Grenzen

- Die Prüfung läuft auf demselben VPS: Bei komplettem Server-/n8n-Ausfall kommt keine sofortige externe Warnung. Eine Lücke über fünf Minuten wird beim nächsten erfolgreichen Lauf vermerkt. Eine unabhängige externe Überwachung wäre der nächste Ausbau.
- Der öffentliche Cloudflare-Testlink kann wechseln. Dann die URL im Workflow über einen GitHub-PR aktualisieren. Ein 401 testet den öffentlichen Eingang, nicht die Anmeldung mit einem gültigen App-Konto. Der separate interne Check prüft nginx/API, keine vollständige Registrierung oder Datenbankabfrage.
- GitHub wird anonym und ausschließlich lesend für das öffentliche Hauptrepo abgefragt. Keine privaten Modelle/Pläne, keine Kommentare oder vollständigen Zwischenereignisse. Letzte 100 aktualisierte Einträge pro Endpunkt; bei drohender Überschreitung bricht der Lauf sichtbar ab, ohne den letzten Stand zu überschreiben. Vor großem Projektwachstum Pagination ergänzen.
- Es werden Zustandsunterschiede zwischen Prüfläufen erkannt. Ein kurzzeitiges Öffnen/Schließen zwischen zwei Prüfungen kann fehlen. Ein Ereignis genau an der Startgrenze kann erst im nächsten Lauf erscheinen.
- Die SQLite-Datenbank und der automatisch erzeugte Verschlüsselungsschlüssel liegen ausschließlich im separaten Docker-Volume **d21_n8ndata**. Die App-Datenbank **d21_dbdata** wird nicht verwendet.
- Kein Docker-Socket, keine SSH-Schlüssel, App-Zugangsdaten oder privaten Projektdateien im n8n-Container. Code-Knoten verwenden nur lokale Daten; HTTP-Zugriffe erfolgen in sichtbaren HTTP-Knoten.

## Deployment und Änderungen

Alle Dateien liegen in GitHub unter `dashboard/n8n/`. Änderungen über Branch + Pull Request, danach ausschließlich **d21-deploy**. n8n ist als zusätzlicher Dienst in der bestehenden Compose-Datei eingebunden: 768 MiB RAM, 0,75 CPU, ein produktiver Ablauf gleichzeitig. Die Images sind auf einen geprüften Digest festgelegt; Sicherheitsupdates regelmäßig kontrolliert über PR einspielen.

Beim ersten Start importiert und veröffentlicht `start.sh` genau diese zwei Workflows. Der Marker `d21-bootstrap-v1.done` liegt im n8n-Volume. Neustarts überschreiben weder Bearbeitungen im Editor noch den gespeicherten GitHub-Ausgangsstand. Nachträgliche JSON-Änderungen werden deshalb **nicht automatisch** in bereits vorhandene Workflows übernommen: kontrolliert exportieren/sichern und die betroffenen Workflows gezielt neu importieren/veröffentlichen. Keine Massenimporte und den Marker nicht einfach löschen.

Vor Updates n8n stoppen und das vollständige n8n-Volume einschließlich SQLite-Datei und Schlüssel sichern; Wiederherstellung separat prüfen. App-DB/Volume nicht löschen. Niemals `docker-compose down -v` verwenden.

Lokale Prüfung ohne Installation weiterer Pakete:

```sh
node dashboard/n8n/build.mjs
node --test dashboard/n8n/test/*.test.mjs
```

`build.mjs` übernimmt die getesteten Funktionen aus `src/events.mjs` in die importierbaren JSON-Workflows. Änderungen im Editor müssen ohne Zugangsdaten wieder über einen PR dokumentiert werden. Keine SMTP-, KI-, WhatsApp- oder PC-Tunnel-Anbindung eingerichtet.

## Quellen

- [n8n Docker-Installation](https://docs.n8n.io/hosting/installation/docker/)
- [Import, Export und Veröffentlichung über die CLI](https://docs.n8n.io/hosting/cli-commands/)
- [Persistenter Workflow-Zwischenstand](https://docs.n8n.io/code/cookbook/builtin/get-workflow-static-data/)
- [Ausführungen und Aufbewahrung](https://docs.n8n.io/hosting/configuration/environment-variables/executions/)
