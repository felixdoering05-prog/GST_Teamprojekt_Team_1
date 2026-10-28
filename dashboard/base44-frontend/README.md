# D21 – Serverausgabe der Base44-Oberfläche

Ausgangsstand: `docs/d21-digital-twin-revit-bim-und-g-a060ebbe.zip` (27.10.2026).
Die ZIP bleibt unverändert als Übergabe erhalten. Diese bearbeitbare Ausgabe ersetzt die
Base44-Daten- und Kontoaufrufe durch die gemeinsame D21-API. Keine Base44-Anmeldedaten nötig.

## Lokal starten

Node 22.12 oder neuer. Nach `npm ci` mit `npm run dev` starten. Der Entwicklungsserver
leitet `/api` standardmäßig an `http://127.0.0.1:3001` weiter; bei Bedarf `D21_DEV_API` setzen.
Das Backend muss separat mit einer **Testdatenbank** laufen. Keine Produktivdaten für Tests verwenden.

`npm run build` erzeugt `dist/`. `npm run lint` prüft die Oberfläche.
`npm run typecheck` ist aus dem Export übernommen und meldet noch Fehler in der
JavaScript-/React-Prop-Typisierung; es ist derzeit kein bestandener Freigabecheck.

## Daten und Konten

Alle Requests gehen an dieselbe Herkunft unter `/api/v1`. Kein CORS, API-Key oder
Datenbankpasswort im Frontend. Der vorhandene Website-Zugang bleibt vor der App bestehen.
Die persönlichen Projektkonten entsprechen denen der iPhone-App. Anmeldung erfolgt mit
`X-D21-Session`; die Sitzung wird im `sessionStorage` gehalten und beim Abmelden serverseitig widerrufen.

`src/api/base44Client.js` behält die Aufrufstruktur der importierten Komponenten bei,
verwendet aber **keinen Base44-SDK und keinen Base44-Server**.

- Gebäude und Dateien: vorhandene Tabellen `app_buildings` und `app_documents`.
- Zusätzliche Gebäudeangaben: neue JSONB-Spalte `app_buildings.twin_data`.
- Geschosse, Räume, Sensoren, Messwerte, Energie, Meldungen, Grenzwerte:
  `app_twin_records`, getrennt nach persönlichem Konto und Datentyp.
- Serverseitige Schema- und Zuordnungsprüfung. Schreibimporte sind pro Anfrage atomar;
  maximal 200 Datensätze pro Importanfrage, maximal 20.000 Gebäude-/Twin-Datensätze pro Konto.
- Dateilimits und Formatprüfung bleiben unverändert: 25 MB je Datei, 250 MB je Konto.
- Alle über das iPhone angelegten Gebäude sind unter „Gebäude & Räume“ auswählbar.
  Neue Gebäude und Uploads erscheinen unter demselben Konto auch in der iPhone-App.

## Was die ZIP nicht enthält

Der Export enthält Quellcode und Schemas, **keine vorhandenen Base44-Daten**, Passwörter
oder hochgeladenen Dateien. Diese Ausgabe übernimmt deshalb nicht automatisch die Daten
oder Konten eines bereits betriebenen Base44-Projekts. Dafür wäre ein separater, geprüfter
Datenexport mit Zuordnung der Konten/IDs und Dateien nötig.

Google-Login und E-Mail-Bestätigung sind auf dem Projektserver
noch nicht eingerichtet; die Oberfläche bietet dafür keine vorgetäuschten Abläufe an.
Demo-Seeding und Grenzwertprüfung laufen im eigenen Backend und bleiben ausdrücklich
simulierte Daten bzw. regelbasierte Auswertungen. Keine Revit-, Ollama- oder Live-Sensor-Anbindung.
Der BIM-Viewer bleibt eine schematische Ansicht.

## Weitere Bearbeitung in Base44

Die ursprüngliche Base44-App wird durch Änderungen hier nicht automatisch aktualisiert.
Neue Exporte von Emir müssen als eigener Branch übernommen und mit dieser Serveranbindung
abgeglichen werden. Die API-Datei, Authentifizierung und Upload-Komponenten erhalten.
GitHub bleibt die Quelle der Serverversion. Keine unkontrollierte Synchronisierung nach `main`.

## Bereitstellung

Diese Ausgabe ist der Web-Build im Standard-Compose (`web.build: ./base44-frontend`).
Veröffentlichung nach Review über GitHub und ausschließlich mit `d21-deploy`.
`compose.base44.yml` ist ein gleichwertiger expliziter Build-Override.
Nicht parallel ein zweites Compose-Projekt mit eigener leerer Datenbank starten.
Projektname `d21` und Volume `d21_dbdata` erhalten. Die bisherige Oberfläche bleibt
unter `frontend/` im Repository; eine Rückkehr erfolgt ebenfalls über einen Pull Request.

Das Backend ergänzt die neuen Tabellen/Spalten beim Start additiv. Alte API, Konten,
Dateien und iOS-App bleiben kompatibel. Vor Produktionsdeployment einen Datenbank-Backup
nach dem vorhandenen Betriebsverfahren erstellen. Niemals `down -v` verwenden.

Passwort-Wiederherstellung per E-Mail-Code ist vorbereitet und ohne SMTP-Absender deaktiviert. [Mail-Einrichtung](../../docs/passwort-mail.md).
