# Persönlicher Start und Gebäudeassistent

## iPhone-Startseite

Die Begrüßung lautet „Hallo, [Account-Name]“ und verwendet den Namen des angemeldeten Kontos. Der frühere Titel „D21 Gebäude“ und die doppelte Begrüßung entfallen. Oben rechts öffnet ein kleines Profilsymbol das Profil; langes Drücken bietet zusätzlich das Kontextmenü „Profil und Profilbild“. Ohne Bild erscheint ein Personensymbol. Der bisherige Profil-Tab wird durch diesen Zugang ersetzt.

Im Profil kann ein Bild aus der Fotomediathek ausgewählt oder ersetzt werden. Die App bereitet es als JPEG mit maximal 512 Pixeln Kantenlänge vor und speichert es auf dem Projektserver. Der Upload zeigt Fortschritt, Fehler und eine Bestätigung. Ein erfolgreich gespeichertes Bild erscheint sofort im Profilsymbol und wird nach erneuter Anmeldung wieder geladen.

## Gebäude in drei Schritten

1. **Name:** Ein leicht wiedererkennbarer Gebäudename, maximal 200 Zeichen. Ohne Namen ist Weiter deaktiviert.
2. **Adresse:** Optional Straße, Hausnummer und Ort, maximal 500 Zeichen. Zurück zum Namen bleibt möglich. Erst „Weiter zu den Bildern“ legt das Gebäude auf dem Server an.
3. **Bilder:** Gebäude ist jetzt gespeichert. Fotos aus der Mediathek (bis sechs pro Auswahl) oder ein Bild aus Dateien wählen. Die App bereitet Fotos als JPEG mit maximal 2048 Pixeln Kantenlänge vor und lädt sie direkt über die bestehende Datei-API hoch.

Die Schrittanzeige bleibt sichtbar. Übergänge sind animiert; bei reduzierter Bewegung entfällt die Schrittanimation. Während Speichern oder Upload sind doppelte Aktionen und Schließen gesperrt. Erfolgreiche Bilder erscheinen als Vorschau mit „Gespeichert“. Bei teilweise fehlgeschlagenen Uploads bleiben die erfolgreichen erhalten; fehlende können erneut ausgewählt werden.

„Bilder später hinzufügen“ bzw. „Später fortsetzen“ führt zum bereits angelegten Gebäudepass. Vor dem Anlegen können nicht gespeicherte Eingaben nach einer Rückfrage verworfen werden. Der Assistent hat nach erfolgreichem Anlegen keinen Rücksprung zu editierbaren Stammdaten; so wird in seinem normalen Ablauf kein zweites Gebäude angelegt. Ein Netzwerkabbruch unmittelbar nach serverseitigem Speichern kann weiterhin eine unklare Bestätigung erzeugen; echte anfrageübergreifende Idempotenz ist noch nicht implementiert.

Der neue Assistent endet bewusst beim Bilder-Schritt. PDF- und DWG-Pläne sowie weitere Bilder bleiben anschließend über die vorhandenen Gebäudedetails verfügbar. Das Web-Dashboard wird durch diese Oberflächenänderung nicht umgebaut.

## Profilbild-API für Benjamin

| Methode | Pfad | Verhalten |
| --- | --- | --- |
| GET | `/api/v1/profile/avatar` | Eigenes Profilbild als Bilddaten; 404, falls noch keines vorhanden |
| PUT | `/api/v1/profile/avatar` | Eigenes Bild ersetzen; `Content-Type: application/octet-stream`; 200 mit `{ok:true}` |

Authentifizierung unverändert über `X-D21-Session` sowie den vorhandenen Website-Zugang. Es gibt keinen frei wählbaren Nutzerparameter. Binärdaten liegen in der neuen PostgreSQL-Tabelle `app_avatars` mit einer Zeile pro Konto. Ersetzen erfolgt atomar per Upsert. Bilder sind nicht öffentlich abrufbar und werden mit `Cache-Control: private, no-store` ausgeliefert.

Maximal 2 MB pro Profilbild; JPEG, PNG und WebP mit passender Dateikennung. Kein SVG, PDF oder DWG als Avatar. Das Profilbild ist getrennt vom 250-MB-Kontingent für Gebäudedateien begrenzt. Bestehende Konten, Gebäude und Dateien werden nicht verändert oder gelöscht.

## Prüfung

- Regulär signierter Xcode-27.1-Build für iPhone 18 Pro erfolgreich.
- 19 Backendtests mit isolierter PostgreSQL-Laufzeit bestanden: bestehende Konten-/Dateitests plus sechs Profiltests zu Anmeldung, fehlendem Bild, Binärdaten, Kontentrennung, Austausch, Typ-/Größenprüfung und wiederholter Initialisierung.
- Die lokale UI-Vorschau arbeitet mit künstlichem Konto und simuliertem Anlegen, um keine Nutzerdaten zu verändern. Diese Vorschauänderungen werden nicht veröffentlicht.
- Abschließender Test auf Felix’ echtem iPhone bleibt beim Team.
