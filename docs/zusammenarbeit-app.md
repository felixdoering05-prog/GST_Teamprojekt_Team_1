# Kontakte, gemeinsame Gebäude und Gebäude-Chat

Stand: 02.11.2026. Von Felix beauftragter Ausbau der nativen iPhone-App und bestehender Konten-API. Schnittstellenverantwortung bleibt bei Benjamin; dieser Vertrag dokumentiert die Erweiterung für den gemeinsamen GitHub-Workflow. Keine direkten Codeänderungen auf dem Server.

## Bedienung

Die drei Hauptbereiche heißen **Gebäude · Kontakte · Mitteilungen**. Gebäude öffnen sich mit **Übersicht · Dateien · 3D · Chat**. Profil bleibt oben rechts auf der Startseite. Der separate globale IFC-/Smart-Home-Tab entfällt; 3D ist pro Gebäude erreichbar, inklusive bestehender visueller Lichtsimulation.

1. Unter Kontakte die genaue Konto-E-Mail eingeben. Der Server antwortet für vorhandene und unbekannte Konten gleich. Es gibt keine öffentliche Nutzersuche und keine Anzeige fremder Namen beim Eingeben einer E-Mail.
2. Empfänger sehen eingehende Kontaktanfragen mit dem Vornamen des Absenders. Erst nach Annahme erscheinen beide als Kontakte. Die erste Version zeigt Initialen statt fremder Profilbilder; private Profilbild-Endpunkte bleiben unverändert geschützt.
3. Im Gebäude oben auf das Personen-Symbol tippen, bestätigten Kontakt einladen. Die eingeladene Person nimmt unter Mitteilungen an oder lehnt ab. Eine offene Einladung berechtigt noch nicht zum Lesen von Dateien oder Chat.
4. Angenommene Mitglieder sehen das Gebäude mit „Mit dir geteilt“. Sie können Gebäudenamen/Adresse ändern, Dateien hochladen, ansehen, umbenennen und löschen sowie am Textchat teilnehmen. Nur der Eigentümer kann andere einladen oder entfernen. Mitglieder können selbst austreten. Das Entfernen eines Kontakts beendet keine bestehenden Gebäudefreigaben.
5. Neue Uploads, Chatnachrichten, Kontaktanfragen/-annahmen und Gebäudeeinladungen erzeugen In-App-Mitteilungen. Eigene Aktionen erzeugen keine Meldung an den Handelnden. Meldungen lassen sich als gelesen markieren; Chat-/Dateimeldungen öffnen das passende Gebäude.

## Technischer Vertrag für Benjamin und Emir

Alle Endpunkte unter `/api/v1`, bestehender Header `X-D21-Session`; der Website-Passwortschutz bleibt separat. Ausschließlich parametrisierte SQL-Abfragen und serverseitige Freigabeprüfung, nicht bloß UI-Sperren.

| Methode / Pfad | Funktion |
| --- | --- |
| GET /contacts | Bestätigte Kontakte und eingehende offene Anfragen; `id,user_id,name,status`. Keine E-Mail und keine offene ausgehende Empfängerliste. |
| POST /contacts | `{email}`; allgemeine Antwort `{message}`. Bis 20 Versuche pro Stunde/Konto, auch bei unbekannten Adressen. |
| POST /contacts/:id/accept | Nur die empfangende Person darf annehmen. |
| DELETE /contacts/:id | Eigene Anfrage ablehnen oder Verbindung entfernen. |
| GET /building-invitations | Eigene offene Gebäudeeinladungen. |
| POST /buildings/:id/invitation | `{action:"accept"}` oder `"decline"`; nur Empfänger. |
| GET /buildings/:id/members | Für angenommene Mitglieder; Vornamen und Status owner/pending/accepted. |
| POST /buildings/:id/members | Eigentümer lädt bestätigten Kontakt über `{user_id:"…"}` ein. Maximal 50 Mitglieder. |
| DELETE /buildings/:id/members/:userId | Eigentümer entzieht Zugriff oder Mitglied tritt selbst aus. |
| PATCH /buildings/:id | Angenommene Mitglieder ändern `{name,address}`. |
| GET /buildings/:id/messages | Letzte 50 Nachrichten chronologisch. `?before=<id>` lädt ältere Seiten. |
| POST /buildings/:id/messages | `{text}`, 1–2000 UTF-16-Codeeinheiten. UUID im `X-Request-ID` für wiederholbaren Versand. Gleiche UUID mit anderem Text: 409. Bis 20 Nachrichten pro Minute/Person/Gebäude. |
| GET /notifications | Eigene letzte 200 Mitteilungen, `read_at` ist bei ungelesenen leer. |
| POST /notifications/:id/read | Eigene Mitteilung als gelesen markieren. |

`GET /buildings` enthält eigene und angenommene gemeinsame Gebäude und ergänzt `owner_id,is_owner`; bestehende Felder und Anlage bleiben kompatibel. Die vorhandenen Dokument-Endpunkte prüfen ebenfalls Mitgliedschaft. Gemeinsame Uploads zählen zum **250-MiB-Limit des Gebäudeeigentümers**. Einzelgrenzen bleiben 20 MiB IFC bzw. 25 MiB für andere Dateien. Quota-Eigentümer wird vor dem Gebäude gesperrt; Mitgliedschaft wird unter Sperre erneut geprüft. Textchat und Mitteilung werden in derselben Transaktion gespeichert; bei Fehler keine vorzeitige Erfolgsantwort.

Neue additive Tabellen: `app_contacts`, `app_contact_attempts`, `app_building_members`, `app_messages`, `app_notifications`, mit Fremdschlüsseln und Indizes. Bestehende Gebäude, Konten, Dateien und Passwörter werden nicht ersetzt. Initialisierung ist wiederholbar. Keine vorhandene Tabelle/Spalte löschen; vor Deployment vollständiges Datenbank-Backup erstellen. Rückkehr auf vorherige App-Version erfordert kein Löschen der neuen Tabellen.

## Grenzen dieser Version

- In-App-Aktualisierung: Kontakte/Mitteilungen ca. alle 20 Sekunden bei aktiver App, Chat ca. alle 10 Sekunden im geöffneten Gebäude, zusätzlich manuelles Aktualisieren. Keine Hintergrund-Push-Mitteilungen, Apple-Push-Zertifikate oder Mail-Benachrichtigungen.
- Dateimeldung bedeutet **auf dem Server gespeichert**, keine erfolgreich abgeschlossene IFC-Konvertierung. Einen Server-Verarbeitungsjob mit Fertigmeldungen gibt es noch nicht; dafür keinen Erfolg vortäuschen.
- Textchat ohne Anhänge, Bearbeiten/Löschen, Lesebestätigungen oder Ende-zu-Ende-Verschlüsselung. Transport wie bisher über HTTPS, Speicherung in der Projekt-PostgreSQL-Datenbank. Chatentwurf im Arbeitsspeicher; noch keine Offline-Warteschlange über App-Neustarts hinweg.
- Server prüft neue Datei-/Chat-Anfragen nach Rechteentzug. Bereits heruntergeladene Kopien oder gesehene Nachrichten können nicht zurückgerufen werden.
- Der bestehende umfassende `/twin`-Datensatz für Sensorik, Energie, Regeln und Demo-Import bleibt kontobezogen. Diese Freigaben erweitern zunächst **Gebäudestammdaten, Dokumente/IFC und Chat**, nicht automatisch alle Sensor-/KI-Daten im Web-Dashboard. Die Website erhält in diesem Schritt keine Kontakte-/Chat-Oberfläche.
- Es gibt weiterhin keine verifizierten E-Mail-Adressen: Ein Konto ist noch kein Identitätsnachweis. Vor einer Öffnung außerhalb des Projektteams Mail-Bestätigung und weitere Schutzmechanismen ergänzen. Einladung und Annahme bleiben deshalb zwei explizite Schritte.

## Prüfung

41 Backendtests mit isolierter PostgreSQL-Laufzeit, darunter drei Konten für unerlaubte Zugriffe, Einladungsannahme, Rechteentzug, Besitzer-Quota, Dateiänderungen, Chat-Wiederholung/Pagination, ausschließlich eigene Mitteilungen und Rollback bei fehlgeschlagener Benachrichtigung. Simulator-Build erfolgreich. Sichtbar geprüft: Kontakte mit Initialen/Anfragen, Mitteilungen und direkter Sprung in den Gebäude-Chat anhand expliziter lokaler Debug-Vorschau; diese Daten sind keine echten Nachrichten des Teams. Ein vollständiger Test auf zwei echten iPhones steht aus.
