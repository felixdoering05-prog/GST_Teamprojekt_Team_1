# Bilder, PDFs und DWG-Pläne

Web-Dashboard und iPhone verwenden dieselben persönlichen Gebäude und dieselbe PostgreSQL-Dateiablage. Auf beiden Geräten mit demselben Konto anmelden.

## Bedienung

- **Web:** Anmelden → Gebäude öffnen → Datei auswählen → Datei hochladen. Gespeicherte Dateien lassen sich als Bild/PDF ansehen und herunterladen.
- **iPhone:** Gebäude öffnen → Bild aus Fotos hochladen oder Datei auswählen. Bilder/PDFs über die Dateiliste ansehen, über Teilen/Sichern exportieren.
- **DWG:** Datei auswählen, hochladen und herunterladen bzw. in eine CAD-App teilen. Ein eigener DWG-Viewer, Modellimport oder eine Geometrieprüfung ist nicht enthalten.
- Fotos aus der iPhone-Fotomediathek werden als JPEG übertragen. Dateien aus der Dateiauswahl bleiben unverändert.

## Grenzen und Ablage

- PDF, JPG/JPEG, PNG, WebP und DWG; maximal **25 MB je Datei**, **250 MB je Konto**.
- Der Server prüft Erweiterung und Dateikennung. Dies ersetzt keine vollständige PDF-/CAD-Inhaltsprüfung.
- Neue Tabelle `app_documents`: Dateiname, Typ, Größe, Zeitstempel, Gebäude-ID und vollständige Datei als `BYTEA`.
- Metadatenlisten enthalten keine Datei-Binärdaten. Der Inhalt wird erst beim Öffnen heruntergeladen.
- Jeder Aufruf prüft Konto und Gebäudezuordnung. Andere Konten erhalten keinen Zugriff; öffentliche Dateilinks gibt es nicht.
- Gleichzeitige Uploads desselben Kontos werden für die Quotenprüfung über eine Datenbanksperre koordiniert.
- Bestehende Demo-Gebäude und frühere Testdateien werden nicht automatisch auf persönliche Konten übertragen. Keine vorhandene Tabelle wird gelöscht.
- Die iPhone-Vorschau erstellt kurzzeitig eine geschützte lokale Datei; diese wird nach Schließen der Vorschau entfernt. Dauerhafte Quelle bleibt PostgreSQL.
- Umbenennen und bestätigtes Löschen eigener Dateien sind möglich; geteilte Gebäude und Dateiversionen folgen später. Für den Prototyp nur freigegebene Dateien verwenden.

## API für Benjamin

Alle Pfade unter `/api/v1`, Sitzung über `X-D21-Session`, bestehender Website-Zugang separat.

| Methode | Pfad | Verhalten |
| --- | --- | --- |
| GET | `/buildings/:buildingId/documents` | Dateiliste des eigenen Gebäudes |
| POST | `/buildings/:buildingId/documents` | Binärdaten mit `Content-Type: application/octet-stream` und URL-kodiertem `X-File-Name` |
| GET | `/documents/:documentId` | Authentifizierter Download; DWG als Anhang |
| PATCH | `/documents/:documentId` | Eigenen Dateinamen ändern; passende Endung erhalten |
| DELETE | `/documents/:documentId` | Eigene Datei nach Bestätigung endgültig löschen |

Upload liefert `201` mit `{id,building_id,name,mime_type,size,created_at}`. Fehler: `400` ungültige Eingabe, `401` Anmeldung fehlt, `404` nicht vorhanden/kein Zugriff, `413` Größe/Quote überschritten, `415` nicht unterstützter Dateityp.

## Bereitstellung und Prüfung

Änderungen per Branch und Pull Request; Deployment wie vereinbart mit `d21-deploy`. Nach dem Deployment kann die versionierte Datei `dashboard/ops/configure-file-uploads.py` einmal auf dem Server ausgeführt werden, um die vorhandenen vorgeschalteten Upload-Limits von 11 auf 26 MB anzuheben. Sie erhält Routen und Zugangsschutz, sichert die ursprüngliche Konfiguration und prüft nginx vor dem Neuladen. Die API begrenzt weiterhin auf 25 MB.

Backendtests unter `dashboard/backend/test/documents.test.js` verwenden isoliertes PostgreSQL (PGlite), einschließlich Kontentrennung, Datei-Roundtrip, Quoten und ungültiger Dateien. DWG-Testdaten prüfen ausschließlich Kennung und unveränderte Bytes; sie sind kein vollständiges CAD-Modell.

Geführte iPhone-Anlage, lokale Entwürfe und wiederholbare Uploads: [Gebäudemappe](gebaeudemappe-ios.md).
