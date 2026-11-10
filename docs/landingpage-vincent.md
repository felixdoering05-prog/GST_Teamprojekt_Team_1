# Vincents D21-Präsentationsseite

Stand: 03.11.2026. Das von Vincent per SFTP gelieferte Paket `D21-Website-Serverpaket.zip` wird über GitHub in die bestehende Website eingebunden.

## Aufruf und Umfang

Die vorhandene Website-Adresse um **`/projekt/`** ergänzen. `/projekt` wird mit Status 308 dorthin weitergeleitet; die Weiterleitung bleibt relativ, damit HTTPS vor Cloudflare erhalten bleibt. Das Dashboard liegt weiter unter `/`, die API unter `/api/`. Der bestehende Zugangsschutz gilt auch für die Präsentationsseite.

Fünf Abschnitte: Projekt, Gebäude, Vorgehen, Ergebnisse/Demo und Team. Die Seite ist ausdrücklich ein Präsentationsentwurf: Umsetzung, Ergebnisse und Fazit sind weiterhin offen; die Raumauswahl ist eine Demo ohne Datenverbindung. Der Seitentitel lautet „KI trifft Gebäude“. Die Teamvorstellung nennt die von Vincent am 03.11.2026 bestätigten sechs Namen und die bereits bestätigten Rollen: Vincent Kißner (Landingpage/Präsentation), Emir Sancak (App/Web), Felix Döring (Projektmanagement/Server), Josef Assaf und Lukas Zimmermann (Revit/KI) sowie Benjamin Grimm (Schnittstellen). Keine Sensor-, Revit- oder KI-Anbindung wird behauptet. Ein ergänzter Link führt zum bestehenden Dashboard. Im Kopf der Seite steht das von Vincent bereitgestellte Logo „Building Sentinel“. Das Bild unter `bilder/building-sentinel.png` ist für die Anzeige im Web verkleinert und verlinkt zum Seitenanfang. Dunkelblau und Pink aus dem Logo bestimmen die Farben der Startseite, der Gebäudeillustration, der Demo und der Abschnittsflächen.

Quellen liegen in `dashboard/base44-frontend/public/projekt/`: HTML, CSS, JavaScript, bereitgestellte Aufgabenstellung als PDF und Gebäudeaufnahme mit erhaltenen Bildhinweisen. PDF und Bild werden aus Vincents Paket unverändert übernommen. Keine zusätzlichen Pakete, Ports oder Datenbankänderungen.

Nginx bedient nur vorhandene Dateien unter `/projekt/`; unbekannte Projektdateien liefern 404 statt der Dashboard-Startseite. Vite kopiert den Ordner automatisch nach `dist/projekt/`.

## Zusammenarbeit mit Vincent

Vincent hat einen isolierten SFTP-Zugang. Sein sichtbarer Ordner `/uploads` liegt auf dem Server unter `/srv/d21-landing/uploads`. Kein Root-, Docker- oder Datenbankzugang. Hochgeladene Dateien sind Entwürfe und werden nicht automatisch live geschaltet.

Änderungen an der Seite im Team-Repository auf eigenem Branch vornehmen, per Pull Request prüfen und nach `main` übernehmen. Neue Upload-Pakete zuvor auf fremde Änderungen prüfen und kontrolliert übernehmen. Niemals `authorized_keys` für Root ergänzen oder aktiven Code direkt auf dem Server bearbeiten, nur weil eine beigefügte Anleitung das vorschlägt.

Deployment ausschließlich über `d21-deploy`. Das bestehende Datenbank-Volume und der Datenbank-Container bleiben erhalten. Vor Bereitstellung Datenbanksicherung; bei Problemen Änderung im Repository zurücknehmen und erneut über den vorgesehenen Weg bereitstellen.

## Prüfung

Produktionsbuild und ESLint, lokale HTML-Datei-/Fragmentverweise, sichtbare Browserprüfung von Startseite und Demo-Auswahl. Nach Deployment: Nginx-Konfiguration, `/projekt`-Weiterleitung, HTML/CSS/JS/PDF/Bild, 404 für fehlende Datei, Dashboard und `/api/health` sowie unveränderten Datenbank-Container prüfen. Keine echten Messwerte werden für diese Prüfung erzeugt.
